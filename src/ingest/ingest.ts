import path from "node:path";
import { config } from "@/config";
import { db } from "@/db/client";
import { derive } from "@/derive/pipeline";
import { reindexItem } from "@/search/index-item";
import { nearDuplicates } from "@/search/query";
import { originalKey, sha256, store } from "@/storage/object-store";

/**
 * REF-01 FR-3, FR-5, FR-11, FR-21, FR-22.
 *
 * Takes bytes, and before it returns, those bytes exist in permanent storage
 * under their own hash. Everything after that (tagging, review, search) is
 * recoverable work. Losing it costs an API call. Losing the bytes costs the
 * reference forever, so the bytes are written first.
 */

export type SourceInfo = {
  kind: "instagram" | "pinterest" | "web" | "upload" | "email" | "watch_folder" | "api" | "share";
  sourceUrl?: string;
  externalId?: string;
  authorHandle?: string;
  authorUrl?: string;
  captionText?: string;
  boardName?: string;
  sectionName?: string;
  pageTitle?: string;
};

export type IngestResult = {
  itemId: string;
  assetId: string;
  sha256: string;
  duplicate: boolean;
  variantOf?: string;
  queuedForTagging: boolean;
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".heic": "image/heic", ".tif": "image/tiff", ".tiff": "image/tiff",
};

export async function ingestBuffer(
  buffer: Buffer,
  opts: {
    userId: string;
    filename?: string;
    mime?: string;
    title?: string;
    note?: string;
    source: SourceInfo;
    /** Term ids to apply as human tags on arrival, e.g. a haus. */
    termIds?: string[];
  },
): Promise<IngestResult> {
  const d = await db();
  const ext = path.extname(opts.filename ?? "").toLowerCase();
  const mime = opts.mime ?? MIME_BY_EXT[ext] ?? "application/octet-stream";

  // ---- 1. identity -------------------------------------------------------
  const hash = sha256(buffer);
  const existingAsset = await d.one<{ id: string }>(`SELECT id FROM assets WHERE sha256 = $1`, [hash]);

  // ---- 2. FR-21: identical bytes are one asset, always -------------------
  if (existingAsset) {
    const existingItem = await d.one<{ id: string }>(
      `SELECT id FROM items WHERE asset_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [existingAsset.id],
    );
    if (existingItem) {
      await attachSource(existingItem.id, opts.source);
      await applyHumanTerms(existingItem.id, opts.termIds, opts.userId);
      await reindexItem(existingItem.id);
      return { itemId: existingItem.id, assetId: existingAsset.id, sha256: hash, duplicate: true, queuedForTagging: false };
    }
  }

  // ---- 3. bytes first, and immutably -------------------------------------
  const key = originalKey(hash, ext || mimeToExt(mime));
  await store().put(key, buffer, mime);

  // ---- 4. derivatives (disposable) ---------------------------------------
  const dv = await derive(buffer, hash);

  // ---- 5. records --------------------------------------------------------
  let assetId = existingAsset?.id;
  if (!assetId) {
    const row = await d.one<{ id: string }>(
      `INSERT INTO assets (sha256, storage_key, mime_type, byte_size, width, height, phash, dhash, blurhash, dominant_colors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [hash, key, mime, buffer.byteLength, dv.width, dv.height, dv.phash, dv.dhash, dv.blurhash, JSON.stringify(dv.dominantColors)],
    );
    assetId = row!.id;
  }

  // ---- 6. FR-22 near-duplicate clustering --------------------------------
  let variantOf: string | undefined;
  if (dv.dhash) {
    const near = (await nearDuplicates(dv.dhash, dv.phash, config.nearDuplicateDistance)).filter(
      (n) => n.id !== assetId,
    );
    if (near.length) {
      const canonical = await d.one<{ id: string; width: number | null }>(
        `SELECT i.id, a.width FROM items i JOIN assets a ON a.id = i.asset_id
          WHERE i.asset_id = $1 AND i.deleted_at IS NULL AND i.variant_of IS NULL LIMIT 1`,
        [near[0].id],
      );
      // The higher-resolution copy keeps the canonical slot.
      if (canonical && (canonical.width ?? 0) >= dv.width) variantOf = canonical.id;
    }
  }

  const item = await d.one<{ id: string }>(
    `INSERT INTO items (asset_id, title, note, variant_of, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [assetId, opts.title ?? null, opts.note ?? null, variantOf ?? null, opts.userId],
  );
  const itemId = item!.id;

  await attachSource(itemId, opts.source);
  await applyHumanTerms(itemId, opts.termIds, opts.userId);

  // ---- 7. FR-5: tagging is queued, never awaited on the capture path ------
  await d.query(
    `INSERT INTO ingest_jobs (kind, state, dedupe_key, payload)
     VALUES ('tag', 'queued', $1, $2) ON CONFLICT (dedupe_key) DO NOTHING`,
    [`tag:${itemId}`, JSON.stringify({ itemId })],
  );

  await reindexItem(itemId);
  return { itemId, assetId, sha256: hash, duplicate: false, variantOf, queuedForTagging: true };
}

async function attachSource(itemId: string, s: SourceInfo) {
  const d = await db();
  await d.query(
    `INSERT INTO sources (item_id, kind, source_url, external_id, author_handle, author_url,
                          caption_text, board_name, section_name, page_title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (kind, external_id) DO NOTHING`,
    [itemId, s.kind, s.sourceUrl ?? null, s.externalId ?? null, s.authorHandle ?? null, s.authorUrl ?? null,
     s.captionText ?? null, s.boardName ?? null, s.sectionName ?? null, s.pageTitle ?? null],
  );
}

async function applyHumanTerms(itemId: string, termIds: string[] | undefined, userId: string) {
  if (!termIds?.length) return;
  const d = await db();
  for (const termId of termIds) {
    await d.query(
      `INSERT INTO item_terms (item_id, term_id, confidence, source, set_by)
       VALUES ($1, $2, 1.0, 'human', $3) ON CONFLICT (item_id, term_id) DO NOTHING`,
      [itemId, termId, userId],
    );
  }
}

function mimeToExt(mime: string): string {
  return Object.entries(MIME_BY_EXT).find(([, m]) => m === mime)?.[0] ?? ".bin";
}

/**
 * FR-4 concept form. Fetches a public image URL and ingests it.
 *
 * Deliberately not a logged-in scraper. The browser extension and the phone
 * resolve a post into an image inside the user's own session; this only
 * fetches what a human already had open (REF-01 R-1).
 */
export async function ingestUrl(
  url: string,
  userId: string,
  source: Partial<SourceInfo> = {},
  extra: { termIds?: string[]; note?: string } = {},
): Promise<IngestResult> {
  const res = await fetch(url, {
    headers: { "user-agent": "Palette/0.2 (HAUS private reference library)", accept: "image/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) throw new Error(`not an image: ${contentType || "unknown content-type"}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  return ingestBuffer(buffer, {
    userId,
    filename: new URL(url).pathname.split("/").pop() ?? "clip",
    mime: contentType,
    note: extra.note,
    termIds: extra.termIds,
    source: { kind: source.kind ?? "web", sourceUrl: url, externalId: url, ...source },
  });
}

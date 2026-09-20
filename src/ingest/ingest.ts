import path from "node:path";
import { config } from "@/config";
import { db } from "@/db/client";
import { derive } from "@/derive/pipeline";
import { reindexItem } from "@/search/index-item";
import { nearDuplicates } from "@/search/query";
import { originalKey, sha256, store } from "@/storage/object-store";
import { PREVIEW_UA, previewFromHtml, type PagePreview } from "./page-preview";

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
  /** Groups slides and frames saved from one post, e.g. "ig:CODE". */
  postId?: string;
  /** 1-based position in a multi-image post, and how many the post holds. */
  slideIndex?: number;
  slideCount?: number;
  mediaKind?: "image" | "video_cover" | "video_frame";
  /** Seconds into the video a frame was taken at. */
  frameTimeS?: number;
};

/**
 * One source row per saved slide or frame, so the second slide of a post
 * keeps its provenance instead of colliding with the first. A capture that
 * names no post keeps whatever external id it sent.
 */
export function slideExternalId(s: SourceInfo): string | undefined {
  if (!s.postId) return s.externalId;
  if (s.mediaKind === "video_frame" && s.frameTimeS != null) return `${s.postId}@${s.frameTimeS.toFixed(1)}`;
  if (s.slideIndex != null) return `${s.postId}#${s.slideIndex}`;
  return s.externalId ?? s.postId;
}

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
      // Two slides of one post, or two frames of one video, were each saved on
      // purpose. However alike they look, neither hides the other.
      const postId = opts.source.postId ?? (["instagram", "pinterest"].includes(opts.source.kind) ? opts.source.externalId : undefined);
      const sameBatch = canonical && postId
        ? await d.one(`SELECT 1 AS x FROM sources WHERE item_id = $1 AND post_id = $2 LIMIT 1`, [canonical.id, postId])
        : null;
      // The higher-resolution copy keeps the canonical slot.
      if (canonical && !sameBatch && (canonical.width ?? 0) >= dv.width) variantOf = canonical.id;
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

async function attachSource(itemId: string, s0: SourceInfo) {
  const d = await db();
  // An older extension, or the saved-list scan, names the post only through
  // its external id ("ig:CODE"). For the two sites that have posts, that is
  // the post.
  const s: SourceInfo =
    !s0.postId && s0.externalId && (s0.kind === "instagram" || s0.kind === "pinterest")
      ? { ...s0, postId: s0.externalId }
      : s0;
  await d.query(
    `INSERT INTO sources (item_id, kind, source_url, external_id, author_handle, author_url,
                          caption_text, board_name, section_name, page_title,
                          post_id, slide_index, slide_count, media_kind, frame_time_s)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (kind, external_id) DO NOTHING`,
    [itemId, s.kind, s.sourceUrl ?? null, slideExternalId(s) ?? null, s.authorHandle ?? null, s.authorUrl ?? null,
     s.captionText ?? null, s.boardName ?? null, s.sectionName ?? null, s.pageTitle ?? null,
     s.postId ?? null, s.slideIndex ?? null, s.slideCount ?? null, s.mediaKind ?? "image", s.frameTimeS ?? null],
  );
  // A later save from the same post may be the first to learn how many slides
  // it has (the saved-list scan only ever sees the cover). Tell its siblings.
  if (s.postId && s.slideCount) {
    await d.query(
      `UPDATE sources SET slide_count = $1 WHERE post_id = $2 AND kind = $3 AND (slide_count IS NULL OR slide_count < $1)`,
      [s.slideCount, s.postId, s.kind],
    );
  }
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
  const headers = { "user-agent": PREVIEW_UA, accept: "image/*,text/html;q=0.8" };
  let res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`could not open that link (${res.status})`);
  let contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();

  // A link to a page rather than to a picture: use the preview image the page
  // publishes for exactly this purpose. See page-preview.ts for why this is
  // within R-1.
  let preview: PagePreview | null = null;
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    const html = (await res.text()).slice(0, 1_500_000);
    preview = previewFromHtml(html, res.url || url);
    if (!preview) {
      throw new Error("that page has no preview image. Open it and save with the extension, or share a screenshot.");
    }
    res = await fetch(preview.imageUrl, { headers: { ...headers, accept: "image/*" }, redirect: "follow" });
    if (!res.ok) throw new Error(`the page's preview image would not load (${res.status})`);
    contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  }
  if (!contentType.startsWith("image/")) throw new Error(`not an image: ${contentType || "unknown content-type"}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const given = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined));
  return ingestBuffer(buffer, {
    userId,
    filename: new URL(preview?.imageUrl ?? url).pathname.split("/").pop() ?? "clip",
    mime: contentType,
    title: preview?.title,
    note: extra.note,
    termIds: extra.termIds,
    // What the page says about itself fills the gaps; what the caller knew wins,
    // except that "it came from a share" is less useful than "it came from Instagram".
    source: {
      sourceUrl: url, externalId: url,
      ...preview?.source,
      ...given,
      kind: preview && preview.source.kind !== "web" ? preview.source.kind : (source.kind ?? preview?.source.kind ?? "web"),
    },
  });
}

import path from "node:path";
import { config } from "@/config";
import { db } from "@/db/client";
import { derive } from "@/derive/pipeline";
import { reindexItem } from "@/search/index-item";
import { nearDuplicates } from "@/search/query";
import { originalKey, sha256, store } from "@/storage/object-store";
import { PREVIEW_UA, cleanUrl, embedUrlOf, headline, postIdOf, previewFromHtml, slidesFromEmbed, titleFor, type PagePreview } from "./page-preview";
import { cookieHeader, isTikTokUrl, tikTokFromHtml } from "./tiktok";

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

/** A Reel from the public page is 3 to 15MB. This is a guard against the absurd, not a budget. */
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

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
    /** REF-02. The video this image is the poster of. Kept as its own immutable original. */
    video?: { buffer: Buffer; mime: string; width?: number; height?: number; durationS?: number };
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
      if (opts.video) await attachVideo(existingItem.id, opts.video);
      await joinPost(existingItem.id, opts.source, opts.userId);
      await reindexItem(existingItem.id);
      return { itemId: existingItem.id, assetId: existingAsset.id, sha256: hash, duplicate: true, queuedForTagging: false };
    }
    // Removed earlier (an Undo, a change of mind) and now saved again: it comes
    // back as it was, with its place in its post, rather than as a stranger.
    const removed = await d.one<{ id: string }>(
      `SELECT id FROM items WHERE asset_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`,
      [existingAsset.id],
    );
    if (removed) {
      await d.query(`UPDATE items SET deleted_at = NULL, captured_at = now() WHERE id = $1`, [removed.id]);
      await attachSource(removed.id, opts.source);
      await applyHumanTerms(removed.id, opts.termIds, opts.userId);
      if (opts.video) await attachVideo(removed.id, opts.video);
      await joinPost(removed.id, opts.source, opts.userId);
      await reindexItem(removed.id);
      return { itemId: removed.id, assetId: existingAsset.id, sha256: hash, duplicate: false, queuedForTagging: false };
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
  if (opts.video) await attachVideo(itemId, opts.video);
  await joinPost(itemId, opts.source, opts.userId);

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

  // The same slide arriving again, bigger: a 640px link preview saved last
  // week, and now the full-size image. The new one takes over the old one's
  // place, its human tags and its spots on boards; the old one is kept, as a
  // variant, because nothing a person saved is ever thrown away.
  const extId = slideExternalId(s);
  if (extId) {
    const prior = await d.one<{ item_id: string; old_w: number | null; new_w: number | null }>(
      `SELECT s.item_id,
              (SELECT a.width FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = s.item_id) AS old_w,
              (SELECT a.width FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = $3) AS new_w
         FROM sources s WHERE s.kind = $1 AND s.external_id = $2 AND s.item_id <> $3`,
      [s.kind, extId, itemId],
    );
    if (prior && (prior.new_w ?? 0) > (prior.old_w ?? 0)) await supersede(prior.item_id, itemId);
  }
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

/**
 * REF-02. A video is kept the way an image is: the untouched bytes, under
 * their own hash, immutable, covered by the integrity scrub. It has no
 * derivatives; the item's image asset is its poster.
 */
async function attachVideo(itemId: string, v: NonNullable<Parameters<typeof ingestBuffer>[1]["video"]>) {
  const d = await db();
  const hash = sha256(v.buffer);
  let asset = await d.one<{ id: string }>(`SELECT id FROM assets WHERE sha256 = $1`, [hash]);
  if (!asset) {
    const key = originalKey(hash, v.mime === "video/webm" ? ".webm" : ".mp4");
    await store().put(key, v.buffer, v.mime);
    asset = await d.one<{ id: string }>(
      `INSERT INTO assets (sha256, storage_key, mime_type, byte_size, width, height, duration_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [hash, key, v.mime, v.buffer.byteLength, v.width ?? null, v.height ?? null, v.durationS ?? null],
    );
  }
  await d.query(`UPDATE items SET video_asset_id = $2 WHERE id = $1 AND video_asset_id IS NULL`, [itemId, asset!.id]);
}

/**
 * REF-02. Everything saved from one post is one thing to the person looking
 * at the library. The first member to arrive leads; later ones join it. What
 * a person attached at save time (the haus) goes to the lead, because that is
 * where the post's tags live.
 */
async function joinPost(itemId: string, s: SourceInfo, userId: string) {
  const postId = s.postId ?? (["instagram", "pinterest"].includes(s.kind) ? s.externalId : undefined);
  if (!postId) return;
  const d = await db();
  const mine = await d.one<{ group_id: string | null; variant_of: string | null }>(
    `SELECT group_id, variant_of FROM items WHERE id = $1`, [itemId]);
  if (!mine || mine.group_id || mine.variant_of) return;

  const lead = await d.one<{ group_id: string }>(
    `SELECT i.group_id FROM sources so JOIN items i ON i.id = so.item_id
      WHERE so.kind = $1 AND so.post_id = $2 AND i.id <> $3
        AND i.group_id IS NOT NULL AND i.deleted_at IS NULL LIMIT 1`,
    [s.kind, postId, itemId],
  );
  const pos = s.slideIndex ?? (s.mediaKind === "video_frame" ? 1000 + Math.round(s.frameTimeS ?? 0) : 1);
  if (!lead) {
    await d.query(`UPDATE items SET group_id = id, group_pos = $2, is_cover = true WHERE id = $1`, [itemId, pos]);
    return;
  }
  await d.query(`UPDATE items SET group_id = $2, group_pos = $3 WHERE id = $1`, [itemId, lead.group_id, pos]);
  await d.query(
    `INSERT INTO item_terms (item_id, term_id, confidence, source, set_by)
     SELECT $2, term_id, 1.0, 'human', COALESCE(set_by, $3) FROM item_terms
      WHERE item_id = $1 AND source = 'human' AND NOT rejected
     ON CONFLICT (item_id, term_id) DO NOTHING`,
    [itemId, lead.group_id, userId],
  );
  await reindexItem(lead.group_id);
}

/** The better copy of the same picture takes over everything a person attached to the old one. */
async function supersede(oldId: string, newId: string) {
  const d = await db();
  await d.transaction(async (tx) => {
    await tx.query(`UPDATE sources SET item_id = $2 WHERE item_id = $1`, [oldId, newId]);
    await tx.query(
      `INSERT INTO item_terms (item_id, term_id, confidence, source, set_by, rejected)
       SELECT $2, term_id, confidence, source, set_by, rejected FROM item_terms WHERE item_id = $1 AND source = 'human'
       ON CONFLICT (item_id, term_id) DO NOTHING`,
      [oldId, newId],
    );
    await tx.query(
      `UPDATE board_items SET item_id = $2 WHERE item_id = $1
         AND NOT EXISTS (SELECT 1 FROM board_items b2 WHERE b2.board_id = board_items.board_id AND b2.item_id = $2)`,
      [oldId, newId],
    );
    await tx.query(
      `UPDATE items n SET note = COALESCE(n.note, o.note), rating = COALESCE(n.rating, o.rating), is_hero = n.is_hero OR o.is_hero
         FROM items o WHERE n.id = $2 AND o.id = $1`,
      [oldId, newId],
    );
    // Its place in the post too: lead, cover and position all pass to the better copy.
    const old = (await tx.query<{ group_id: string | null; group_pos: number | null; is_cover: boolean }>(
      `SELECT group_id, group_pos, is_cover FROM items WHERE id = $1`, [oldId]))[0];
    if (old?.group_id) {
      const wasLead = old.group_id === oldId;
      await tx.query(`UPDATE items SET group_id = $2, group_pos = $3, is_cover = $4 WHERE id = $1`,
        [newId, wasLead ? newId : old.group_id, old.group_pos, old.is_cover]);
      if (wasLead) await tx.query(`UPDATE items SET group_id = $2 WHERE group_id = $1 AND id <> $1`, [oldId, newId]);
      await tx.query(`UPDATE items SET group_id = NULL, is_cover = false WHERE id = $1`, [oldId]);
    }
    await tx.query(`UPDATE items SET variant_of = $2 WHERE id = $1`, [oldId, newId]);
  });
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
  const all = await ingestLink(url, userId, source, extra);
  return all[0]!;
}

/**
 * A pasted or shared link, saved as fully as a link allows. For an Instagram
 * post that is every image in it at full size, read from the public embed
 * view; for anything else, the one image the link or its page points at.
 * Always returns at least one result or throws with words a person can act on.
 */
export async function ingestLink(
  url: string,
  userId: string,
  source: Partial<SourceInfo> = {},
  extra: { termIds?: string[]; note?: string } = {},
): Promise<IngestResult[]> {
  if (isTikTokUrl(url)) {
    try {
      const whole = await ingestTikTok(url, userId, extra);
      if (whole.length) return whole;
    } catch {
      /* fall through to the preview image */
    }
  }

  const embedUrl = embedUrlOf(url);
  if (embedUrl) {
    try {
      const whole = await ingestWholePost(url, embedUrl, userId, extra);
      if (whole.length) return whole;
    } catch {
      /* fall through to the single preview image */
    }
  }
  return [await ingestOne(url, userId, source, extra)];
}

/** A TikTok post, whole: the video with its cover, or every picture of a photo post. See tiktok.ts for how and why. */
async function ingestTikTok(
  url: string,
  userId: string,
  extra: { termIds?: string[]; note?: string },
): Promise<IngestResult[]> {
  const headers = { "user-agent": PREVIEW_UA };
  const page = await fetch(url, { headers, redirect: "follow" });
  if (!page.ok) return [];
  const post = tikTokFromHtml((await page.text()).slice(0, 4_000_000));
  if (!post) return [];

  // The file servers want the visitor cookie this page just set, and the page as referrer.
  const withCookie = { ...headers, cookie: cookieHeader(page), referer: "https://www.tiktok.com/" };
  const clean = cleanUrl(page.url || url);
  const source = {
    kind: "web" as const,
    sourceUrl: clean,
    postId: `tt:${post.id}`,
    authorHandle: post.author,
    captionText: post.caption?.slice(0, 2000),
  };
  const title = titleFor(post.caption ? headline(post.caption.replace(/#\S+/g, " ").replace(/\s+/g, " ").trim()) : undefined, post.author, !!post.video);

  const image = async (src: string) => {
    const r = await fetch(src, { headers: { ...withCookie, accept: "image/*" } });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    return r.ok && type.startsWith("image/") ? { buffer: Buffer.from(await r.arrayBuffer()), type } : null;
  };

  const results: IngestResult[] = [];
  if (post.video) {
    const cover = post.video.cover ? await image(post.video.cover) : null;
    if (!cover) return [];
    let video: Parameters<typeof ingestBuffer>[1]["video"];
    try {
      const vr = await fetch(post.video.url, { headers: withCookie });
      const vt = (vr.headers.get("content-type") ?? "").split(";")[0].trim();
      if (vr.ok && vt.startsWith("video/") && Number(vr.headers.get("content-length") ?? 0) < MAX_VIDEO_BYTES) {
        video = { buffer: Buffer.from(await vr.arrayBuffer()), mime: vt, width: post.video.width, height: post.video.height, durationS: post.video.durationS };
      }
    } catch { /* keep the cover */ }
    results.push(await ingestBuffer(cover.buffer, {
      userId, filename: `tiktok-${post.id}.jpg`, mime: cover.type, title, note: extra.note, termIds: extra.termIds, video,
      source: { ...source, mediaKind: "video_cover" },
    }));
    return results;
  }

  for (const [i, pic] of post.images.entries()) {
    const got = await image(pic.url);
    if (!got) continue;
    results.push(await ingestBuffer(got.buffer, {
      userId, filename: `tiktok-${post.id}-${i + 1}.jpg`, mime: got.type, title, note: extra.note, termIds: extra.termIds,
      source: { ...source, slideIndex: post.images.length > 1 ? i + 1 : undefined, slideCount: post.images.length > 1 ? post.images.length : undefined, mediaKind: "image" },
    }));
  }
  return results;
}

async function ingestWholePost(
  url: string,
  embedUrl: string,
  userId: string,
  extra: { termIds?: string[]; note?: string },
): Promise<IngestResult[]> {
  const headers = { "user-agent": PREVIEW_UA };
  const [embedRes, pageRes] = await Promise.all([
    fetch(embedUrl, { headers, redirect: "follow" }),
    fetch(url, { headers, redirect: "follow" }).catch(() => null),
  ]);
  if (!embedRes.ok) return [];
  const { slides, author } = slidesFromEmbed((await embedRes.text()).slice(0, 3_000_000));
  if (!slides.length) return [];

  // The ordinary page supplies the caption and a title; the embed supplies the pictures.
  const preview = pageRes?.ok ? previewFromHtml((await pageRes.text()).slice(0, 1_500_000), url) : null;
  const postId = postIdOf(url)!;
  const clean = cleanUrl(url);

  const results: IngestResult[] = [];
  for (const [i, slide] of slides.entries()) {
    const img = await fetch(slide.url, { headers: { ...headers, accept: "image/*" } });
    const type = (img.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!img.ok || !type.startsWith("image/")) continue;

    // The file's address expires within hours, so it is fetched now or never.
    // A video Palette cannot get is still saved, as its cover (REF-02 decision 3).
    let video: Parameters<typeof ingestBuffer>[1]["video"];
    if (slide.videoUrl) {
      try {
        const vr = await fetch(slide.videoUrl, { headers });
        const vt = (vr.headers.get("content-type") ?? "").split(";")[0].trim();
        const size = Number(vr.headers.get("content-length") ?? 0);
        if (vr.ok && vt.startsWith("video/") && size < MAX_VIDEO_BYTES) {
          video = { buffer: Buffer.from(await vr.arrayBuffer()), mime: vt, width: slide.width, height: slide.height, durationS: slide.durationS };
        }
      } catch { /* keep the cover */ }
    }

    results.push(
      await ingestBuffer(Buffer.from(await img.arrayBuffer()), {
        userId,
        video,
        filename: new URL(slide.url).pathname.split("/").pop() ?? `slide-${i + 1}.jpg`,
        mime: type,
        title: titleFor(preview?.title, author ?? preview?.source.authorHandle, slides.some((s) => s.isVideo)),
        note: extra.note,
        termIds: extra.termIds,
        source: {
          kind: "instagram",
          sourceUrl: clean,
          postId,
          slideIndex: slides.length > 1 ? i + 1 : undefined,
          slideCount: slides.length > 1 ? slides.length : undefined,
          mediaKind: slide.isVideo ? "video_cover" : "image",
          authorHandle: author ?? preview?.source.authorHandle,
          captionText: preview?.source.captionText,
          pageTitle: preview?.source.pageTitle,
        },
      }),
    );
  }
  return results;
}

async function ingestOne(
  url: string,
  userId: string,
  source: Partial<SourceInfo>,
  extra: { termIds?: string[]; note?: string },
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

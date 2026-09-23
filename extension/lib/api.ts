import type { Candidate, PageInfo } from "./resolve";
import { externalIdFor, filenameFor } from "./resolve";
import { getSettings, configured } from "./settings";

/**
 * Talks to Palette's /api/ingest with the person's device token. Runs in the
 * background worker, which has host permissions, so the image fetch carries
 * the person's own cookies and the upload is not subject to page CORS.
 */

export type SaveResult =
  | { ok: true; saved: number; duplicates: number; variants: number; itemId: string | null }
  | { ok: false; error: string };

async function auth() {
  const s = await getSettings();
  if (!configured(s)) throw new Error("Palette is not set up. Open the extension options and add your host and token.");
  return s;
}

export async function whoAmI(): Promise<{ email: string; name: string | null; role: string }> {
  const s = await auth();
  const res = await fetch(`${s.host}/api/me`, { headers: { authorization: `Bearer ${s.token}` } });
  if (!res.ok) throw new Error(res.status === 401 ? "token rejected" : `HTTP ${res.status}`);
  return res.json();
}

export async function hauses(): Promise<Array<{ slug: string; label: string }>> {
  const s = await auth();
  const res = await fetch(`${s.host}/api/taxonomy`, { headers: { authorization: `Bearer ${s.token}` } });
  if (!res.ok) return [];
  const json = (await res.json()) as { facets: Array<{ key: string; terms: Array<{ slug: string; label: string }> }> };
  return json.facets.find((f) => f.key === "project")?.terms ?? [];
}

/**
 * Fetch the image in the browser (own session, own cookies) and hand the
 * bytes to Palette with full provenance. If the fetch is refused, fall back
 * to sending the URL and let the server try, which it will do politely.
 */
export async function saveCandidate(
  c: Candidate,
  page: Pick<PageInfo, "url" | "title" | "site" | "author" | "caption" | "board">,
  opts: { haus?: string; note?: string } = {},
): Promise<SaveResult> {
  const s = await auth();
  const fd = provenance(c, page, opts);

  let fetched = false;
  try {
    const img = await fetch(c.src, { credentials: "include" });
    if (img.ok && (img.headers.get("content-type") ?? "").startsWith("image/")) {
      fd.append("files", await img.blob(), filenameFor(c.src));
      fetched = true;
    }
  } catch {
    /* fall through to url */
  }
  if (!fetched) fd.append("url", c.src);
  return send(s, fd);
}

/** A frame captured from the screen: the bytes are already in hand. */
export async function saveBlob(
  blob: Blob,
  filename: string,
  c: Omit<Candidate, "src" | "width" | "height">,
  page: Pick<PageInfo, "url" | "title" | "site" | "author" | "caption" | "board">,
  opts: { haus?: string; note?: string } = {},
): Promise<SaveResult> {
  const s = await auth();
  const fd = provenance(c, page, opts);
  fd.append("files", blob, filename);
  return send(s, fd);
}

/**
 * Where it came from. The post id groups every slide and frame saved from one
 * post; the server makes the per-slide id from it, so a second slide never
 * collides with the first.
 */
function provenance(
  c: Pick<Candidate, "postUrl" | "slideIndex" | "slideCount" | "mediaKind" | "frameTimeS">,
  page: Pick<PageInfo, "url" | "title" | "site" | "author" | "caption" | "board">,
  opts: { haus?: string; note?: string },
): FormData {
  const postUrl = c.postUrl ?? page.url;
  const postId = externalIdFor(page.site, postUrl);
  const fd = new FormData();
  fd.append("source_kind", page.site);
  fd.append("source_url", postUrl);
  fd.append("external_id", postId ?? `${page.site}:${postUrl}`);
  if (postId) fd.append("post_id", postId);
  if (c.slideIndex) fd.append("slide_index", String(c.slideIndex));
  if (c.slideCount) fd.append("slide_count", String(c.slideCount));
  if (c.mediaKind) fd.append("media_kind", c.mediaKind);
  if (c.frameTimeS != null) fd.append("frame_time_s", c.frameTimeS.toFixed(1));
  if (page.author) fd.append("author_handle", page.author);
  if (page.caption) fd.append("caption_text", page.caption);
  if (page.board) fd.append("board_name", page.board);
  if (page.title) fd.append("page_title", page.title);
  if (opts.haus) fd.append("haus", opts.haus);
  if (opts.note) fd.append("note", opts.note);
  return fd;
}

async function send(s: { host: string; token: string }, fd: FormData): Promise<SaveResult> {
  const res = await fetch(`${s.host}/api/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.token}` },
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    saved?: number; duplicates?: number; variants?: number; itemId?: string | null; error?: string; errors?: string[];
  };
  if (!res.ok) return { ok: false, error: json.error ?? json.errors?.[0] ?? `HTTP ${res.status}` };
  if ((json.saved ?? 0) + (json.duplicates ?? 0) + (json.variants ?? 0) === 0) {
    return { ok: false, error: json.errors?.[0] ?? "nothing saved" };
  }
  return { ok: true, saved: json.saved ?? 0, duplicates: json.duplicates ?? 0, variants: json.variants ?? 0, itemId: json.itemId ?? null };
}

/** The cover and the video file together, as one post. The server keeps both. */
export async function saveVideo(
  poster: Blob,
  video: Blob,
  meta: { width?: number; height?: number; seconds?: number },
  page: Pick<PageInfo, "url" | "title" | "site" | "author" | "caption" | "board" | "externalId">,
  opts: { haus?: string; note?: string } = {},
): Promise<SaveResult> {
  const s = await auth();
  const fd = provenance({ mediaKind: "video_cover" }, page, opts);
  const id = (page.externalId ?? "video").replace(/[^A-Za-z0-9_-]+/g, "-");
  fd.append("files", poster, `${id}-cover.jpg`);
  fd.append("video", video, `${id}.${video.type === "video/webm" ? "webm" : "mp4"}`);
  if (meta.width) fd.append("video_width", String(meta.width));
  if (meta.height) fd.append("video_height", String(meta.height));
  if (meta.seconds) fd.append("video_seconds", meta.seconds.toFixed(1));
  return send(s, fd);
}

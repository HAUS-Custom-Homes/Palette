/**
 * TikTok, the same way as Instagram: what the public page gives any visitor,
 * signed out. The page carries the post as JSON (caption, author, cover, the
 * video's renditions, or the pictures of a photo post). The video file is
 * served only to a visitor holding the anonymous cookie that same page sets
 * for everyone, so the cookie from the page request rides along on the file
 * request. It is a visitor cookie, not an account: nobody is logged in, and
 * nobody's credentials are involved (REF-01 R-1).
 *
 * File addresses expire within hours, so everything is fetched at save time.
 */

export type TikTokPost = {
  id: string;
  author?: string;
  caption?: string;
  /** Present for a video post. */
  video?: { url: string; width?: number; height?: number; durationS?: number; cover?: string };
  /** Present for a photo post ("photo mode"): every picture, in order. */
  images: Array<{ url: string; width?: number; height?: number }>;
};

/** tiktok.com/@name/video/123, /photo/123, and the short links the app shares (vm.tiktok.com/x, tiktok.com/t/x). */
export function isTikTokUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h === "tiktok.com" || h.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

export function tikTokIdOf(url: string): string | undefined {
  try {
    return /\/(?:video|photo)\/(\d{6,})/.exec(new URL(url).pathname)?.[1];
  } catch {
    return undefined;
  }
}

type Rendition = { Bitrate?: number; CodecType?: string; PlayAddr?: { UrlList?: string[]; Width?: number; Height?: number } };

/** Pure: the page's HTML in, the post out. Null when the page has no post in it (private, removed, or a changed page). */
export function tikTokFromHtml(html: string): TikTokPost | null {
  const raw = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) return null;
  let item: Record<string, unknown> | undefined;
  try {
    const scope = (JSON.parse(raw) as { __DEFAULT_SCOPE__?: Record<string, { itemInfo?: { itemStruct?: Record<string, unknown> } }> }).__DEFAULT_SCOPE__;
    item = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  } catch {
    return null;
  }
  if (!item || typeof item.id !== "string") return null;

  const author = (item.author as { uniqueId?: string } | undefined)?.uniqueId;
  const caption = typeof item.desc === "string" ? item.desc.trim() : undefined;

  const photo = item.imagePost as { images?: Array<{ imageURL?: { urlList?: string[] }; imageWidth?: number; imageHeight?: number }> } | undefined;
  const images = (photo?.images ?? [])
    .map((i) => ({ url: i.imageURL?.urlList?.[0] ?? "", width: i.imageWidth, height: i.imageHeight }))
    .filter((i) => /^https:\/\//.test(i.url))
    .slice(0, 35);

  const v = item.video as
    | { playAddr?: string; cover?: string; originCover?: string; width?: number; height?: number; duration?: number; bitrateInfo?: Rendition[] }
    | undefined;
  let video: TikTokPost["video"];
  if (!images.length && v) {
    // The best H.264 rendition: it plays in every browser, which H.265 does not.
    const h264 = (v.bitrateInfo ?? [])
      .filter((b) => (b.CodecType ?? "").startsWith("h264") && b.PlayAddr?.UrlList?.[0])
      .sort((a, b) => (b.Bitrate ?? 0) - (a.Bitrate ?? 0))[0];
    const url = h264?.PlayAddr?.UrlList?.[0] ?? v.playAddr ?? "";
    if (/^https:\/\//.test(url)) {
      video = {
        url,
        width: h264?.PlayAddr?.Width ?? v.width,
        height: h264?.PlayAddr?.Height ?? v.height,
        durationS: v.duration,
        cover: v.originCover || v.cover || undefined,
      };
    }
  }
  if (!video && !images.length) return null;
  return { id: item.id, author, caption: caption || undefined, video, images };
}

/** The cookies a response set, as a request header. */
export function cookieHeader(res: Response): string {
  const all = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return all.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

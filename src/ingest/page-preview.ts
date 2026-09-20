import type { SourceInfo } from "./ingest";

/**
 * A pasted link is usually a page, not an image. Every public page that wants
 * to look good in iMessage or Slack publishes Open Graph tags, and reading
 * them is what a link preview does: one signed-out request, identified as
 * Palette, no cookies, no login. That keeps it on the right side of REF-01
 * R-1, which forbids acting as a person on Instagram or Pinterest, not
 * reading what those sites publish to everyone.
 *
 * What it cannot do is see past the first image of a multi-image post or
 * take a frame from a video. The extension does that, in the person's own
 * browser. So a link save is marked as the post's cover and the item page
 * offers the way to the rest.
 */

export const PREVIEW_UA = "Mozilla/5.0 (compatible; PaletteBot/1.0; +https://hauspalette.com; link preview)";

export type PagePreview = {
  imageUrl: string;
  source: Partial<SourceInfo> & { kind: SourceInfo["kind"] };
  title?: string;
};

const TRACKING = /^(utm_|igsh|igshid|stkn|fbclid|img_index|hl$|ref$|share)/i;

/** The link without the parts that only identify who shared it. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** <meta property="og:x" content="..."> in either attribute order. */
export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1];
    if (key && content && !(key in out)) out[key] = decode(content);
  }
  return out;
}

function siteOf(url: string): SourceInfo["kind"] {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
    if (h === "pin.it" || /(^|\.)pinterest\.[a-z.]+$/.test(h)) return "pinterest";
  } catch { /* not a url */ }
  return "web";
}

/** The same ids the extension sends, so a link save and an extension save of one post meet. */
export function postIdOf(url: string): string | undefined {
  try {
    const p = new URL(url).pathname;
    const ig = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(p);
    if (siteOf(url) === "instagram" && ig) return `ig:${ig[1]}`;
    const pin = /\/pin\/(\d+)/.exec(p);
    if (siteOf(url) === "pinterest" && pin) return `pin:${pin[1]}`;
  } catch { /* fall through */ }
  return undefined;
}

/** A caption is a paragraph; a title is its first sentence, or its first ninety characters at a word. */
export function headline(text: string): string {
  const first = /^(.{12,100}?[.?!])(\s|$)/.exec(text)?.[1];
  if (first) return first;
  if (text.length <= 90) return text;
  return `${text.slice(0, 90).replace(/\s+\S*$/, "")}...`;
}

/** Pure: a page's HTML and address in, what to fetch and how to credit it out. */
export function previewFromHtml(html: string, pageUrl: string): PagePreview | null {
  const m = metaTags(html);
  const image = m["og:image:secure_url"] ?? m["og:image"] ?? m["twitter:image"] ?? m["twitter:image:src"];
  if (!image) return null;

  const url = cleanUrl(pageUrl);
  const kind = siteOf(url);
  const canonical = m["og:url"] ? cleanUrl(m["og:url"]) : url;
  const postId = postIdOf(url) ?? postIdOf(canonical);
  const isVideo = /^video/i.test(m["og:type"] ?? "") || "og:video" in m || /\/(reel|reels|tv)\//.test(new URL(url).pathname);

  let author: string | undefined;
  if (kind === "instagram") {
    // og:url is https://www.instagram.com/<handle>/p/<code>/ for a public post.
    author = /instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel|reels|tv)\//.exec(canonical)?.[1]
      ?? /-\s*([A-Za-z0-9._]+) on [A-Z][a-z]+ \d/.exec(m["og:description"] ?? "")?.[1];
  }

  // "Name on Instagram: "the caption"" reads better as just the caption.
  const rawTitle = m["og:title"] ?? "";
  const quoted = /:\s*["“](.+?)["”]?\s*$/s.exec(rawTitle)?.[1];
  const title = headline((quoted ?? rawTitle).replace(/\s+/g, " ").trim()) || undefined;

  return {
    imageUrl: new URL(image, url).href,
    title,
    source: {
      kind,
      sourceUrl: url,
      externalId: postId ?? url,
      postId,
      // A link only ever reaches a post's first image.
      slideIndex: postId && !isVideo ? 1 : undefined,
      mediaKind: isVideo ? "video_cover" : "image",
      authorHandle: author,
      captionText: (m["og:description"] ?? "").slice(0, 2000) || undefined,
      pageTitle: rawTitle.slice(0, 300) || undefined,
    },
  };
}

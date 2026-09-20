/**
 * Pure functions. No DOM, no browser APIs, so they run under vitest and the
 * content script and the background can both trust them.
 */

export type Site = "instagram" | "pinterest" | "web";

export type Candidate = {
  /** The best URL we found for the image, largest srcset entry if any. */
  src: string;
  width: number;
  height: number;
  alt?: string;
  /** The post or pin this image belongs to, when it is inside a link. */
  postUrl?: string;
  /** 1-based position in a multi-image post, and how many it holds. */
  slideIndex?: number;
  slideCount?: number;
  /** "video_cover" for a video's poster image. Frames are captured, not fetched. */
  mediaKind?: "image" | "video_cover" | "video_frame";
  frameTimeS?: number;
};

/** What kind of post the open page is, as far as the page itself can tell. */
export type PostShape = {
  /** More than one slide: there is a "next" control. */
  carousel: boolean;
  slideIndex?: number;
  slideCount?: number;
  /** A video is on screen. */
  video?: { timeS: number; paused: boolean; poster?: string; rect: Rect };
};

export type Rect = { x: number; y: number; width: number; height: number };

export type PageInfo = {
  url: string;
  title: string;
  site: Site;
  externalId?: string;
  author?: string;
  caption?: string;
  board?: string;
  ogImage?: string;
  candidates: Candidate[];
  /** True for a page that lists many saves (Instagram saved, a Pinterest board). */
  isCollection: boolean;
  /** Present on a single post's page. */
  post?: PostShape;
};

/**
 * Carousel position from the row of indicator dots. Sites restyle these
 * constantly, so the only thing relied on is that exactly one dot is styled
 * differently from the rest. Returns a 1-based index, or undefined when the
 * row does not look like that.
 */
export function oddOneOut(classes: string[]): number | undefined {
  if (classes.length < 2) return undefined;
  const counts = new Map<string, number>();
  for (const c of classes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const singles = [...counts.entries()].filter(([, n]) => n === 1).map(([c]) => c);
  // Two dots are both "the only one of their kind", so they say nothing.
  if (singles.length !== 1 || counts.size !== 2) return undefined;
  return classes.indexOf(singles[0]!) + 1;
}

/**
 * Where a page element sits inside a screenshot of the visible tab. The
 * screenshot is in device pixels and the rect is in CSS pixels; the result is
 * clamped to the image, and null when nothing useful is left.
 */
export function cropFor(rect: Rect, dpr: number, imageW: number, imageH: number): Rect | null {
  const x = Math.max(0, Math.round(rect.x * dpr));
  const y = Math.max(0, Math.round(rect.y * dpr));
  const right = Math.min(imageW, Math.round((rect.x + rect.width) * dpr));
  const bottom = Math.min(imageH, Math.round((rect.y + rect.height) * dpr));
  const width = right - x;
  const height = bottom - y;
  return width >= 150 && height >= 150 ? { x, y, width, height } : null;
}

export function siteFor(url: string): Site {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
    if (h === "pinterest.com" || /(^|\.)pinterest\.[a-z.]+$/.test(h) || h === "pin.it") return "pinterest";
  } catch {
    /* not a url */
  }
  return "web";
}

/** A stable id per source so the same post saved twice is one provenance row. */
export function externalIdFor(site: Site, url: string): string | undefined {
  try {
    const p = new URL(url).pathname;
    if (site === "instagram") {
      const m = p.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
      if (m) return `ig:${m[1]}`;
    }
    if (site === "pinterest") {
      const m = p.match(/\/pin\/(\d+)/);
      if (m) return `pin:${m[1]}`;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/** Instagram /<user>/saved/... or a Pinterest board page (not a single pin). */
export function isCollectionPage(site: Site, url: string): boolean {
  try {
    const p = new URL(url).pathname;
    if (site === "instagram") return /^\/[^/]+\/saved(\/|$)/.test(p);
    if (site === "pinterest") {
      const parts = p.split("/").filter(Boolean);
      return parts.length >= 2 && parts[0] !== "pin" && parts[0] !== "search" && parts[0] !== "ideas";
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** "a.jpg 640w, b.jpg 1080w" -> the entry with the largest width. */
export function largestFromSrcset(srcset: string | null | undefined): { src: string; width: number } | null {
  if (!srcset) return null;
  let best: { src: string; width: number } | null = null;
  for (const part of srcset.split(",")) {
    const [src, desc] = part.trim().split(/\s+/);
    if (!src) continue;
    const w = desc?.endsWith("w") ? parseInt(desc, 10) : desc?.endsWith("x") ? Math.round(parseFloat(desc) * 1000) : 0;
    if (!best || w > best.width) best = { src, width: w };
  }
  return best;
}

const BAD_SRC = /^(data:|blob:)|\.svg(\?|$)|\/emoji\/|sprite|spacer|pixel|avatar|profile_pic|\/s150x150\//i;

/** Drop icons, avatars and tracking pixels. */
export function plausible(c: Candidate): boolean {
  if (!c.src || BAD_SRC.test(c.src)) return false;
  if (c.width && c.height && (c.width < 150 || c.height < 150)) return false;
  return true;
}

/** Largest plausible image wins. og:image breaks ties when present. */
export function pickBest(candidates: Candidate[], ogImage?: string): Candidate | null {
  const ok = candidates.filter(plausible);
  if (ogImage) {
    const hit = ok.find((c) => c.src === ogImage);
    if (hit) return hit;
  }
  return ok.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

/** Collapse a collection scan to one candidate per post, keeping the largest. */
export function dedupeByPost(candidates: Candidate[]): Candidate[] {
  const byPost = new Map<string, Candidate>();
  for (const c of candidates) {
    if (!plausible(c)) continue;
    const key = c.postUrl ?? c.src;
    const cur = byPost.get(key);
    if (!cur || c.width * c.height > cur.width * cur.height) byPost.set(key, c);
  }
  return [...byPost.values()];
}

/** A filename the server can take an extension from. */
export function filenameFor(src: string, fallback = "clip.jpg"): string {
  try {
    const last = new URL(src).pathname.split("/").filter(Boolean).pop() ?? "";
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(last)) return last;
    return last ? `${last}.jpg` : fallback;
  } catch {
    return fallback;
  }
}

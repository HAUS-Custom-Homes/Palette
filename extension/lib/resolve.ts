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
};

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
};

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

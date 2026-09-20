import type { Candidate, PageInfo, PostShape, Rect } from "../lib/resolve";
import { dedupeByPost, externalIdFor, isCollectionPage, largestFromSrcset, oddOneOut, plausible, siteFor } from "../lib/resolve";

/**
 * Reads the page the person has open. Nothing here talks to the network; it
 * describes what is on screen and hands that to the popup or background.
 *
 * Site adapters are deliberately thin and lean on Open Graph tags, which
 * survive Instagram's and Pinterest's DOM churn far better than selectors.
 * The collection scan uses the one thing both sites keep stable: an <img>
 * inside an <a> that links to a post or a pin.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((msg: { type: string }, _sender, sendResponse) => {
      if (msg.type === "inspect") {
        sendResponse(inspect());
        return true;
      }
      if (msg.type === "scan-collection") {
        scanCollection().then(sendResponse);
        return true;
      }
      if (msg.type === "collect-slides") {
        collectSlides().then(sendResponse);
        return true;
      }
      if (msg.type === "prepare-frame") {
        sendResponse(prepareFrame());
        return true;
      }
      if (msg.type === "restore-frame") {
        restoreFrame();
        sendResponse(true);
        return true;
      }
      return false;
    });
  },
});

const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content?.trim() || undefined;

function candidateFrom(img: HTMLImageElement): Candidate | null {
  const best = largestFromSrcset(img.getAttribute("srcset"));
  const src = best?.src ?? img.currentSrc ?? img.src;
  if (!src) return null;
  const rect = img.getBoundingClientRect();
  const width = Math.max(img.naturalWidth || 0, best?.width || 0, Math.round(rect.width));
  const height = Math.max(img.naturalHeight || 0, Math.round(rect.height));
  const link = img.closest<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"], a[href*="/pin/"]');
  return {
    src: new URL(src, location.href).href,
    width,
    height,
    alt: img.alt || undefined,
    postUrl: link ? new URL(link.getAttribute("href")!, location.href).href : undefined,
  };
}

function inspect(): PageInfo {
  const url = location.href;
  const site = siteFor(url);
  const candidates = [...document.images].map(candidateFrom).filter((c): c is Candidate => !!c);

  const ogTitle = meta('meta[property="og:title"]');
  const description = meta('meta[property="og:description"]') ?? meta('meta[name="description"]');

  let author: string | undefined;
  let board: string | undefined;
  if (site === "instagram") {
    // og:title looks like "Name (@handle) • Instagram photos and videos" or "Name on Instagram: ..."
    author = ogTitle?.match(/\(@([A-Za-z0-9._]+)\)/)?.[1] ?? ogTitle?.match(/^([^:]+?) on Instagram/)?.[1];
  } else if (site === "pinterest") {
    author = meta('meta[name="pinterestapp:pinner"]') ?? meta('meta[property="og:site_name"]') === "Pinterest" ? undefined : undefined;
    board = meta('meta[name="pinterestapp:board"]');
    if (!board && isCollectionPage(site, url)) board = document.title.replace(/\s*[|·-]\s*Pinterest.*$/i, "").trim();
  }

  return {
    url,
    title: document.title,
    site,
    externalId: externalIdFor(site, url),
    author,
    caption: description?.slice(0, 2000),
    board,
    ogImage: meta('meta[property="og:image"]'),
    candidates,
    isCollection: isCollectionPage(site, url),
    post: externalIdFor(site, url) ? postShape() : undefined,
  };
}

/**
 * Scroll the collection to the bottom, collecting one image per post as it
 * loads, then return the list for the person to review. Bounded so a very
 * long saved list stops after a few hundred rather than running forever.
 */
async function scanCollection(): Promise<{ items: Candidate[]; scrolled: number }> {
  const found = new Map<string, Candidate>();
  const collect = () => {
    for (const img of document.images) {
      const c = candidateFrom(img);
      if (c?.postUrl && !found.has(c.postUrl)) found.set(c.postUrl, c);
      else if (c?.postUrl && found.get(c.postUrl)!.width < c.width) found.set(c.postUrl, c);
    }
  };

  let scrolled = 0;
  let lastCount = -1;
  let stalls = 0;
  collect();
  while (scrolled < 60 && stalls < 4 && found.size < 600) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    scrolled++;
    await new Promise((r) => setTimeout(r, 900));
    collect();
    if (found.size === lastCount) stalls++;
    else stalls = 0;
    lastCount = found.size;
  }
  window.scrollTo(0, 0);
  return { items: dedupeByPost([...found.values()]), scrolled };
}

/* ------------------------------------------------------------------ posts --
 * A post is not an image. Everything below reads the one post the person has
 * open, and works the carousel with the same two buttons they would press.
 * Labels rather than class names, because the labels are what stay put.
 */

const NEXT = 'button[aria-label="Next"], button[aria-label="Next slide"], [role="button"][aria-label="Next"]';
const BACK = 'button[aria-label="Go back"], button[aria-label="Go Back"], button[aria-label="Previous"], button[aria-label="Previous slide"]';

/** The open post: the dialog when a post is opened over a feed, else the page's article. */
function postRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('div[role="dialog"] article') ??
    document.querySelector<HTMLElement>("main article") ??
    document.querySelector<HTMLElement>("article") ??
    document.body
  );
}

const visibleArea = (el: Element, within: DOMRect) => {
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, within.right) - Math.max(r.left, within.left);
  const h = Math.min(r.bottom, within.bottom) - Math.max(r.top, within.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/** The slide on screen right now: the image with the most visible area inside the post. */
function currentSlideImage(root: HTMLElement): Candidate | null {
  const box = root.getBoundingClientRect();
  let best: { c: Candidate; area: number } | null = null;
  for (const img of root.querySelectorAll("img")) {
    const c = candidateFrom(img);
    if (!c || !plausible(c)) continue;
    const area = visibleArea(img, box);
    if (area > (best?.area ?? 0)) best = { c, area };
  }
  return best?.c ?? null;
}

/** Position from the indicator dots: a row of small siblings, one styled differently. */
function dotsPosition(root: HTMLElement): { index?: number; count?: number } {
  for (const row of root.querySelectorAll<HTMLElement>("div")) {
    const kids = [...row.children] as HTMLElement[];
    if (kids.length < 2 || kids.length > 20) continue;
    const small = kids.every((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.width <= 10 && r.height <= 10 && k.children.length === 0;
    });
    if (!small) continue;
    return { index: oddOneOut(kids.map((k) => k.className)), count: kids.length };
  }
  return {};
}

function postShape(): PostShape {
  const root = postRoot();
  const carousel = !!root.querySelector(NEXT) || !!root.querySelector(BACK);
  const dots = carousel ? dotsPosition(root) : {};
  const v = root.querySelector("video");
  const r = v?.getBoundingClientRect();
  return {
    carousel,
    slideIndex: dots.index ?? (carousel && !root.querySelector(BACK) ? 1 : undefined),
    slideCount: dots.count,
    video: v && r && r.width > 100
      ? { timeS: v.currentTime, paused: v.paused, poster: v.poster || undefined, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }
      : undefined,
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every slide of the open post, by pressing "back" to the start and then
 * "next" to the end, exactly as a person would. Video slides contribute their
 * poster. Bounded, and the post is left on the slide it started on.
 */
async function collectSlides(): Promise<{ slides: Candidate[]; count: number }> {
  const root = postRoot();
  let startedAt = 0;
  for (let i = 0; i < 25; i++) {
    const back = root.querySelector<HTMLElement>(BACK);
    if (!back) break;
    back.click();
    startedAt++;
    await pause(380);
  }

  const slides: Candidate[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= 25; i++) {
    const video = [...root.querySelectorAll("video")].find((v) => visibleArea(v, root.getBoundingClientRect()) > 40_000);
    const c: Candidate | null = video?.poster
      ? { src: new URL(video.poster, location.href).href, width: video.videoWidth || 1080, height: video.videoHeight || 1080, mediaKind: "video_cover" }
      : currentSlideImage(root);
    if (c && !seen.has(c.src)) {
      seen.add(c.src);
      slides.push({ ...c, slideIndex: i, postUrl: location.href });
    }
    const next = root.querySelector<HTMLElement>(NEXT);
    if (!next) break;
    next.click();
    await pause(480);
  }

  // Put the post back where the person had it.
  for (let i = 0; i < 25 && root.querySelector(BACK); i++) { root.querySelector<HTMLElement>(BACK)!.click(); await pause(120); }
  for (let i = 0; i < startedAt; i++) { root.querySelector<HTMLElement>(NEXT)?.click(); await pause(120); }

  const count = slides.length ? Math.max(...slides.map((s) => s.slideIndex ?? 0)) : 0;
  return { slides: slides.map((s) => ({ ...s, slideCount: count })), count };
}

/**
 * A frame is captured as a screenshot of the tab, cropped to the video,
 * because a page script may not read pixels out of a cross-origin video. So
 * for the instant of the capture the player's own overlays (the big play
 * button, the mute badge) are hidden, and then put back.
 */
let hidden: HTMLElement[] = [];

function prepareFrame(): { rect: Rect; dpr: number; timeS: number } | null {
  const root = postRoot();
  const v = [...root.querySelectorAll("video")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!v) return null;
  v.pause();
  v.scrollIntoView({ block: "center" });
  const r = v.getBoundingClientRect();

  restoreFrame();
  const box = v.getBoundingClientRect();
  let scope: HTMLElement = v.parentElement ?? root;
  for (let i = 0; i < 4 && scope.parentElement && scope.parentElement !== root; i++) {
    const pr = scope.parentElement.getBoundingClientRect();
    if (pr.width > box.width * 1.15 || pr.height > box.height * 1.15) break;
    scope = scope.parentElement;
  }
  for (const el of scope.querySelectorAll<HTMLElement>("*")) {
    if (el === v || el.contains(v)) continue;
    if (visibleArea(el, box) === 0) continue;
    hidden.push(el);
    el.dataset.paletteVis = el.style.visibility;
    el.style.visibility = "hidden";
  }
  return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, dpr: window.devicePixelRatio || 1, timeS: v.currentTime };
}

function restoreFrame() {
  for (const el of hidden) {
    el.style.visibility = el.dataset.paletteVis ?? "";
    delete el.dataset.paletteVis;
  }
  hidden = [];
}

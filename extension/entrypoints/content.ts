import type { Candidate, PageInfo } from "../lib/resolve";
import { dedupeByPost, externalIdFor, isCollectionPage, largestFromSrcset, siteFor } from "../lib/resolve";

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

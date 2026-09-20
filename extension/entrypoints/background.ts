import { saveBlob, saveCandidate, type SaveResult } from "../lib/api";
import type { Candidate, PageInfo, Rect } from "../lib/resolve";
import { cropFor, pickBest, siteFor } from "../lib/resolve";

/**
 * The worker. Owns the context menus and every network call, because it is
 * the one place with host permissions and no page CORS.
 */
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({ id: "save-image", title: "Save image to Palette", contexts: ["image"] });
    browser.contextMenus.create({ id: "save-page", title: "Save this page's main image to Palette", contexts: ["page"] });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    try {
      if (info.menuItemId === "save-image" && info.srcUrl) {
        const page = await inspectTab(tab.id);
        const c: Candidate = page.candidates.find((x) => x.src === info.srcUrl) ?? { src: info.srcUrl, width: 0, height: 0 };
        report(await saveCandidate(c, page));
      } else if (info.menuItemId === "save-page") {
        const page = await inspectTab(tab.id);
        const best = pickBest(page.candidates, page.ogImage);
        if (!best) return notify("Palette", "No usable image on this page.");
        report(await saveCandidate(best, page));
      }
    } catch (err) {
      notify("Palette", (err as Error).message);
    }
  });

  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    (async () => {
      if (msg.type === "save") {
        sendResponse(await saveCandidate(msg.candidate, msg.page, { haus: msg.haus, note: msg.note }));
      } else if (msg.type === "save-many") {
        const summary = { saved: 0, duplicates: 0, variants: 0, failed: 0, errors: [] as string[] };
        for (const c of msg.candidates) {
          const r = await saveCandidate(c, msg.page, { haus: msg.haus });
          if (r.ok) { summary.saved += r.saved; summary.duplicates += r.duplicates; summary.variants += r.variants; }
          else { summary.failed++; if (summary.errors.length < 5) summary.errors.push(r.error); }
          // Be a polite guest on the image host.
          await new Promise((r) => setTimeout(r, 250));
        }
        notify("Palette import", `${summary.saved} saved, ${summary.duplicates} already there, ${summary.failed} failed.`);
        sendResponse(summary);
      } else if (msg.type === "save-frame") {
        sendResponse(await saveFrame(msg.tabId, msg.page, msg.haus));
      }
    })().catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  });
});

type Message =
  | { type: "save"; candidate: Candidate; page: PageInfo; haus?: string; note?: string }
  | { type: "save-many"; candidates: Candidate[]; page: PageInfo; haus?: string }
  | { type: "save-frame"; tabId: number; page: PageInfo; haus?: string };

/**
 * The frame on screen, as the person sees it. A page may not read pixels out
 * of a cross-origin video, so the tab is photographed and cropped to the
 * player. The content script hides the player's overlays for that instant
 * and is always told to put them back, whatever happens in between.
 */
async function saveFrame(tabId: number, page: PageInfo, haus?: string): Promise<SaveResult> {
  const prep = (await browser.tabs.sendMessage(tabId, { type: "prepare-frame" })) as
    | { rect: Rect; dpr: number; timeS: number }
    | null;
  if (!prep) return { ok: false, error: "No video on this page." };
  try {
    // One paint, so the hidden overlays are really gone from the picture.
    await new Promise((r) => setTimeout(r, 120));
    const tab = await browser.tabs.get(tabId);
    const shot = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
    const crop = cropFor(prep.rect, prep.dpr, bitmap.width, bitmap.height);
    if (!crop) return { ok: false, error: "The video is not fully on screen. Scroll it into view and try again." };
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    canvas.getContext("2d")!.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const id = (page.externalId ?? "video").replace(/[^A-Za-z0-9_-]+/g, "-");
    return await saveBlob(blob, `${id}-${Math.round(prep.timeS)}s.jpg`, { mediaKind: "video_frame", frameTimeS: prep.timeS }, page, { haus });
  } finally {
    browser.tabs.sendMessage(tabId, { type: "restore-frame" }).catch(() => {});
  }
}

async function inspectTab(tabId: number): Promise<PageInfo> {
  try {
    return (await browser.tabs.sendMessage(tabId, { type: "inspect" })) as PageInfo;
  } catch {
    // Content script not present (a page opened before install). Minimal info.
    const tab = await browser.tabs.get(tabId);
    const url = tab.url ?? "";
    return { url, title: tab.title ?? "", site: siteFor(url), candidates: [], isCollection: false };
  }
}

function report(r: Awaited<ReturnType<typeof saveCandidate>>) {
  if (r.ok) notify("Saved to Palette", r.duplicates ? "Already in the library; provenance added." : r.variants ? "Folded in as a near-duplicate." : "Stored. Tagging queued.");
  else notify("Palette could not save", r.error);
}

function notify(title: string, message: string) {
  browser.notifications.create({ type: "basic", iconUrl: browser.runtime.getURL("/icon/128.png"), title, message }).catch(() => {});
}

import { saveCandidate } from "../lib/api";
import type { Candidate, PageInfo } from "../lib/resolve";
import { pickBest, siteFor } from "../lib/resolve";

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
      }
    })().catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  });
});

type Message =
  | { type: "save"; candidate: Candidate; page: PageInfo; haus?: string; note?: string }
  | { type: "save-many"; candidates: Candidate[]; page: PageInfo; haus?: string };

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

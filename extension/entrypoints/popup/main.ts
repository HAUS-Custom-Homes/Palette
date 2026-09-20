import { hauses, whoAmI } from "../../lib/api";
import type { Candidate, PageInfo } from "../../lib/resolve";
import { pickBest, plausible } from "../../lib/resolve";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let page: PageInfo | null = null;
let selected = new Set<string>();

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function thumb(c: Candidate, on: boolean, onClick: () => void) {
  const el = document.createElement("div");
  el.className = "thumb";
  el.dataset.on = String(on);
  el.innerHTML = `<img src="${c.src}" alt="" loading="lazy" /><span class="sz">${c.width || "?"}</span>`;
  el.title = c.postUrl ?? c.src;
  el.addEventListener("click", onClick);
  return el;
}

function say(text: string, cls = "muted") {
  const r = $("result");
  r.textContent = text;
  r.className = cls;
}

async function saveOne(c: Candidate) {
  if (!page) return;
  say("saving...");
  const r = (await browser.runtime.sendMessage({ type: "save", candidate: c, page, haus: $<HTMLSelectElement>("haus").value || undefined })) as
    | { ok: true; duplicates: number; variants: number }
    | { ok: false; error: string };
  if (r.ok) say(r.duplicates ? "Already in the library." : r.variants ? "Folded in as a near-duplicate." : "Saved. Tagging queued.", "ok");
  else say(r.error, "err");
}

async function init() {
  $("options").addEventListener("click", (e) => { e.preventDefault(); browser.runtime.openOptionsPage(); });

  try {
    const me = await whoAmI();
    $("status").textContent = me.name ?? me.email;
  } catch (err) {
    $("status").textContent = (err as Error).message;
    $("status").className = "err";
    $("main").hidden = true;
    return;
  }

  for (const h of await hauses()) {
    const o = document.createElement("option");
    o.value = h.slug;
    o.textContent = h.label;
    $("haus").appendChild(o);
  }

  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    page = (await browser.tabs.sendMessage(tab.id, { type: "inspect" })) as PageInfo;
  } catch {
    say("Reload this page once so Palette can read it.", "err");
    return;
  }

  const cands = page.candidates.filter(plausible).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 12);
  const best = pickBest(page.candidates, page.ogImage);
  const grid = $("candidates");
  for (const c of cands) grid.appendChild(thumb(c, c === best, () => saveOne(c)));
  $<HTMLButtonElement>("save-best").disabled = !best;
  $("save-best").addEventListener("click", () => best && saveOne(best));

  if (page.isCollection) {
    $("collection").hidden = false;
    $("scan").addEventListener("click", scan);
  }

  if (page.post?.video) setupVideo(tab.id, best);
  else if (page.post?.carousel) setupCarousel(tab.id, best);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

/** A multi-image post: this slide, or all of them (reviewed before anything is saved). */
function setupCarousel(tabId: number, best: Candidate | null) {
  const post = page!.post!;
  $("post").hidden = false;
  $("save-best").hidden = true;
  $("post-kind").textContent = post.slideCount
    ? `Multi-image post, ${post.slideCount} slides${post.slideIndex ? `. You are on slide ${post.slideIndex}.` : "."}`
    : "Multi-image post.";

  $("post-a").textContent = "Save this slide";
  $("post-a").onclick = () => best && saveOne({ ...best, slideIndex: post.slideIndex, slideCount: post.slideCount });

  $("post-b").textContent = post.slideCount ? `Save all ${post.slideCount}` : "Save all slides";
  $("post-b").onclick = async () => {
    $<HTMLButtonElement>("post-b").disabled = true;
    say("stepping through the slides...");
    const res = (await browser.tabs.sendMessage(tabId, { type: "collect-slides" })) as { slides: Candidate[]; count: number };
    if (!res.slides.length) { say("Could not read the slides on this page.", "err"); return; }

    let chosen = new Set(res.slides.map((s) => s.src));
    const render = () => {
      $("slides").innerHTML = "";
      for (const s of res.slides) {
        $("slides").appendChild(thumb(s, chosen.has(s.src), () => { chosen.has(s.src) ? chosen.delete(s.src) : chosen.add(s.src); render(); }));
      }
      $("slides-save").textContent = `Save ${chosen.size} to ${$<HTMLSelectElement>("haus").selectedOptions[0]?.textContent ?? "any haus"}`;
    };
    render();
    say(`${res.slides.length} slides found. Click any you do not want.`);
    $("slides-row").hidden = false;
    $("slides-all").onclick = () => { chosen = new Set(res.slides.map((s) => s.src)); render(); };
    $("slides-none").onclick = () => { chosen.clear(); render(); };
    $("haus").addEventListener("change", render);
    $("slides-save").onclick = async () => {
      const picked = res.slides.filter((s) => chosen.has(s.src));
      if (!picked.length) return;
      $<HTMLButtonElement>("slides-save").disabled = true;
      say(`saving ${picked.length}...`);
      const s = (await browser.runtime.sendMessage({ type: "save-many", candidates: picked, page, haus: $<HTMLSelectElement>("haus").value || undefined })) as
        { saved: number; duplicates: number; failed: number; errors: string[] };
      say(`${s.saved} saved, ${s.duplicates} already there, ${s.failed} failed${s.errors[0] ? ` (${s.errors[0]})` : ""}.`, s.failed ? "err" : "ok");
      $<HTMLButtonElement>("slides-save").disabled = false;
    };
  };
}

/** A video post: its cover, or the frame that is on screen right now. */
function setupVideo(tabId: number, best: Candidate | null) {
  const video = page!.post!.video!;
  $("post").hidden = false;
  $("save-best").hidden = true;
  $("post-kind").textContent = `Video post, ${video.paused ? "paused" : "playing"} at ${clock(video.timeS)}. Palette keeps a still, not the video.`;

  const cover: Candidate | null = video.poster
    ? { src: video.poster, width: 1080, height: 1080, mediaKind: "video_cover" }
    : best ? { ...best, mediaKind: "video_cover" } : null;
  $("post-a").textContent = "Save cover";
  $<HTMLButtonElement>("post-a").disabled = !cover;
  $("post-a").onclick = () => cover && saveOne(cover);

  $("post-b").textContent = "Save this frame";
  $("post-b").onclick = async () => {
    say("capturing the frame on screen...");
    const r = (await browser.runtime.sendMessage({ type: "save-frame", tabId, page, haus: $<HTMLSelectElement>("haus").value || undefined })) as
      | { ok: true; duplicates: number }
      | { ok: false; error: string };
    if (r.ok) say(r.duplicates ? "That frame is already in the library." : "Frame saved. Scrub to another moment and save again if you like.", "ok");
    else say(r.error, "err");
  };
}

async function scan() {
  const tab = await activeTab();
  if (!tab?.id || !page) return;
  $<HTMLButtonElement>("scan").disabled = true;
  $("scan-status").textContent = "scrolling and collecting... this can take a minute";
  const res = (await browser.tabs.sendMessage(tab.id, { type: "scan-collection" })) as { items: Candidate[]; scrolled: number };
  $("scan-status").textContent = `${res.items.length} found. Click to deselect anything you do not want.`;
  const review = $("review");
  review.innerHTML = "";
  selected = new Set(res.items.map((c) => c.postUrl ?? c.src));
  const items = res.items;
  const render = () => {
    review.innerHTML = "";
    for (const c of items) {
      const key = c.postUrl ?? c.src;
      review.appendChild(thumb(c, selected.has(key), () => { selected.has(key) ? selected.delete(key) : selected.add(key); render(); }));
    }
    $("import").textContent = `Import ${selected.size}`;
  };
  render();
  $("import-row").hidden = false;
  $("select-all").onclick = () => { selected = new Set(items.map((c) => c.postUrl ?? c.src)); render(); };
  $("select-none").onclick = () => { selected.clear(); render(); };
  $("import").onclick = async () => {
    const chosen = items.filter((c) => selected.has(c.postUrl ?? c.src));
    if (!chosen.length) return;
    $<HTMLButtonElement>("import").disabled = true;
    say(`importing ${chosen.length}... you can close this; a notification will tell you when it is done.`);
    const s = (await browser.runtime.sendMessage({ type: "save-many", candidates: chosen, page, haus: $<HTMLSelectElement>("haus").value || undefined })) as
      { saved: number; duplicates: number; failed: number; errors: string[] };
    say(`${s.saved} saved, ${s.duplicates} already there, ${s.failed} failed${s.errors[0] ? ` (${s.errors[0]})` : ""}.`, s.failed ? "err" : "ok");
    $<HTMLButtonElement>("import").disabled = false;
  };
}

init();

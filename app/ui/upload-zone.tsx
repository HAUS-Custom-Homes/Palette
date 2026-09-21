"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";

/**
 * REF-02 decision 7. Saving is one action with no questions. The answer comes
 * back at once, as a confirmation that offers Undo and the hauses as one-tap
 * chips, then gets out of the way. Everything else (titles, tags, search by
 * look) happens afterwards and never holds the save up.
 */
type Saved = { id: string; sha256: string; title: string | null; count: number };
type Toast =
  | { kind: "saved"; post: Saved; already: boolean; haus?: string }
  | { kind: "undone" }
  | { kind: "error"; text: string };

/**
 * One box. Words search the library; a link saves the post. Pictures dropped
 * anywhere on the page are saved too. `q` is the search in force and `keep`
 * the other filters in the URL, so a new search does not throw them away.
 */
export function UploadZone({ hauses, q = "", keep = {} }: { hauses: Array<{ slug: string; label: string }>; q?: string; keep?: Record<string, string> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState(q);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hold, setHold] = useState(false);

  // The confirmation leaves by itself, unless someone is using it.
  useEffect(() => {
    if (!toast || hold) return;
    const t = setTimeout(() => setToast(null), toast.kind === "error" ? 12000 : 9000);
    return () => clearTimeout(t);
  }, [toast, hold]);

  async function send(files: File[] | FileList, link?: string) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length && !link) return;
    setBusy(link ? "Getting everything in that post..." : `Saving ${list.length} image${list.length > 1 ? "s" : ""}...`);
    setToast(null);

    const body = new FormData();
    for (const f of list) body.append("files", f);
    if (link) body.append("url", link.trim());

    try {
      const res = await fetch("/api/ingest", { method: "POST", body });
      const json = (await res.json()) as {
        saved: number; duplicates: number; variants: number; failed: number; errors?: string[]; error?: string; post?: Saved | null;
      };
      if (!res.ok) throw new Error(json.error ?? "That did not save.");
      if (!json.post) throw new Error(json.errors?.[0] ?? "That did not save.");
      setToast({ kind: "saved", post: json.post, already: json.saved === 0 && json.variants === 0 });
      setUrl("");
      router.refresh();
    } catch (err) {
      setToast({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function undo(post: Saved) {
    const res = await fetch(`/api/items/${post.id}`, { method: "DELETE" });
    setToast(res.ok ? { kind: "undone" } : { kind: "error", text: "Could not undo that. Open it and use Remove from library." });
    router.refresh();
  }

  async function setHaus(post: Saved, slug: string, label: string) {
    const res = await fetch("/api/items/haus", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemIds: [post.id], haus: slug }),
    });
    if (res.ok) { setToast({ kind: "saved", post, already: false, haus: label }); router.refresh(); }
  }

  const isLink = (t: string) => /^https?:\/\/\S+$/.test(t.trim());

  function go(text: string) {
    if (isLink(text)) return void send([], text);
    const params = new URLSearchParams(keep);
    if (text.trim()) params.set("q", text.trim()); else params.delete("q");
    const s = params.toString();
    router.push(s ? `/?${s}` : "/");
  }

  // Pictures can be dropped anywhere on the page, not on a particular box.
  useEffect(() => {
    const hasFiles = (e: globalThis.DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const over = (e: globalThis.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } };
    const leave = (e: globalThis.DragEvent) => { if (!e.relatedTarget) setOver(false); };
    const drop = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer) void send(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" puts the cursor in the box, as it always has.
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      box.current?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <>
      <div className="omni" data-over={over} data-busy={!!busy}>
        <SearchIcon />
        <input ref={input} type="file" multiple accept="image/*" hidden
               onChange={(e) => e.target.files && void send(e.target.files)} />
        <input ref={box} className="search" value={busy ?? url} disabled={!!busy} enterKeyHint="search" autoComplete="off"
               placeholder="Search, or paste a link to save it" aria-label="Search the library, or paste a link to save it"
               onChange={(e) => setUrl(e.target.value)}
               onPaste={(e) => { const t = e.clipboardData.getData("text"); if (isLink(t)) { e.preventDefault(); setUrl(t.trim()); void send([], t); } }}
               onKeyDown={(e) => { if (e.key === "Enter") go(url); }} />
        <kbd>/</kbd>
      </div>
      {over && <div className="dropveil">Drop to save to Palette</div>}

      {toast && (
        <div className="toast" role="status" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)}>
          {toast.kind === "saved" && (
            <>
              <img src={`/api/asset/${toast.post.sha256}/thumb`} alt="" />
              <div className="toast-body">
                <div className="toast-line">
                  <b>
                    {toast.haus ? `Added to ${toast.haus}`
                      : toast.already ? "Already in your library"
                      : `Saved${toast.post.count > 1 ? ` · ${toast.post.count} items` : ""}`}
                  </b>
                  <span className="toast-actions">
                    <Link href={`/item/${toast.post.id}`}>Open</Link>
                    {!toast.already && <button type="button" onClick={() => void undo(toast.post)}>Undo</button>}
                  </span>
                </div>
                {!toast.haus && hauses.length > 0 && (
                  <div className="toast-chips">
                    {hauses.slice(0, 4).map((h) => (
                      <button type="button" key={h.slug} onClick={() => void setHaus(toast.post, h.slug, h.label)}>+ {h.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {toast.kind === "undone" && <div className="toast-body"><b>Removed.</b> Paste the link again if you change your mind.</div>}
          {toast.kind === "error" && <div className="toast-body"><b>That did not save.</b> {toast.text}</div>}
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setToast(null)}>&#10005;</button>
        </div>
      )}
    </>
  );
}

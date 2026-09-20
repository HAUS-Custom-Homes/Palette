"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

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

export function UploadZone({ hauses }: { hauses: Array<{ slug: string; label: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");
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

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void send(e.dataTransfer.files);
  }

  return (
    <>
      <div className="savebar" data-over={over}
           onDragOver={(e) => { e.preventDefault(); setOver(true); }}
           onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input ref={input} type="file" multiple accept="image/*" hidden
               onChange={(e) => e.target.files && void send(e.target.files)} />
        <input className="search" inputMode="url" value={url} disabled={!!busy}
               placeholder="Paste an Instagram or Pinterest link, or any web page, and press Enter"
               onChange={(e) => setUrl(e.target.value)}
               onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/^https?:\/\/\S+$/.test(t.trim())) { e.preventDefault(); setUrl(t.trim()); void send([], t); } }}
               onKeyDown={(e) => { if (e.key === "Enter" && url) void send([], url); }} />
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={!!busy}>Upload images</button>
        {busy && <span className="hint savebar-busy">{busy}</span>}
      </div>

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

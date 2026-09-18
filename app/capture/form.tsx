"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Result = { saved?: number; duplicates?: number; variants?: number; failed?: number; queued?: boolean; pending?: number; error?: string; errors?: string[] };

/**
 * Posts to /api/ingest like every other surface. It does not know or care
 * whether the network is there: the service worker answers 202 "queued" when
 * it is not, and this just reports what it was told.
 */
export function CaptureForm({ hauses }: { hauses: Array<{ slug: string; label: string }> }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [haus, setHaus] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "queued" | "err" } | null>(null);

  async function send(files: File[], link?: string) {
    if (!files.length && !link) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (link) fd.append("url", link);
    if (haus) fd.append("haus", haus);
    if (note.trim()) fd.append("note", note.trim());
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const j = (await res.json()) as Result;
      if (j.queued) setMsg({ kind: "queued", text: `Saved on this phone (${j.pending} waiting). It uploads when you are back online.` });
      else if (!res.ok) setMsg({ kind: "err", text: j.error ?? j.errors?.[0] ?? `Could not save (${res.status})` });
      else {
        setMsg({ kind: "ok", text: `${j.saved ?? 0} saved` + (j.duplicates ? `, ${j.duplicates} already in the library` : "") + (j.variants ? `, ${j.variants} folded in` : "") + (j.failed ? `, ${j.failed} failed` : "") + "." });
        router.refresh();
      }
      setUrl("");
      setNote("");
    } catch {
      // No service worker (first visit, or an old browser) and no network.
      setMsg({ kind: "err", text: "No signal, and offline saving is not ready on this phone yet. Open Palette once while online, then it will work without signal." });
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  return (
    <div className="capture">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files && void send([...e.target.files])} />
      <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void send([...e.target.files])} />

      <select className="search" value={haus} onChange={(e) => setHaus(e.target.value)} aria-label="Haus">
        <option value="">Which haus? (optional)</option>
        {hauses.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
      </select>
      <input className="search" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this one (optional)" />

      <div className="capture-buttons">
        <button type="button" className="btn big" data-primary="true" disabled={busy} onClick={() => library.current?.click()}>Choose photos</button>
        <button type="button" className="btn big" disabled={busy} onClick={() => camera.current?.click()}>Take a photo</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input className="search" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="or paste a link to an image or post" inputMode="url"
               onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) void send([], url.trim()); }} />
        <button type="button" className="btn" disabled={busy || !url.trim()} onClick={() => void send([], url.trim())}>Save</button>
      </div>

      {busy && <p className="hint">saving...</p>}
      {msg && <p className="notice" data-kind={msg.kind === "ok" ? undefined : "attention"} style={{ margin: 0 }}>{msg.text}</p>}
    </div>
  );
}

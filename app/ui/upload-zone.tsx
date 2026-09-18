"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";

/**
 * REF-01 FR-3, FR-5. Drop files, get an acknowledgement, carry on.
 * Optionally pick which haus they are for before they go in.
 */
export function UploadZone({ hauses }: { hauses: Array<{ slug: string; label: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [haus, setHaus] = useState<string>("");
  const [url, setUrl] = useState("");

  async function send(files: File[] | FileList, link?: string) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length && !link) return;
    setBusy(true);
    setMsg(link ? "fetching..." : `saving ${list.length} file${list.length > 1 ? "s" : ""}...`);

    const body = new FormData();
    for (const f of list) body.append("files", f);
    if (link) body.append("url", link);
    if (haus) body.append("haus", haus);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body });
      const json = (await res.json()) as { saved: number; duplicates: number; variants: number; failed: number; errors?: string[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      setMsg(
        `${json.saved} saved` +
          (json.duplicates ? `, ${json.duplicates} already here` : "") +
          (json.variants ? `, ${json.variants} folded in as near-duplicates` : "") +
          (json.failed ? `, ${json.failed} failed (${json.errors?.[0] ?? ""})` : "") +
          ". Tagging queued.",
      );
      setUrl("");
      router.refresh();
    } catch (err) {
      setMsg(`failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void send(e.dataTransfer.files);
  }

  return (
    <div className="dropzone" data-over={over}
         onDragOver={(e) => { e.preventDefault(); setOver(true); }}
         onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <input ref={input} type="file" multiple accept="image/*" hidden
             onChange={(e) => e.target.files && void send(e.target.files)} />
      <div className="dropzone-row">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>Choose images</button>
        <input className="search" placeholder="or paste an image URL" value={url}
               onChange={(e) => setUrl(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" && url) void send([], url); }} />
        <select className="search" style={{ flex: "0 0 180px" }} value={haus} onChange={(e) => setHaus(e.target.value)}>
          <option value="">any haus</option>
          {hauses.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
        </select>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {busy ? "working..." : msg ?? "Or drop images anywhere in this box. Stored by hash, tagged after."}
      </div>
    </div>
  );
}

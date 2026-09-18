"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The open-facet picker. Pick an existing haus, or type a new one and it is
 * created and applied in one motion. This is the one place a person grows the
 * vocabulary directly, and it is allowed because only a person can know which
 * haus an image is for.
 */
export function HausPicker({
  itemId, hauses, action,
}: { itemId: string; hauses: Array<{ id: string; label: string }>; action: (fd: FormData) => void }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createNew() {
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/taxonomy/terms", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ facet: "project", label, itemId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      setLabel("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {hauses.length > 0 && (
        <form action={action} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="action" value="add" />
          <select name="termId" className="search" style={{ padding: "6px 8px", fontSize: 12 }} defaultValue="">
            <option value="" disabled>existing haus...</option>
            {hauses.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
          <button className="btn" type="submit">add</button>
        </form>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input className="search" style={{ padding: "6px 8px", fontSize: 12, width: 160 }} placeholder="new haus, e.g. Hurst"
               value={label} onChange={(e) => setLabel(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createNew(); } }} />
        <button className="btn" data-primary="true" type="button" onClick={() => void createNew()} disabled={busy || !label.trim()}>
          {busy ? "..." : "create"}
        </button>
      </div>
      {err && <span className="hint" style={{ color: "var(--warn)" }}>{err}</span>}
    </div>
  );
}

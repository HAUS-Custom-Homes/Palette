"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Wherever something can be put on a board, a new board can be made right
 * there. Picking an existing one adds at once; "New lookbook..." turns the picker
 * into a name field, and Enter makes the board with the things already on it.
 */
export function BoardPicker({
  boards, itemIds, label = "Add to lookbook...", onDone, compact = false,
}: {
  boards: Array<{ id: string; name: string }>;
  itemIds: () => string[];
  label?: string;
  onDone?: (message: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function send(url: string, body: unknown, done: (j: { name?: string; count?: number }) => string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error?: string; name?: string; count?: number };
      if (!res.ok) throw new Error(json.error ?? "That did not work.");
      onDone?.(done(json));
      setNaming(false);
      setName("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const add = (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    return send(`/api/boards/${boardId}/items`, { itemIds: itemIds() }, () => `Added to ${board?.name ?? "the lookbook"}`);
  };
  const create = () => {
    if (name.trim().length < 2) { setErr("Give it a name first."); input.current?.focus(); return; }
    return send(`/api/boards`, { name, itemIds: itemIds() }, () => `Made "${name.trim()}" and added to it`);
  };

  if (naming) {
    return (
      <span className="board-new">
        <input ref={input} className="search" autoFocus value={name} disabled={busy} maxLength={80}
               placeholder="Name the new lookbook, e.g. Antoon primary bath"
               onChange={(e) => { setName(e.target.value); setErr(null); }}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") setNaming(false); }} />
        <button type="button" className="btn" data-primary="true" onClick={() => void create()} disabled={busy}>{busy ? "Making..." : "Create"}</button>
        <button type="button" className="btn" onClick={() => setNaming(false)} disabled={busy}>Cancel</button>
        {err && <span className="hint" style={{ color: "var(--warn)", flexBasis: "100%" }}>{err}</span>}
      </span>
    );
  }

  return (
    <span className="board-new">
      <select className="search" value="" disabled={busy} style={compact ? { flex: "0 0 210px", padding: "6px 8px" } : undefined}
              onChange={(e) => { const v = e.target.value; if (v === "__new") setNaming(true); else if (v) void add(v); }}>
        <option value="">{busy ? "Adding..." : label}</option>
        <option value="__new">+ New lookbook...</option>
        {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {err && <span className="hint" style={{ color: "var(--warn)" }}>{err}</span>}
    </span>
  );
}

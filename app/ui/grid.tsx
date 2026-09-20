"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItemRow } from "@/search/query";
import { PlayIcon, SourceIcon, StackIcon, clock, displayName } from "./icons";

/**
 * REF-01 FR-28, FR-30, FR-32, FR-36.
 *
 * The library grid, with the three things a designer does with a pile of
 * reference: select several and act on them at once, move through them
 * without a mouse, and put a few side by side.
 *
 *   x        toggle selection on the focused card     j / k   next / previous
 *   space    open the focused card                    c       add to compare tray
 *   b        add selection (or focused) to a board    esc     clear
 *
 * The compare tray lives in localStorage: it is a per-person scratch space,
 * not library data, so it never needs to reach the server.
 */
type Board = { id: string; name: string };
type Haus = { slug: string; label: string };

const TRAY_KEY = "palette.compare";

export function readTray(): string[] {
  try { return JSON.parse(localStorage.getItem(TRAY_KEY) ?? "[]"); } catch { return []; }
}
function writeTray(ids: string[]) {
  try { localStorage.setItem(TRAY_KEY, JSON.stringify(ids.slice(0, 6))); } catch { /* private mode */ }
}

export function Grid({ items, boards, hauses }: { items: ItemRow[]; boards: Board[]; hauses: Haus[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<number>(-1);
  const [tray, setTray] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setTray(readTray()); }, []);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const targets = useCallback(
    () => (selected.size ? [...selected] : focus >= 0 ? [ids[focus]] : []),
    [selected, focus, ids],
  );

  const toggle = useCallback((id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const addToTray = useCallback((list: string[]) => {
    const next = [...new Set([...readTray(), ...list])].slice(0, 6);
    writeTray(next);
    setTray(next);
    setMsg(`${next.length} in the compare tray`);
  }, []);

  async function post(url: string, body: unknown, label: string) {
    setBusy(label);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as { error?: string; count?: number };
      if (!r.ok) throw new Error(j.error ?? "failed");
      setMsg(`${label}: ${j.count ?? targets().length} done`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const addToBoard = (boardId: string) => boardId && post(`/api/boards/${boardId}/items`, { itemIds: targets() }, "added to board");
  const setHaus = (haus: string) => haus && post(`/api/items/haus`, { itemIds: targets(), haus }, "haus set");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "j") { setFocus((f) => Math.min(ids.length - 1, f + 1)); e.preventDefault(); }
      else if (e.key === "k") { setFocus((f) => Math.max(0, f - 1)); e.preventDefault(); }
      else if (e.key === "x" && focus >= 0) { toggle(ids[focus]); e.preventDefault(); }
      else if (e.key === " " && focus >= 0) { router.push(`/item/${ids[focus]}`); e.preventDefault(); }
      else if (e.key === "c") { const t = targets(); if (t.length) addToTray(t); e.preventDefault(); }
      else if (e.key === "Escape") { setSelected(new Set()); setFocus(-1); }
      else if (e.key === "/") { (document.querySelector("input.search") as HTMLInputElement | null)?.focus(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, focus, toggle, targets, addToTray, router]);

  useEffect(() => {
    if (focus >= 0) document.getElementById(`card-${ids[focus]}`)?.scrollIntoView({ block: "nearest" });
  }, [focus, ids]);

  const n = selected.size;

  // Masonry by hand: each image goes into whichever column is shortest so far.
  // CSS multi-column did this for free, and painted tiles black in Chrome once
  // they carried overlays and rounded clipping, which is not a trade worth having.
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      setCols(w < 520 ? 2 : Math.max(2, Math.min(6, Math.floor(w / 250))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const columns = useMemo(() => {
    const out: number[][] = Array.from({ length: cols }, () => []);
    const heights = new Array<number>(cols).fill(0);
    items.forEach((it, i) => {
      const ratio = it.width && it.height ? Math.min(2.2, Math.max(0.5, it.height / it.width)) : 1;
      const c = heights.indexOf(Math.min(...heights));
      out[c]!.push(i);
      heights[c]! += ratio;
    });
    return out;
  }, [items, cols]);

  return (
    <>
      {(n > 0 || tray.length > 0 || msg) && (
        <div className="bulkbar">
          {n > 0 ? <b>{n} selected</b> : <span className="hint">j k to move, x to select, c to compare</span>}
          {n > 0 && (
            <>
              <select className="search" style={{ flex: "0 0 200px", padding: "6px 8px" }} value="" disabled={!!busy}
                      onChange={(e) => addToBoard(e.target.value)}>
                <option value="">add to board...</option>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select className="search" style={{ flex: "0 0 160px", padding: "6px 8px" }} value="" disabled={!!busy}
                      onChange={(e) => setHaus(e.target.value)}>
                <option value="">set haus...</option>
                {hauses.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
              </select>
              <button className="btn" onClick={() => addToTray([...selected])}>Compare</button>
              <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          {msg && <span className="hint">{msg}</span>}
          {tray.length > 0 && <Link className="btn" data-primary="true" href={`/compare?ids=${tray.join(",")}`}>Compare tray ({tray.length})</Link>}
        </div>
      )}

      <div className="grid" ref={gridRef}>
        {columns.map((col, c) => (
        <div className="grid-col" key={c}>
        {col.map((i) => {
          const it = items[i]!;
          const on = selected.has(it.id);
          const isVideo = it.hasVideo;
          return (
            <div className="card" id={`card-${it.id}`} key={it.id} data-selected={on} data-focus={i === focus}>
              <Link href={`/item/${it.id}`} onClick={(e) => { if (e.shiftKey || e.metaKey || e.ctrlKey) { e.preventDefault(); toggle(it.id); } }}>
                <img src={`/api/asset/${it.sha256}/grid`} alt={it.captionAi ?? it.title ?? "reference"}
                     width={it.width ?? 400} height={it.height ?? 300} loading={i < 12 ? "eager" : "lazy"} decoding="async" />
              </Link>
              <button type="button" className="select-dot" data-on={on} title="Select (x)" onClick={() => toggle(it.id)}>{on ? "✓" : ""}</button>
              <div className="tile-tl">
                {it.haus && <span className="glass haus">{it.haus}</span>}
                {it.needsReview > 0 && <span className="review-dot" title={`${it.needsReview} tag${it.needsReview === 1 ? "" : "s"} to review`} />}
              </div>
              <div className="tile-tr">
                {/* REF-02: a card is a post. One mark says what is inside it. */}
                {isVideo ? (
                  <span className="glass" title="Video"><PlayIcon />{it.videoSeconds ? clock(it.videoSeconds) : it.mediaCount > 1 ? it.mediaCount : ""}</span>
                ) : it.mediaCount > 1 ? (
                  <span className="glass" title={`${it.mediaCount} images in this post`}><StackIcon />{it.mediaCount}</span>
                ) : ["instagram", "pinterest", "web", "share"].includes(it.sourceKind ?? "") ? (
                  <span className="glass"><SourceIcon kind={it.sourceKind} /></span>
                ) : null}
              </div>
              <div className="tile-meta">
                <h3>{displayName(it.captionAi, it.title)}</h3>
              </div>
            </div>
          );
        })}
        </div>
        ))}
      </div>
    </>
  );
}

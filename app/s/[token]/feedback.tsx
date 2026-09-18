"use client";

import { useEffect, useState } from "react";

type Item = { id: string; sha256: string; caption: string | null; likes: number };

/**
 * The client side of a shared board. A name is asked once and remembered in
 * this browser so a couple reviewing on two phones read as two people.
 */
export function Feedback({ token, items }: { token: string; items: Item[] }) {
  const [viewer, setViewer] = useState("");
  const [asked, setAsked] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("palette.viewer") ?? "";
      setViewer(v);
      setAsked(!!v);
      setLiked(new Set(JSON.parse(localStorage.getItem(`palette.liked.${token}`) ?? "[]")));
    } catch { /* private mode */ }
  }, [token]);

  async function like(item: Item) {
    if (!viewer) { setAsked(false); return; }
    const on = !liked.has(item.id);
    const next = new Set(liked);
    on ? next.add(item.id) : next.delete(item.id);
    setLiked(next);
    try { localStorage.setItem(`palette.liked.${token}`, JSON.stringify([...next])); } catch { /* ignore */ }
    await fetch(`/api/s/${token}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, viewer, sentiment: on ? "like" : "no" }),
    }).catch(() => {});
  }

  if (!asked) {
    return (
      <form className="client-ask" onSubmit={(e) => { e.preventDefault(); if (viewer.trim()) { try { localStorage.setItem("palette.viewer", viewer.trim()); } catch { /* ignore */ } setAsked(true); } }}>
        <label>Your first name, so we know whose picks these are</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="search" value={viewer} onChange={(e) => setViewer(e.target.value)} placeholder="e.g. Sarah" autoFocus />
          <button className="btn" data-primary="true" type="submit">Continue</button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="client-grid">
        {items.map((it) => (
          <figure key={it.id} className="client-card" data-liked={liked.has(it.id)}>
            <img src={`/api/asset/${it.sha256}/grid?s=${token}`} alt={it.caption ?? ""} loading="lazy" onClick={() => setOpen(it)} />
            <button type="button" className="like" onClick={() => like(it)} aria-pressed={liked.has(it.id)}>
              {liked.has(it.id) ? "♥ Liked" : "♡ Like"}
            </button>
          </figure>
        ))}
      </div>
      {open && (
        <div className="client-lightbox" onClick={() => setOpen(null)}>
          <img src={`/api/asset/${open.sha256}/detail?s=${token}`} alt={open.caption ?? ""} />
        </div>
      )}
    </>
  );
}

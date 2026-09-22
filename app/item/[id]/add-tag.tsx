"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Term = { id: string; label: string; facetKey: string; facetLabel: string; synonyms?: string[] };
type Facet = { key: string; label: string };
type Proposal = { id: string; label: string; facetKey: string; facetLabel: string; occurrences: number };
type Near = { id: string; label: string; facetKey: string; facetLabel: string; via: string };

/**
 * REF-01 FR-16, loosened 2026-09-22. Type a word: what the vocabulary has
 * comes up as you type (by label or synonym), and the model's own pending
 * proposals sit in the same list. A word nobody has can be created here, in
 * a facet of the person's choosing; the server first looks for the same
 * thing under another spelling and asks before making a second term.
 */
export function AddTag({ itemId, slide, terms, facets, proposals = [] }: {
  itemId: string; slide?: number; terms: Term[]; facets: Facet[]; proposals?: Proposal[];
}) {
  void slide;
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState(facets.find((f) => f.key === "space")?.key ?? facets[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [near, setNear] = useState<Near[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) box.current?.focus(); }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return terms.slice(0, 0);
    const score = (t: Term) => {
      const l = t.label.toLowerCase();
      if (l === needle) return 0;
      if (l.startsWith(needle)) return 1;
      if (l.includes(needle) || needle.startsWith(l)) return 2;
      if ((t.synonyms ?? []).some((s) => s.toLowerCase().includes(needle))) return 3;
      return 9;
    };
    return terms.map((t) => ({ t, s: score(t) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s || a.t.label.localeCompare(b.t.label)).slice(0, 8).map((x) => x.t);
  }, [terms, needle]);
  const proposed = useMemo(() => needle ? proposals.filter((p) => p.label.toLowerCase().includes(needle)).slice(0, 3) : proposals.slice(0, 3), [proposals, needle]);
  const exact = matches.some((t) => t.label.toLowerCase() === needle);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/taxonomy/terms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, itemId }) });
      const json = (await res.json()) as { error?: string; near?: Near[] };
      if (res.status === 409 && json.near) { setNear(json.near); return; }
      if (!res.ok) throw new Error(json.error ?? "That did not save.");
      setQ(""); setNear(null); setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="btn" onClick={() => setOpen(true)} style={{ marginTop: 6 }}>+ add a tag</button>;

  return (
    <div className="addtag">
      <div className="addtag-row">
        <input ref={box} className="search" value={q} disabled={busy} placeholder="Type a word: foyer, terrazzo, arched..."
               onChange={(e) => { setQ(e.target.value); setNear(null); setError(null); }}
               onKeyDown={(e) => {
                 if (e.key === "Escape") { setOpen(false); setQ(""); }
                 if (e.key === "Enter" && needle) { e.preventDefault(); if (matches[0] && (exact || matches.length === 1)) void post({ use: matches[0].id }); else void post({ facet, label: q.trim() }); }
               }} />
        <button className="btn" type="button" onClick={() => { setOpen(false); setQ(""); }}>Done</button>
      </div>

      {(matches.length > 0 || proposed.length > 0 || needle) && !near && (
        <div className="addtag-list">
          {matches.map((t) => (
            <button key={t.id} type="button" className="addtag-opt" disabled={busy} onClick={() => void post({ use: t.id })}>
              {t.label} <span className="hint">{t.facetLabel}</span>
            </button>
          ))}
          {proposed.map((p) => (
            <button key={p.id} type="button" className="addtag-opt" data-kind="proposal" disabled={busy}
                    onClick={() => void post({ facet: p.facetKey, label: p.label })}>
              + {p.label.charAt(0).toUpperCase() + p.label.slice(1)} <span className="hint">the model saw this {p.occurrences === 1 ? "once" : `${p.occurrences} times`} · {p.facetLabel}</span>
            </button>
          ))}
          {needle && !exact && (
            <div className="addtag-new">
              <span>Create <b>{q.trim()}</b> as a</span>
              <select className="search" value={facet} onChange={(e) => setFacet(e.target.value)} style={{ padding: "4px 8px", fontSize: 12 }}>
                {facets.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <button className="btn" data-primary="true" type="button" disabled={busy} onClick={() => void post({ facet, label: q.trim() })}>Create</button>
            </div>
          )}
        </div>
      )}

      {near && (
        <div className="addtag-near">
          <p className="hint" style={{ margin: "0 0 6px" }}>
            The vocabulary has something close to <b>{q.trim()}</b>. Is it the same thing?
          </p>
          {near.map((n) => (
            <div key={n.id} className="addtag-row" style={{ marginBottom: 6 }}>
              <span style={{ flex: 1 }}><b>{n.label}</b> <span className="hint">{n.facetLabel}</span></span>
              <button className="btn" type="button" disabled={busy} onClick={() => void post({ use: n.id })}>Use {n.label}</button>
              <button className="btn" type="button" disabled={busy} title={`Adds "${q.trim()}" as another word for ${n.label}, so both find it`}
                      onClick={() => void post({ synonymOf: n.id, label: q.trim() })}>Same thing</button>
            </div>
          ))}
          <button className="btn" data-primary="true" type="button" disabled={busy} onClick={() => void post({ facet, label: q.trim(), force: true })}>
            Different: create {q.trim()}
          </button>
        </div>
      )}

      {error && <p className="hint" style={{ color: "var(--warn)", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

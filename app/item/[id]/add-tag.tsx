"use client";

import { useState } from "react";

type Term = { id: string; label: string; facetKey: string; facetLabel: string };

/**
 * REF-01 FR-16. The only tags a person can add here are tags the vocabulary
 * already has. Closed facets grow through proposals, not through a text box,
 * which is how every shared tag system ends up with five words for one tile.
 */
export function AddTag({ itemId, slide, terms, action }: { itemId: string; slide?: number; terms: Term[]; action: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn" onClick={() => setOpen(true)} style={{ marginTop: 6 }}>+ add a tag</button>;

  const grouped = terms.reduce<Record<string, Term[]>>((acc, t) => ((acc[t.facetLabel] ??= []).push(t), acc), {});

  return (
    <form action={action} style={{ marginTop: 8, display: "flex", gap: 6 }}>
      <input type="hidden" name="itemId" value={itemId} />
      {slide ? <input type="hidden" name="slide" value={slide} /> : null}
      <input type="hidden" name="action" value="add" />
      <select name="termId" className="search" style={{ padding: "6px 8px", fontSize: 12 }} defaultValue="">
        <option value="" disabled>choose a term...</option>
        {Object.entries(grouped).map(([facet, list]) => (
          <optgroup key={facet} label={facet}>
            {list.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      <button className="btn" data-primary="true" type="submit">add</button>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The lookbook question on the save sheet: an existing one, or a new one named
 * right here (Trevor, 2026-09-24: "the ability to create a new lookbook from
 * that first screen"). The form sends board=__new with board_name, and /share
 * creates it and puts the post in.
 */
export function LookbookField({ lookbooks }: { lookbooks: Array<{ id: string; name: string }> }) {
  const [choice, setChoice] = useState("");
  const name = useRef<HTMLInputElement>(null);
  const isNew = choice === "__new";
  useEffect(() => { if (isNew) name.current?.focus(); }, [isNew]);

  return (
    <>
      <select name="board" className="search" value={choice} onChange={(e) => setChoice(e.target.value)} style={{ width: "100%" }}>
        <option value="">None</option>
        {lookbooks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="__new">+ New lookbook...</option>
      </select>
      {isNew && (
        <input ref={name} name="board_name" className="search" required minLength={2} maxLength={80}
               placeholder="Name it, e.g. Hurst primary bath" style={{ width: "100%", marginTop: 8 }} />
      )}
    </>
  );
}

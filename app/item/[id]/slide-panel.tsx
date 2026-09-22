"use client";

import { Children, useEffect, useState, type ReactNode } from "react";

/**
 * Shows the child that belongs to the slide the carousel is on. The children
 * are server-rendered (their forms are server actions), so this only chooses
 * which one is visible; it listens for the carousel's "palette:slide" event.
 */
export function SlidePanel({ start, children }: { start: number; children: ReactNode }) {
  const [cur, setCur] = useState(start);
  useEffect(() => { setCur(start); }, [start]);
  useEffect(() => {
    const on = (e: Event) => setCur((e as CustomEvent<number>).detail);
    window.addEventListener("palette:slide", on);
    return () => window.removeEventListener("palette:slide", on);
  }, []);
  const kids = Children.toArray(children);
  return <>{kids.map((k, i) => <div key={i} hidden={i !== cur}>{k}</div>)}</>;
}

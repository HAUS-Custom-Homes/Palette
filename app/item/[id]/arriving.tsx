"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A share lands on the post as soon as its first picture is saved; the rest
 * are fetched in the background. Without this the page looked like a post of
 * one (Trevor, 2026-09-24: "it only imported one of the photos"). It says how
 * many are still coming and refreshes itself until they are all here.
 *
 * It gives up quietly when the count stops moving for twenty seconds: some
 * slides never come (a video Instagram withholds), and "2 more on the way"
 * must not stay on screen as a promise nobody keeps. The strip under the
 * carousel already says what is missing and links to the post.
 */
export function Arriving({ have, expect }: { have: number; expect: number }) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  const last = useRef({ have, at: Date.now() });
  const waiting = have < expect && !stalled;

  useEffect(() => {
    if (have !== last.current.have) last.current = { have, at: Date.now() };
  }, [have]);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      if (Date.now() - last.current.at > 20_000) { setStalled(true); clearInterval(t); }
      else router.refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [waiting, router]);

  if (!waiting) return null;
  const left = expect - have;
  return (
    <div className="notice savebar-progress arriving" role="status" aria-live="polite" style={{ margin: "0 0 16px" }}>
      <div className="track-line" data-known="true"><span style={{ width: `${Math.max(8, Math.round((have / expect) * 100))}%` }} /></div>
      <p><b>Saved {have} of {expect} pictures.</b> {left} more {left === 1 ? "is" : "are"} on the way; they appear here by themselves.</p>
    </div>
  );
}

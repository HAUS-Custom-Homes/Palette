"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A share lands on the post as soon as its first picture is saved; the rest
 * are fetched in the background. Without this the page looked like a post of
 * one (Trevor, 2026-09-24: "it only imported one of the photos"). It says how
 * many are still coming and refreshes itself until they are all here, for a
 * minute and a half at most.
 */
export function Arriving({ have, expect }: { have: number; expect: number }) {
  const router = useRouter();
  const waiting = have < expect;
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 90_000) clearInterval(t);
      else router.refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [waiting, router]);

  if (!waiting) return null;
  const left = expect - have;
  return (
    <p className="notice" style={{ margin: "0 0 16px" }}>
      <b>Saving the rest of the post.</b> {have} of {expect} here; {left} more {left === 1 ? "picture is" : "pictures are"} on the way and will appear by themselves.
    </p>
  );
}

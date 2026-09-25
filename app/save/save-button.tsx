"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The one button on the save sheet, and what it turns into once tapped: a bar
 * that moves and a line that says what is happening, so nobody taps twice or
 * wonders whether it worked (Trevor, 2026-09-24). The form still posts
 * natively to /share; the page changes to the post when the first picture is
 * saved, and the post page carries on with the rest (see arriving.tsx).
 */
export function SaveButton({ site }: { site: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onSubmit = () => setSaving(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  useEffect(() => {
    if (!saving) return;
    const a = setTimeout(() => setStep(1), 1800);
    const b = setTimeout(() => setStep(2), 5000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [saving]);

  // Coming back to this page with the browser's Back button: ready again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { setSaving(false); setStep(0); } };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const words = [
    `Getting the post from ${site || "the link"}...`,
    "Saving the pictures at full size...",
    "Almost there. Opening the post...",
  ];

  return (
    <div ref={ref} className="savego" data-saving={saving}>
      {saving ? (
        <div className="savebar-progress" role="status" aria-live="polite">
          <div className="track-line"><span /></div>
          <p>{words[step]}</p>
        </div>
      ) : (
        <button className="btn solid big savego-btn" type="submit">Save</button>
      )}
    </div>
  );
}

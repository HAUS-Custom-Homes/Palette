import { A_W, markBody, wordmarkSvg, type Variant } from "@/brand/mark";

/**
 * The Palette mark, inline. `open` plays the save: the two strips start
 * closed on the rivet and swing out into the HAUS A (rules in look.css).
 */
export function Mark({ variant = "full", open = false, className, title }: { variant?: Variant; open?: boolean; className?: string; title?: string }) {
  return (
    <svg
      className={["pmark", open ? "pmark-open" : "", className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${A_W} 100`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markBody(variant) }}
    />
  );
}

/** PALETTE in capitals with the roof A, in currentColor. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={["pword", className].filter(Boolean).join(" ")} aria-hidden="true" dangerouslySetInnerHTML={{ __html: wordmarkSvg() }} />;
}

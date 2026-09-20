/**
 * The handful of glyphs the tiles need, inline so there is no icon font to
 * load and nothing to fail offline. 24-unit box, stroke follows text colour.
 */
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const PlayIcon = () => (<svg {...base}><path d="M7 4v16l13-8z" fill="currentColor" stroke="none" /></svg>);
export const StackIcon = () => (<svg {...base}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>);
export const SearchIcon = () => (<svg {...base} width={20} height={20}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const InstagramIcon = () => (<svg {...base}><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.5" /><path d="M16.8 7.2h.01" /></svg>);
export const PinterestIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M11.5 8.5c2-.6 4 .6 4 2.8 0 2-1.400 3.400-3 3.400-.9 0-1.500-.4-1.800-1M12 9l-2.200 9" /></svg>);
export const GlobeIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.800 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18" /></svg>);
export const PhoneIcon = () => (<svg {...base}><rect x="7" y="3" width="10" height="18" rx="2.500" /><path d="M11 18h2" /></svg>);

export function SourceIcon({ kind }: { kind: string | null }) {
  if (kind === "instagram") return <InstagramIcon />;
  if (kind === "pinterest") return <PinterestIcon />;
  if (kind === "web") return <GlobeIcon />;
  if (kind === "share") return <PhoneIcon />;
  return null;
}

/**
 * What to call an image. The model's caption when there is one; otherwise the
 * title it arrived with. The no-key tagger's placeholder caption is not a name.
 */
export function displayName(captionAi: unknown, title: unknown): string {
  const c = typeof captionAi === "string" ? captionAi.trim() : "";
  const t = typeof title === "string" ? title.trim() : "";
  if (c && !/^untagged reference/i.test(c)) return c;
  return t || c || "Untitled reference";
}

/** 74.3 -> "1:14" */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

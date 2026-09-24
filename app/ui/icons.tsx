/**
 * The handful of glyphs the tiles need, inline so there is no icon font to
 * load and nothing to fail offline. 24-unit box, stroke follows text colour.
 */
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const PlayIcon = () => (<svg {...base}><path d="M7 4v16l13-8z" fill="currentColor" stroke="none" /></svg>);
export const StackIcon = () => (<svg {...base}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>);
export const SearchIcon = () => (<svg {...base} width={20} height={20}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const GearIcon = () => (<svg {...base} width={19} height={19}><path d="M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.6 1.1 1.7 1.7 0 0 1 2.4 2.4 1.7 1.7 0 0 0 1 2.5 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1 2.6 1.7 1.7 0 0 1-2.4 2.4 1.7 1.7 0 0 0-2.6 1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.5-1 1.7 1.7 0 0 1-2.4-2.4 1.7 1.7 0 0 0-1.1-2.6 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1.1-2.5 1.7 1.7 0 0 1 2.4-2.4 1.7 1.7 0 0 0 2.5-1.1z" /><circle cx="12" cy="12" r="3" /></svg>);
/** The settings menu's own small glyphs. */
export const MenuIcons = {
  phone: () => (<svg {...base}><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></svg>),
  sliders: () => (<svg {...base}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>),
  tags: () => (<svg {...base}><path d="M3 12.5V5a2 2 0 0 1 2-2h7.5l8.5 8.5a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0z" /><circle cx="8" cy="8" r="1.5" /></svg>),
  people: () => (<svg {...base}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a6.5 6.5 0 0 1 3 6" /></svg>),
  history: () => (<svg {...base}><path d="M12 8v4l3 2" /><path d="M3.1 11a9 9 0 1 1 .5 4M3 4v5h5" /></svg>),
  out: () => (<svg {...base}><path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3M9 12h12M18 9l3 3-3 3" /></svg>),
};
export const FilterIcon = () => (<svg {...base}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>);
export const InstagramIcon =() => (<svg {...base}><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.5" /><path d="M16.8 7.2h.01" /></svg>);
export const PinterestIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M11.5 8.5c2-.6 4 .6 4 2.8 0 2-1.400 3.400-3 3.400-.9 0-1.500-.4-1.800-1M12 9l-2.200 9" /></svg>);
export const GlobeIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.800 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18" /></svg>);
export const PhoneIcon = () => (<svg {...base}><rect x="7" y="3" width="10" height="18" rx="2.500" /><path d="M11 18h2" /></svg>);

export const MutedIcon = () => (<svg {...base} width={18} height={18}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m17 9 5 6M22 9l-5 6" /></svg>);
export const SoundIcon = () => (<svg {...base} width={18} height={18}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 8.500a5 5 0 0 1 0 7M19.800 6a9 9 0 0 1 0 12" /></svg>);
export const ExpandIcon = () => (<svg {...base} width={18} height={18}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);

export type Platform = "instagram" | "pinterest" | "tiktok" | "youtube" | "web" | "phone";

/**
 * Where a card came from, as the person would say it. The kind alone is not
 * enough: a TikTok link arrives as "web" or "share", and a photo shared from
 * the phone has no address at all.
 */
export function platformOf(kind: string | null, url: string | null): Platform | null {
  let host = "";
  try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* not a url */ }
  if (kind === "instagram" || /(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (kind === "pinterest" || /(^|\.)pinterest\.[a-z.]+$/.test(host) || host === "pin.it") return "pinterest";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") return "youtube";
  if (host) return "web";
  if (kind === "share" || kind === "upload" || kind === "watch_folder" || kind === "email") return "phone";
  return null;
}

export const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram", pinterest: "Pinterest", tiktok: "TikTok", youtube: "YouTube", web: "a website", phone: "a phone or an upload",
};

const solid = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;

/** The ghosted mark in a card's corner. Sized and faded by CSS (.ghost). */
export function PlatformMark({ platform }: { platform: Platform }) {
  switch (platform) {
    case "instagram":
      return (<svg {...base} strokeWidth={1.9}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="currentColor" /></svg>);
    case "pinterest":
      return (<svg {...solid}><path d="M12 2.5a9.5 9.5 0 0 0-3.46 18.35c-.08-.75-.16-1.9.03-2.72l1.1-4.68s-.28-.56-.28-1.4c0-1.3.76-2.28 1.7-2.28.8 0 1.2.6 1.2 1.33 0 .8-.52 2.02-.78 3.14-.22.94.47 1.7 1.4 1.7 1.67 0 2.96-1.77 2.96-4.32 0-2.26-1.62-3.84-3.94-3.84a4.08 4.08 0 0 0-4.26 4.1c0 .8.31 1.68.7 2.15.08.1.09.18.07.27l-.26 1.07c-.04.17-.14.21-.32.13-1.18-.55-1.92-2.28-1.92-3.67 0-2.98 2.17-5.72 6.25-5.72 3.28 0 5.83 2.34 5.83 5.46 0 3.26-2.05 5.88-4.9 5.88-.96 0-1.86-.5-2.17-1.09l-.59 2.25c-.21.82-.79 1.85-1.18 2.48A9.5 9.5 0 1 0 12 2.5z" /></svg>);
    case "tiktok":
      return (<svg {...solid}><path d="M14.5 3h2.7c.2 1.9 1.3 3.4 3.3 3.7v2.8c-1.2 0-2.3-.3-3.3-.9v6.1c0 3.2-2.3 5.3-5.2 5.3-3 0-5.2-2.3-5.2-5.1 0-3.1 2.6-5.4 5.9-5v2.9c-1.6-.4-3 .6-3 2.1 0 1.3 1 2.3 2.3 2.3 1.4 0 2.5-1 2.5-2.700z" /></svg>);
    case "youtube":
      return (<svg {...base} strokeWidth={1.9}><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="M10.5 9.500v5l4.200-2.500z" fill="currentColor" stroke="none" /></svg>);
    case "web":
      return (<svg {...base} strokeWidth={1.9}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.800 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18" /></svg>);
    case "phone":
      return (<svg {...base} strokeWidth={1.9}><path d="M4 8.500A2.500 2.500 0 0 1 6.500 6H8l1.500-2h5L16 6h1.500A2.500 2.500 0 0 1 20 8.500v8a2.500 2.500 0 0 1-2.500 2.500h-11A2.500 2.500 0 0 1 4 16.500z" /><circle cx="12" cy="12.500" r="3.500" /></svg>);
  }
}

export function SourceIcon({ kind }: { kind: string | null }) {
  if (kind === "instagram") return <InstagramIcon />;
  if (kind === "pinterest") return <PinterestIcon />;
  if (kind === "web") return <GlobeIcon />;
  if (kind === "share") return <PhoneIcon />;
  return null;
}

/**
 * Who saved it: their Google picture when there is one, their initials when
 * there is not, and their first name. Small enough to sit under a card's title.
 */
export function By({ name, image, prefix }: { name: string; image?: string | null; prefix?: string }) {
  const word = name.trim().split(/\s+/)[0] ?? name;
  const first = word.charAt(0).toUpperCase() + word.slice(1);
  const initials = name.trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className="by-line" title={`Saved by ${name}`}>
      {image
        ? <img className="by-face" src={image} alt="" referrerPolicy="no-referrer" loading="lazy" />
        : <span className="by-face" aria-hidden>{initials}</span>}
      {prefix ? `${prefix} ${first}` : first}
    </span>
  );
}

/**
 * What to call an image. The model's caption when there is one; otherwise the
 * title it arrived with. The no-key tagger's placeholder caption is not a name.
 */
export function displayName(captionAi: unknown, title: unknown): string {
  const c = typeof captionAi === "string" ? captionAi.trim() : "";
  const t = typeof title === "string" ? title.trim() : "";
  // What the post's author wrote is the post's name. The model's description
  // stands in only where the title is a file name ("IMG 4821") or missing.
  const sentence = t.split(/\s+/).length >= 3 && !/^(img|dsc|pxl|image|screenshot|photo)[\s_-]*\d/i.test(t);
  if (sentence) return t;
  if (c && !/^untagged reference/i.test(c)) return c;
  return t || c || "Untitled reference";
}

/** 74.3 -> "1:14" */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

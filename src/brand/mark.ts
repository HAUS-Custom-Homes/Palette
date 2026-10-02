import { GLYPHS } from "./glyphs";

/**
 * The Palette mark, the one source for every icon, the app and the extension.
 *
 * Two paint strips hung on one rivet, opened to the HAUS A: the A in the
 * official 2025 HAUS lockup, measured from the file (446 px tall in the
 * 1957 px lockup, legs leaning 23.4 degrees, feet cut flat, the right leg a
 * little heavier). Units: the A is 100 tall and A_W wide. Chosen by Trevor
 * on 2026-10-02 after four rounds (the board is linked from docs/BRAND.md).
 *
 * Plain strings, no React and no DOM, so tools/make-icons.ts can hand the
 * same SVG to sharp that the app renders inline.
 */

export const A_W = 108.97;
export const RIVET = { x: 53.6, y: 10.5 };
/** Each leg, already trimmed so the two together are exactly the HAUS A. */
const LEG_L = "M0 100 43.27 0H65.92L22.87 100Z";
const LEG_R = "M84.08 100 42.15 2.6 43.27 0H65.92L108.97 100Z";
/** Where the brass strip's edge lies over the cream one. */
const SEAM = "M41.1 0 55.5 33.5";
/** Swatch cuts at a third and two thirds, level with the feet. */
const BANDS: [number, number][] = [[-5, 32.43], [34.23, 65.77], [67.57, 105]];

type Look = {
  L: [string, string, string];
  R: [string, string, string];
  bg: string;
  bands: boolean;
  /** Width of the gap where brass laps over cream, 0 for none. */
  seam: number;
  ring?: string;
};

const CREAM: Look["L"] = ["#f5f0e6", "#ddd3c2", "#bcb09c"];
const BRASS: Look["R"] = ["#ebce9a", "#d4a868", "#ab8443"];
const flat = (c: string): [string, string, string] => [c, c, c];

export const LOOKS = {
  /** App icon, share sheet, anything 48 px and up. */
  full: { L: CREAM, R: BRASS, bg: "#0a0a09", bands: true, seam: 1.6, ring: "#8c6a33" },
  /** 32 px and below: the cuts and rivet are the first things to blur. */
  simple: { L: flat("#f5f0e6"), R: flat("#d4a868"), bg: "#0a0a09", bands: false, seam: 2.2 },
  /** 16 px. */
  tiny: { L: flat("#f5f0e6"), R: flat("#d4a868"), bg: "#0a0a09", bands: false, seam: 0 },
  /** Ink and brass on limestone, the HAUS brand guide colours. Paper and the client page. */
  paper: { L: ["#514a40", "#3a342c", "#221e19"], R: ["#c9a76f", "#a07c45", "#7d5f31"], bg: "#f5f0e6", bands: true, seam: 1.6, ring: "#5e4724" },
  brass: { L: flat("#d4a868"), R: flat("#d4a868"), bg: "#0a0a09", bands: true, seam: 1.8, ring: "#d4a868" },
  ink: { L: flat("#221e19"), R: flat("#221e19"), bg: "#f5f0e6", bands: true, seam: 1.8, ring: "#221e19" },
} satisfies Record<string, Look>;
export type Variant = keyof typeof LOOKS;

/**
 * The mark's contents in A units (viewBox 0 0 A_W 100). The cuts, seam and
 * rivet hole are masks, not painted gaps, so the mark sits on any ground.
 * Legs carry the classes `pm-l` and `pm-r` for the save animation, which
 * swings each on the rivet.
 */
export function markBody(v: Variant): string {
  const o: Look = LOOKS[v];
  const id = `pm-${v}`;
  const hole = o.ring ? `<circle cx="${RIVET.x}" cy="${RIVET.y}" r="1.7" fill="#000"/>` : "";
  const fills = (c: Look["L"]) => o.bands
    ? BANDS.map(([y0, y1], i) => `<rect x="-5" y="${y0}" width="120" height="${+(y1 - y0).toFixed(2)}" fill="${c[i]}"/>`).join("")
    : `<rect x="-5" y="-5" width="120" height="110" fill="${c[1]}"/>`;
  const seam = o.seam ? `<path d="${SEAM}" stroke="#000" stroke-width="${o.seam * 2}"/>` : "";
  const ring = o.ring
    ? `<circle cx="${RIVET.x}" cy="${RIVET.y}" r="2.55" fill="none" stroke="${o.ring}" stroke-width="1.7"/>`
    : "";
  return `<defs>`
    + `<clipPath id="${id}-l"><path d="${LEG_L}"/></clipPath><clipPath id="${id}-r"><path d="${LEG_R}"/></clipPath>`
    + `<mask id="${id}-ml" maskUnits="userSpaceOnUse" x="-10" y="-10" width="130" height="120"><rect x="-10" y="-10" width="130" height="120" fill="#fff"/>${seam}${hole}</mask>`
    + `<mask id="${id}-mr" maskUnits="userSpaceOnUse" x="-10" y="-10" width="130" height="120"><rect x="-10" y="-10" width="130" height="120" fill="#fff"/>${hole}</mask>`
    + `</defs>`
    + `<g class="pm-l"><g mask="url(#${id}-ml)"><g clip-path="url(#${id}-l)">${fills(o.L)}</g></g></g>`
    + `<g class="pm-r"><g mask="url(#${id}-mr)"><g clip-path="url(#${id}-r)">${fills(o.R)}</g>${ring}</g></g>`;
}

/** The mark alone, on nothing. */
export function markSvg(v: Variant, size?: number): string {
  const dims = size ? ` width="${size}" height="${+(size * 100 / A_W).toFixed(2)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A_W} 100"${dims}>${markBody(v)}</svg>`;
}

/**
 * The app tile: the mark at 58% of the tile's width, nudged up a hair so it
 * sits optically centred. `scale` shrinks it for maskable icons, whose
 * edges the phone crops; `radius` rounds the tile (0 for square).
 */
export function tileSvg(v: Variant, { size = 512, scale = 1, radius = 0 }: { size?: number; scale?: number; radius?: number } = {}): string {
  const k = (58.3 / A_W) * scale;
  const tx = 50 - (A_W / 2) * k, ty = 49.4 - 50 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`
    + `<rect width="100" height="100" rx="${radius}" fill="${LOOKS[v].bg}"/>`
    + `<g transform="translate(${+tx.toFixed(3)} ${+ty.toFixed(3)}) scale(${+k.toFixed(5)})">${markBody(v)}</g></svg>`;
}

/* ---------- The name ---------- */

/** The roof A, drawn at the stem weight of Montserrat Medium so it sits in a line of type. */
function roofA(): { d: string; w: number } {
  const k = Math.tan((23.4 * Math.PI) / 180), hw = 14.2 / Math.cos((23.4 * Math.PI) / 180);
  const w = 2 * 100 * k + hw, apexY = 100 - (w - 2 * hw) / (2 * k);
  const f = (n: number) => +n.toFixed(2);
  return { d: `M0 100 ${f(100 * k)} 0H${f(100 * k + hw)}L${f(w)} 100H${f(w - hw)}L${f(w / 2)} ${f(apexY)} ${f(hw)} 100Z`, w };
}

/**
 * A line of capitals as outlines, cap height 100, baseline at 100. Spacing
 * is ink to ink, the way the HAUS lockup's own lines are set: CUSTOM HOMES
 * runs 0.83 cap heights between letters and 2 between words; EST 2017
 * runs 0.88 and 5.4. Every A is the roof A.
 */
export function setCaps(text: string, gap: number, wordGap: number): { d: string; w: number } {
  const parts: string[] = [];
  let x = 0, first = true;
  for (const word of text.split(" ")) {
    if (!first) x += wordGap - gap;
    for (const ch of word) {
      if (!first) x += gap;
      first = false;
      if (ch === "A") {
        const a = roofA();
        parts.push(`<path transform="translate(${+x.toFixed(2)} 0)" d="${a.d}"/>`);
        x += a.w;
      } else {
        const g = GLYPHS[ch];
        if (!g) throw new Error(`no outline for "${ch}"`);
        parts.push(`<path transform="translate(${+(x - g.xmin).toFixed(2)} 0)" d="${g.d}"/>`);
        x += g.xmax - g.xmin;
      }
    }
  }
  return { d: parts.join(""), w: x };
}

export const wordmark = () => setCaps("PALETTE", 83, 200);

/** PALETTE on its own, in currentColor, for the app's top bar. */
export function wordmarkSvg(): string {
  const wm = wordmark();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+wm.w.toFixed(2)} 100" fill="currentColor">${wm.d}</svg>`;
}

/* ---------- Lockup 2: HAUS, a hairline, then Palette ---------- */

/**
 * Built in the official lockup file's own pixel space (1957 x 796) so every
 * line lands on a HAUS line: the mark is exactly as tall as the HAUS letters
 * (48 to 494), PALETTE sits on the CUSTOM HOMES line at its cap height (624
 * to 672), EST 2026 answers EST 2017 (728 to 754). The HAUS file is placed
 * untouched; `haus` is its URL (a public path, or a data URI for a file that
 * must stand alone).
 */
export const LOCKUP_INK = { dark: "#e9e9e0", paper: "#1a1714" } as const;
export function lockupSvg(theme: "dark" | "paper", haus: string): string {
  const fg = LOCKUP_INK[theme];
  const markV: Variant = theme === "dark" ? "full" : "paper";
  const aH = 446, aW = aH * A_W / 100;
  const name = wordmark(), est = setCaps("EST 2026", 88, 540);
  const nameS = 0.48, estS = 0.26;
  const hair = 1916 + 110, gx = hair + 3 + 110;
  const groupW = Math.max(aW, name.w * nameS, est.w * estS), cx = gx + groupW / 2;
  const W = Math.ceil(gx + groupW + 60);
  const f = (n: number) => +n.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} 796" width="${W}" height="796">`
    + `<image href="${haus}" xlink:href="${haus}" x="0" y="0" width="1957" height="796"/>`
    + `<rect x="${hair}" y="41" width="3" height="713" fill="${fg}" opacity=".35"/>`
    + `<g transform="translate(${f(cx - aW / 2)} 48) scale(4.46)">${markBody(markV)}</g>`
    + `<g fill="${fg}" transform="translate(${f(cx - (name.w * nameS) / 2)} 624) scale(${nameS})">${name.d}</g>`
    + `<g fill="${fg}" transform="translate(${f(cx - (est.w * estS) / 2)} 728) scale(${estS})">${est.d}</g>`
    + `</svg>`;
}

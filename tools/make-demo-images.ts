import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Generates a small synthetic library so the concept is demonstrable on a
 * machine with no images to hand and no network.
 *
 * These are flat colour panels with text, not photographs. They are here to
 * exercise the pipeline end to end, including the two cases worth proving:
 *   - an exact byte duplicate, which must collapse to one asset (FR-21)
 *   - a rescaled, recompressed copy, which must cluster as a variant (FR-22)
 *
 * Point "npm run import" at a folder of real images to see the real thing.
 */

type Spec = { name: string; label: string; bg: string; fg: string; w: number; h: number };

const SPECS: Spec[] = [
  { name: "kitchen-white-oak-island-real-photo", label: "Kitchen\nWhite oak island", bg: "#c9b8a0", fg: "#2b2119", w: 1400, h: 1000 },
  { name: "kitchen-marble-backsplash-rendering", label: "Kitchen\nMarble backsplash\n(rendering)", bg: "#e8e4dd", fg: "#3a3a38", w: 1400, h: 1000 },
  { name: "primary-bath-zellige-tile-shower", label: "Primary bath\nZellige tile shower", bg: "#a8c0bd", fg: "#1f2e2c", w: 1000, h: 1400 },
  { name: "primary-bath-marble-vanity-brass", label: "Primary bath\nMarble vanity, brass", bg: "#d8cfc4", fg: "#4a3b28", w: 1000, h: 1400 },
  { name: "powder-limewash-wall-sconce", label: "Powder\nLimewash wall", bg: "#b5a894", fg: "#2f2b24", w: 1000, h: 1300 },
  { name: "exterior-front-standing-seam-metal-roof", label: "Exterior front\nStanding seam metal", bg: "#8a9199", fg: "#16191c", w: 1600, h: 1000 },
  { name: "exterior-rear-board-and-batten-porch", label: "Exterior rear\nBoard and batten", bg: "#9aa392", fg: "#1c211a", w: 1600, h: 1000 },
  { name: "great-room-fireplace-plaster-beam", label: "Great room\nPlaster fireplace, beams", bg: "#ded5c8", fg: "#3b3227", w: 1500, h: 1000 },
  { name: "mudroom-shaker-cabinetry-bench", label: "Mudroom\nShaker cabinetry", bg: "#9fb0ae", fg: "#1e2b2a", w: 1200, h: 1200 },
  { name: "pantry-walnut-shelving-brass-hardware", label: "Pantry\nWalnut shelving", bg: "#8c6f52", fg: "#f2ece2", w: 1200, h: 1500 },
  { name: "stair-white-oak-tread-black-rail", label: "Stair\nWhite oak tread, black rail", bg: "#cdbfa8", fg: "#171514", w: 1000, h: 1500 },
  { name: "laundry-cement-tile-floor", label: "Laundry\nCement tile floor", bg: "#b9c4cb", fg: "#232b30", w: 1200, h: 1200 },
  { name: "outdoor-kitchen-limestone-grill", label: "Outdoor kitchen\nLimestone", bg: "#ccc3b2", fg: "#2f2a20", w: 1500, h: 1000 },
  { name: "study-walnut-built-in-bookcase", label: "Study\nWalnut built-in", bg: "#7a6450", fg: "#efe7db", w: 1400, h: 1000 },
  { name: "primary-bedroom-japandi-minimal", label: "Primary bedroom\nJapandi", bg: "#e2dcd2", fg: "#37332d", w: 1500, h: 1000 },
];

/**
 * A seeded PRNG, so each panel gets its own layout and the set is
 * reproducible. The first version of this generator drew the same bands and
 * the same circle in the same place on every panel, which made every image a
 * genuine structural near-duplicate of every other one: unrelated pairs landed
 * at dHash distance 3 to 12, the same range as a real rescaled copy. The
 * clustering code was right and the fixtures were lying to it.
 */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function svg(s: Spec): Buffer {
  const lines = s.label.split("\n");
  const fontSize = Math.round(Math.min(s.w, s.h) / 16);
  const r = rng(s.name);

  // Large blocks at varied positions. Coarse enough to survive an 8x8
  // reduction, which is the scale a perceptual hash actually sees.
  const blocks = Array.from({ length: 5 + Math.floor(r() * 4) }, () => {
    const x = Math.round(r() * s.w * 0.8);
    const y = Math.round(r() * s.h * 0.8);
    const w = Math.round(s.w * (0.12 + r() * 0.3));
    const h = Math.round(s.h * (0.1 + r() * 0.35));
    const op = (0.08 + r() * 0.3).toFixed(2);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.fg}" opacity="${op}"/>`;
  }).join("");

  const horizon = Math.round(s.h * (0.35 + r() * 0.3));
  const cx = Math.round(s.w * (0.15 + r() * 0.7));
  const cy = Math.round(s.h * (0.15 + r() * 0.5));
  const rad = Math.round(Math.min(s.w, s.h) * (0.08 + r() * 0.14));

  const textY = s.h * (0.7 + r() * 0.18);
  const text = lines
    .map(
      (l, i) =>
        `<text x="${s.w / 2}" y="${textY + (i - (lines.length - 1) / 2) * fontSize * 1.3}" ` +
        `font-family="Georgia, serif" font-size="${fontSize}" fill="${s.fg}" ` +
        `text-anchor="middle" dominant-baseline="middle">${l}</text>`,
    )
    .join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}">
       <rect width="100%" height="100%" fill="${s.bg}"/>
       <rect x="0" y="${horizon}" width="${s.w}" height="${s.h - horizon}" fill="${s.fg}" opacity="0.14"/>
       ${blocks}
       <circle cx="${cx}" cy="${cy}" r="${rad}" fill="${s.fg}" opacity="0.22"/>
       ${text}
     </svg>`,
  );
}

async function main() {
  const out = path.resolve("demo-images");
  await fs.mkdir(out, { recursive: true });

  for (const s of SPECS) {
    const buf = await sharp(svg(s)).jpeg({ quality: 88 }).toBuffer();
    await fs.writeFile(path.join(out, `${s.name}.jpg`), buf);
  }

  // FR-21: byte-identical copy. Must collapse into one asset on import.
  const first = SPECS[0];
  const original = await fs.readFile(path.join(out, `${first.name}.jpg`));
  await fs.writeFile(path.join(out, `${first.name}-EXACT-COPY.jpg`), original);

  // FR-22: same picture, smaller and recompressed, the way a re-pin arrives.
  // Different bytes, different hash, same image. Must cluster as a variant.
  const rescaled = await sharp(original).resize(700).jpeg({ quality: 62 }).toBuffer();
  await fs.writeFile(path.join(out, `${first.name}-RESAVED-SMALLER.jpg`), rescaled);

  console.log(`[demo] wrote ${SPECS.length + 2} images to ${out}`);
  console.log(`[demo]   1 exact duplicate  -> should collapse (FR-21)`);
  console.log(`[demo]   1 rescaled copy    -> should cluster as a variant (FR-22)`);
  console.log(`[demo] next: npm run import -- ./demo-images`);
}

main();

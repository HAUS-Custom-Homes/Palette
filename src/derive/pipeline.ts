import { encode as encodeBlurhash } from "blurhash";
import sharp, { type Sharp } from "sharp";
import { config } from "@/config";
import { derivedKey, store } from "@/storage/object-store";

// A small cloud container has under a gigabyte to live in. libvips' operation
// cache and a thread per core are the difference between saving a ten-image
// post and being killed for memory halfway through it.
sharp.cache(false);
sharp.concurrency(1);

/**
 * REF-01 FR-12, FR-22, FR-25.
 * Everything here is derived from the original and can be thrown away and
 * rebuilt. Nothing in this file is the system of record.
 */

export type Derived = {
  width: number;
  height: number;
  blurhash: string | null;
  dhash: string | null;
  phash: string | null;
  dominantColors: Array<{ r: number; g: number; b: number }>;
  variants: string[];
};

/**
 * FR-22. Difference hash: resize to 9x8 greyscale, then compare each pixel to
 * its right-hand neighbour. 64 comparisons, 64 bits. Cheap, and robust to
 * rescaling and re-compression, which is exactly how the same pin arrives
 * three times from three platforms.
 */
async function dHash(img: Sharp): Promise<string> {
  const { data } = await img
    .clone()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left < right ? "1" : "0";
    }
  }
  return bitsToHex(bits);
}

/**
 * FR-22. Average hash over a 8x8 reduction, kept alongside dHash because the
 * two fail in different ways and agreeing on both is a stronger signal than
 * either alone.
 */
async function aHash(img: Sharp): Promise<string> {
  const { data } = await img
    .clone()
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = data.reduce((a: number, b: number) => a + b, 0) / data.length;
  let bits = "";
  for (let i = 0; i < 64; i++) bits += data[i] >= mean ? "1" : "0";
  return bitsToHex(bits);
}

function bitsToHex(bits: string): string {
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Hamming distance between two 16-char hex hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** FR-25. A small palette, good enough to drive a color filter. */
async function dominantColors(img: Sharp) {
  const { data, info } = await img
    .clone()
    .resize(32, 32, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Quantise to a 32-step grid so near-identical pixels collapse together.
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.n += 1;
    buckets.set(key, cur);
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((c) => ({
      r: Math.round(c.r / c.n),
      g: Math.round(c.g / c.n),
      b: Math.round(c.b / c.n),
    }));
}

/**
 * Generates every derivative for an original and writes them to the store.
 * The original buffer is never modified, re-encoded, or written back.
 */
export async function derive(original: Buffer, hash: string): Promise<Derived> {
  // failOn: "none" so a slightly malformed file from a clip still ingests.
  // The original bytes are already safely stored either way.
  const img = sharp(original, { failOn: "none", animated: false });
  const meta = await img.metadata();

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const variants: string[] = [];

  for (const [name, size] of Object.entries(config.derivatives)) {
    const buf = await img
      .clone()
      .rotate() // honour EXIF orientation in the derivative only
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: name === "thumb" ? 70 : 82 })
      .toBuffer();

    const key = derivedKey(hash, name);
    await store().put(key, buf, "image/webp");
    variants.push(key);
  }

  let blurhash: string | null = null;
  try {
    const { data, info } = await img
      .clone()
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: "inside" })
      .toBuffer({ resolveWithObject: true });
    blurhash = encodeBlurhash(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      3,
    );
  } catch {
    blurhash = null; // A missing placeholder is cosmetic, never fatal.
  }

  const [dhash, phash, colors] = await Promise.all([
    dHash(img).catch(() => null),
    aHash(img).catch(() => null),
    dominantColors(img).catch(() => []),
  ]);

  return {
    width,
    height,
    blurhash,
    dhash,
    phash,
    dominantColors: colors,
    variants,
  };
}

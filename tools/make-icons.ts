import fs from "node:fs/promises";
import sharp from "sharp";
import { lockupSvg, markSvg, tileSvg, wordmarkSvg, type Variant } from "../src/brand/mark";

/**
 * Every icon and brand file, from the one geometry in src/brand/mark.ts.
 * Run once after changing the mark, commit the output.
 * Sizes 48 px and up wear the full mark; 32 px drops the cuts and rivet; 16 px drops the seam too.
 */
const pick = (n: number): Variant => (n >= 48 ? "full" : n >= 32 ? "simple" : "tiny");
/** Rendered large, then scaled to exactly `width` pixels. */
const png = (svg: string, out: string, width: number) =>
  sharp(Buffer.from(svg), { density: 300 }).resize({ width }).png().toFile(out);
const tile = (v: Variant, n: number, out: string, opts: { scale?: number; radius?: number } = {}) =>
  png(tileSvg(v, { size: n, ...opts }), out, n);

async function main() {
  await fs.mkdir("public/icons", { recursive: true });
  await fs.mkdir("public/brand", { recursive: true });

  // Installed app (Android, Windows, Chrome): rounded. Maskable and Apple: square, the OS rounds them.
  await tile("full", 192, "public/icons/icon-192.png", { radius: 22 });
  await tile("full", 512, "public/icons/icon-512.png", { radius: 22 });
  await tile("full", 512, "public/icons/icon-512-maskable.png", { scale: 0.8 });
  await tile("full", 180, "public/icons/apple-touch-icon.png");
  for (const n of [16, 32, 64]) await tile(pick(n), n, `public/icons/favicon-${n}.png`, { radius: 22 });

  // The browser extension wears the same mark.
  await fs.mkdir("extension/public/icon", { recursive: true });
  for (const n of [16, 32, 48, 96, 128]) await tile(pick(n), n, `extension/public/icon/${n}.png`, { radius: 22 });
  await fs.writeFile("extension/public/icon/mark.svg", markSvg("full"));
  await fs.writeFile("extension/public/icon/wordmark.svg", wordmarkSvg().replace('fill="currentColor"', 'fill="#f4f0e9"'));

  // Brand files for decks, print and the client page.
  for (const v of ["full", "paper", "brass", "ink"] as const) await fs.writeFile(`public/brand/palette-mark-${v}.svg`, markSvg(v));
  for (const theme of ["dark", "paper"] as const) {
    const file = theme === "dark" ? "haus-lockup-cream.png" : "haus-lockup-black.png";
    const data = `data:image/png;base64,${(await fs.readFile(`public/brand/${file}`)).toString("base64")}`;
    const svg = lockupSvg(theme, data);
    await fs.writeFile(`public/brand/palette-lockup-${theme}.svg`, svg);
    await png(svg, `public/brand/palette-lockup-${theme}.png`, 2400);
  }
  console.log("[icons] wrote public/icons, public/brand and extension/public/icon");
}
main();

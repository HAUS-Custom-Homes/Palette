import fs from "node:fs/promises";
import sharp from "sharp";

/**
 * App icons. The wordmark, reduced: a serif P and the brass full stop that
 * follows "Palette." everywhere else. Run once, commit the PNGs.
 * `pad` shrinks the mark for the maskable icon, whose edges the phone crops.
 */
const svg = (size: number, pad: number) => {
  const s = size * (1 - pad * 2);
  const off = size * pad;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect width="100%" height="100%" fill="#0a0a09"/>
       <text x="${off + s * 0.44}" y="${off + s * 0.56}" font-family="Georgia, 'Times New Roman', serif" font-weight="500"
             font-size="${s * 0.66}" fill="#f4f0e9" text-anchor="middle" dominant-baseline="middle">P</text>
       <circle cx="${off + s * 0.72}" cy="${off + s * 0.735}" r="${s * 0.052}" fill="#d4a868"/>
     </svg>`,
  );
};

async function main() {
  await fs.mkdir("public/icons", { recursive: true });
  await sharp(svg(192, 0)).png().toFile("public/icons/icon-192.png");
  await sharp(svg(512, 0)).png().toFile("public/icons/icon-512.png");
  await sharp(svg(512, 0.12)).png().toFile("public/icons/icon-512-maskable.png");
  await sharp(svg(180, 0)).png().toFile("public/icons/apple-touch-icon.png");
  await sharp(svg(64, 0)).png().toFile("public/icons/favicon-64.png");
  // The browser extension wears the same mark.
  await fs.mkdir("extension/public/icon", { recursive: true });
  for (const n of [16, 32, 48, 96, 128]) await sharp(svg(n, 0)).png().toFile(`extension/public/icon/${n}.png`);
  console.log("[icons] wrote public/icons/*.png and extension/public/icon/*.png");
}
main();

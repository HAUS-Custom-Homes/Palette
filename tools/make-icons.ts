import fs from "node:fs/promises";
import sharp from "sharp";

/** PWA icons. A serif Q on the library's dark ground. Run once, commit the PNGs. */
const svg = (size: number, pad: number) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <rect width="100%" height="100%" fill="#12110f"/>
     <text x="50%" y="54%" font-family="Georgia, 'Times New Roman', serif" font-size="${size * (0.62 - pad)}"
           fill="#c8a76a" text-anchor="middle" dominant-baseline="middle">Q</text>
   </svg>`,
);

async function main() {
  await fs.mkdir("public/icons", { recursive: true });
  await sharp(svg(192, 0)).png().toFile("public/icons/icon-192.png");
  await sharp(svg(512, 0)).png().toFile("public/icons/icon-512.png");
  await sharp(svg(512, 0.12)).png().toFile("public/icons/icon-512-maskable.png");
  await sharp(svg(180, 0)).png().toFile("public/icons/apple-touch-icon.png");
  console.log("[icons] wrote public/icons/*.png");
}
main();

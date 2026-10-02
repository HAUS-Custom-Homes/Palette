# Palette brand

Chosen by Trevor on 2026-10-02 after four rounds of exploration. The board with every round, the construction drawing and the reasoning is the private Artifact "Palette Logo Concepts" (claude.ai/artifact/XTqix3QjEfipxPbhFumLt3).

## The mark

Two paint strips hung on one rivet, opened to the A of the official HAUS lockup. The A has no crossbar; its legs lean 23.4 degrees, its feet are cut flat and its right leg is a little heavier. Cream strip on the left, brass on the right and in front. Each strip is three swatches, light to dark, cut level with the feet.

All geometry lives in `src/brand/mark.ts` and nowhere else. `npm run icons` rebuilds every file below from it.

| Size | Version |
|---|---|
| 48 px and up | Full: swatch cuts, seam and rivet |
| 32 px | Small: two flat strips and the seam |
| 16 px | Two flat strips |

Versions: full (on black), paper (ink and brass on limestone), brass and ink (one colour). The cuts are masks, so every version sits on any ground.

## The lockup

Lockup 2: the official HAUS lockup, a hairline, then the mark over PALETTE and EST 2026. It is built in the HAUS file's own pixel space, so the mark is exactly as tall as the HAUS letters, PALETTE sits on the CUSTOM HOMES line at its cap height and EST 2026 answers EST 2017. PALETTE is outlined Montserrat Medium with the roof A, so it never depends on an installed font.

The HAUS part is the official 2025 file (`public/brand/haus-lockup-*.png`), placed untouched. Never the old `haus_wordmark` files.

## Files

- `public/icons/`: app icons, maskable icon, Apple icon, favicons 16, 32 and 64
- `extension/public/icon/`: extension icons, plus `mark.svg` and `wordmark.svg` for the popup
- `public/brand/palette-mark-{full,paper,brass,ink}.svg`
- `public/brand/palette-lockup-{dark,paper}.{svg,png}`: self-contained, for decks, print and the client page

## In the app

- `app/ui/mark.tsx`: `<Mark>` and `<Wordmark>`. `open` plays the save (both strips swing out from the rivet into the A, brass last); rules in `app/look.css`. `themed` turns the cream strip to ink on a light page.
- Top bar: mark and PALETTE (mark alone on phones). Save toast and the "Saved to Palette" bar: the opening mark. Client lookbook page: the lockup.

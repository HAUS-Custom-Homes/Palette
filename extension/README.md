# Palette browser extension

One-click clipping on desktop, and the way existing Instagram and Pinterest saves get into the
library: from your own logged-in browser, with a review step, never from a server.

## What it does

- **Right-click any image**: Save image to Palette.
- **Toolbar button**: shows the images on the page, largest first, with the page's main image
  picked; one click saves it. Choose a haus first if you want.
- **On an Instagram saved list or a Pinterest board**: Scan, review, Import selected. The
  extension scrolls the page, collects one image per post, shows them, and uploads the ones you
  keep. Each upload carries the post URL, author and caption as provenance.

Every image is fetched by your browser with your own cookies and posted to Palette with your
own device token. Nothing here signs in anywhere on your behalf (REF-01 R-1).

## Setup, once per browser

1. In Palette, **Phone and settings**, make a token named for this computer.
2. Build or load the extension (below), open its **Settings**, enter the Palette host and the
   token, **Save and test**.

## Build and load

```bash
cd extension
npm install
npm run build            # Chrome, to .output/chrome-mv3
npm run build:firefox    # Firefox, to .output/firefox-mv2
```

Chrome: `chrome://extensions`, Developer mode, **Load unpacked**, pick `.output/chrome-mv3`.
Safari needs Xcode's converter (`xcrun safari-web-extension-converter .output/chrome-mv3`) and
is untested.

## Honest limits

- The collection scan relies on one stable fact: an `<img>` inside a link to `/p/`, `/reel/` or
  `/pin/`. If a platform changes that, the scan finds nothing and says so; nothing breaks.
- Instagram sometimes serves the grid at 640px rather than full size. What you get is what your
  browser was shown. For a specific image you care about, open the post and clip from there.
- If Instagram refuses the image fetch, the extension falls back to sending the URL and Palette
  tries once, politely. A screenshot always works.
- Built and unit-tested here; not yet driven against a live Instagram session from this machine.
  The first real scan is the test.

## Layout

```
lib/resolve.ts       pure logic: site detection, ids, srcset, picking, dedupe (tested)
lib/api.ts           fetch image with own cookies, POST to /api/ingest with provenance
lib/settings.ts      host + token in extension storage
entrypoints/content.ts     reads the page, scans collections
entrypoints/background.ts  context menus, uploads, notifications
entrypoints/popup/         the toolbar UI
entrypoints/options/       host and token
```

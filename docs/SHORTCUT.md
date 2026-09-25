# The iPhone Shortcut

Apple lets no web app into the iPhone share sheet, so Palette gets there as an Apple Shortcut.
As of 2026-09-23 the Shortcut is two blocks and needs no key: it opens Palette's own save page
with the shared link, and that page asks which haus and lookbook, saves the whole post at full
size, and shows it. The same interface an Android share gets.

The live guide is `/install` on the site (it puts the visitor's device first). This file is the
short form.

## The Shortcut

1. Open **Shortcuts**, tap **+**, rename it **Palette**.
2. Tap the **i** at the bottom, turn on **Show in Share Sheet**, Done. The block at the top reads
   *Receive Any input from Share Sheet*.
3. Tap **Any**, **Clear**, switch on only **URLs**, Done.
4. Search actions for **Open URLs** and add it.
5. In its URL box (delete any Shortcut Input bubble iOS put there first) type exactly
   `https://hauspalette.com/save?u=` and then tap **Shortcut Input** in the strip above the
   keyboard, so the bubble follows the `=`.
6. Done. Two blocks: *Receive URLs from Share Sheet*, *Open URLs*.

Sign in to hauspalette.com in Safari once; the share sheet opens Safari, so that is the sign-in
it uses. If Safari shows the sign-in page, sign in and it continues to the save page.

## What happens

Share → Palette → Safari opens `/save?u=<link>` → haus chips, lookbook, note → **Save** (a progress
bar shows it working) → `POST /share` (the same route the Android share target uses) → the post page.

## Photos and screenshots

The share card cannot pass a photo to a web page. Add Palette to the Home Screen (Safari, Share,
Add to Home Screen), open it, **+ New**, choose photos. Works with no signal (FR-8).

## The older Shortcut

The first version posted to `/api/ingest` with a per-phone key and showed a notification. It still
works (`Receive URLs` → `Get contents of https://hauspalette.com/api/ingest`, POST, Form, a `url`
row set to Shortcut Input, the key in an `authorization` header or a `key` row → `Show
notification: Contents of URL`). Three traps, kept here because they cost an evening: iOS drops a
Shortcut Input bubble into the address box by itself; "Receive Apps and 8 more" makes Instagram hand
over empty text; the keyboard's suggestion bar adds a space after `url`.

## Sharing the Shortcut

Once built, a Shortcut can be shared as an iCloud link. Set `PALETTE_SHORTCUT_URL` in Railway to
that link and `/install` shows a one-tap **Add the Palette Shortcut** button instead of the steps.

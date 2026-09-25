# Handoff
Last updated: 2026-09-24 on Trevor_Lenovo

2026-09-24 session (Trevor_Office): read-only status review, no code changes. TikTok focus still
next; waiting on Trevor for the failing links. Stale items in "Next steps" tidied.

2026-09-24 session (Trevor_Lenovo), deployed:
- **Phones.** Trevor on an iPhone: the header sat under the clock, did not stay put, and the page
  zoomed. Now (all in the "Phones (2026-09-24)" block at the end of `app/look.css`, plus `maximumScale: 1`
  and `userScalable: false` in `app/layout.tsx`): the header pads `env(safe-area-inset-top)`, is sticky, is
  one 52px row on phones (two on the library, for the search box), and its words ellipsize before
  anything spills off; `overscroll-behavior-y: none`; `touch-action: manipulation`; every field is 16px
  on phones (iOS zooms into anything smaller); tables scroll inside themselves; slides cap at 78svh.
  Measured with no overflow or clipping at 360, 375, 393, 412 and 430px widths on the main pages.
  **Not yet seen on a real iPhone**: the test browser is Chromium and cannot emulate the notch.
- **"Saving the rest of the post."** A share lands on the post after its first picture; `/share` now
  passes `expect=N` and the post page counts pictures as they arrive and refreshes itself
  (`app/item/[id]/arriving.tsx`). Trevor had read a post of 4 as a post of 1.
- **Settings is a gear** (not the owner's initials); the menu has icons and names whose account it is.
- **iPhone Shortcut is one tap.** Trevor shared his two-block Shortcut; checked it holds no key; its iCloud link is
  `PALETTE_SHORTCUT_URL` in Railway, so `/install` shows **Add the Palette Shortcut**. `/install` is now three
  steps per device plus one "Saving a post" section; help, other devices and the hand-built Shortcut are folded.
- **Save is one button that becomes a progress bar** on `/save`, and the post page continues on the same bar
  while the rest of the pictures arrive.
- **Share flow, same on both phones.** An Android share of a link now opens the save sheet too (`/share` sends a bare
  link to `/save`; the sheet posts back with `from=sheet`). The sheet offers **+ New lookbook** (created on save).
  Save becomes a prominent progress card; the post opens on **Saved to Palette / Done**; a **Done** button ends the
  post's details (saves the note, back to the library). The header button is **+ New**, not + Save.
- **Local `./data` database was rebuilt (2026-09-24, Trevor's call).** It had been corrupted by a second PGlite opened on
  every dev-server reload (fixed in `src/db/client.ts`, one handle on `globalThis`). `npm run setup` made a fresh one (8 facets,
  129 terms); at Trevor's word the broken copies and the old database's 45 leftover pictures were then deleted.
  `npm run verify` passes with 0 orphans.
- **Inviting people:** nothing to build. Anyone @hauscustomhomes.com signs in with Google and becomes an
  editor; roles are under People. interiors@ is to sign in itself (only works if it is a real account,
  not a group or alias).

## Current state

### NEXT SESSION: TikTok videos (Trevor, 2026-09-22: "NEXT TIME, I WANNA FOCUS ON TIKTOK VIDEOS")
Start here. What exists: `src/ingest/tiktok.ts` reads the public page's `__UNIVERSAL_DATA_FOR_REHYDRATION__`,
picks the best H.264 rendition and fetches it with the page's anonymous visitor cookie; one TikTok saved
live in 6s with its video on 2026-09-20 (`tests/tiktok.test.ts`). Not known yet: what Trevor sees as
wrong. First step: ask him for the links that failed, then read `/install/attempts` (owner-only record of
every save request: what arrived, what was answered) and the Railway logs (`[ingest]` lines) for those
saves before changing anything. Likely suspects: TikTok photo posts, links from the app's share sheet
(`vm.tiktok.com` / `vt.tiktok.com` short links that redirect; `cleanUrl` and `isTikTokUrl` may not
follow them), slideshow posts, and pages that now demand a verified cookie. A Playwright-free probe
like the one used for Instagram (fetch the page, count `video`/`playAddr` fields) is the fast way to see
what the public page still hands over.

### Done 2026-09-21 and 2026-09-22 (all live on hauspalette.com)
- **Smart tagging is on.** Trevor made an Anthropic key in a new `Palette` workspace (its own
  $15/month cap; the whole account is capped at $20), `ANTHROPIC_API_KEY` and
  `PALETTE_TAG_MODEL=claude-haiku-4-5` are in Railway. The first key (Default workspace) is disabled.
  All 49 pictures were re-tagged by Haiku ("Re-tag them" button, owner-only, appears while stand-in
  tags remain). The tagger uses `messages.create` + `lenient()` so a word outside the vocabulary
  becomes a proposal instead of failing the picture (6 had failed that way). Taxonomy is re-read every
  5 minutes by the long-lived worker.
- **Tags apply automatically.** Trevor chose to skip the FR-18 eval gate: "Apply tags automatically"
  (owner-only) wrote the `*` row in `facet_gates` via `trustModel()`; suggestions became applied
  (Needs me went from 52 to 8, the rest are low-confidence flags). `tests/gates.test.ts` covers it.
- **Tags are per picture.** The post page shows the tags of the slide on screen (`memberTags()`,
  `SlidePanel`, the carousel emits `palette:slide` and keeps `?slide=n` in the address); × removes for
  good, ↩ restores, "+ add a tag" is per picture. Forms carry the slide so the page comes back on it.
- **Anyone can add a word to the vocabulary from a picture** (`src/taxonomy/terms.ts`,
  `POST /api/taxonomy/terms`): typeahead over labels and synonyms plus the model's pending proposals;
  create in a chosen facet; a near miss (plural, typo, recorded synonym, one more word) is asked
  about first: Use it / Same thing (adds a synonym) / Different. "Foyer" is a seed synonym of Hall,
  so creating it asks; Trevor answers Different if he wants Foyer as its own term. Not yet created live.
- **Library header B**: one box in the top bar searches (Enter) and saves (paste a link); drop
  pictures anywhere; chips All / hauses / Mine / New this week / From video; a post count and one
  Filters panel (facet rows, colour, unsure tags). Card titles are the post's own caption again.
- **Preview-size posts fixed.** Posts saved from pasted links before whole-post fetching held one
  small cover. Now: "Get the full post" on the post's strip, and an owner-only "Fetch in full" notice
  on the library (`previewOnlyPosts`, `fetchFullPost`, `upgradePreviews`, `foldPreviewCovers`). The
  small copy folds into the full-size first picture (`supersede`; previews are square crops, so the
  first picture of a post is matched without a hash test), old links redirect. The embed parser falls
  back to the embed's own `<img class="EmbeddedMediaImage">` for old single-image posts that have no
  JSON. All four of Trevor's preview posts are now 1080 to 1440 px wide.
- **Instagram video.** Instagram no longer exposes most reels' files to anything but a signed-in
  browser (embed, page and anonymous GraphQL all empty/403 for Trevor's reel). Three reels have their
  files; six have covers only. Per R-1 the fix is the extension: on a reel it reads `video_versions`
  from the page's own data (`videoFileFromScripts`), fetches file + cover in the worker and POSTs both
  (`/api/ingest` accepts a `video` file with `video_width/height/seconds`). Popup: "Save the video".
  Built to `extension/.output/chrome-mv3`; **not yet loaded or tried in Trevor's Chrome.**
- **iPhone share gets an interface (2026-09-23).** Trevor: "there isn't an interface on iOS, it just
  uploads without any choices like on Android." The Shortcut is now two blocks and needs no key:
  Receive URLs, Open URLs `https://hauspalette.com/save?u=<Shortcut Input>`. `/save` (a guarded page)
  shows the link, haus chips, a lookbook, a note and one button, and POSTs to `/share` (which now
  takes `haus`, `board`, `note`; `GET /share?url=` redirects to the sheet). Verified locally at phone
  width. Trevor has to rebuild his Shortcut per `/install` (or add "Open URLs" and drop the API
  blocks). The older key-based Shortcut still works. Photos/screenshots: the home-screen app, + Save.
  The real parity fix remains a native iOS Share Extension ($99/yr Apple account, a Mac, about a week).
- `www.hauspalette.com` redirect rule in Cloudflare still needs Trevor to press Deploy.

### iPhone share sheet WORKS (2026-09-20, late)
Trevor's iPhone saved a whole Instagram post from the share card ("Saved to Palette · 3 items",
confirmed on the server). The working Shortcut is three blocks: **Receive URLs from Share Sheet**,
**Get contents of** `https://hauspalette.com/api/ingest` (POST, Form, a `url` row set to Shortcut
Input, his key in an `authorization` header; a `key` form row works too), **Show notification:
Contents of URL**. Three traps cost the evening and are now written into `/install` and
`docs/SHORTCUT.md`: iOS drops a Shortcut Input bubble into the address box (the phone then fetches
Instagram, hence "Rich Text to Dictionary"); "Receive Apps and 8 more" makes Instagram hand over
something whose text is empty; the keyboard's suggestion bar adds a space after `url`.
- `/api/ingest` answers a Shortcut (by user agent, or `?reply=text`) in plain text, so there is no
  Get Dictionary Value step. It finds the link in any text field, whatever it was named.
- **`/install/attempts`** (owner only) lists the last 40 requests to `/api/ingest`: time, who,
  device, field names and sizes, the answer. Table `ingest_log`, written on arrival and completed
  on answer. Use it before guessing. Railway's log viewer was useless for this.
- Not done: **photos and screenshots from the iPhone share card.** The `files` File row would not
  hold Shortcut Input on iOS 26 (snaps back to Choose). Next idea: a second Receive type (Images)
  with Request Body set to File, which the server would need to accept as a raw image body.

Rounds 3 and 4 are done on top of the multi-user Phase 0. The full REF-01 scope that can be
built without Trevor's credentials is now built. What remains is deployment, real data, and the
things that only a person can do (label the golden set, run the first real Instagram scan).

This is **Palette**, the reference library, at `~/projects/Palette` and
`HAUS-Custom-Homes/Palette`. The selections register is **The HausBuch** at
`~/projects/HausBuch` and `HAUS-Custom-Homes/HausBuch`; its own code still calls itself Palette.

### Built since the last handoff (round 4)
- **Embeddings and hybrid search** (FR-17 Layer A, FR-26, FR-31): CLIP ViT-B/32 in-process via
  transformers.js; vectors as `real[]` so PGlite and hosted Postgres share one schema; an
  in-process cosine index with a similarity floor; reciprocal rank fusion with the lexical
  ranking; "more like this" by vector. `npm run embed` backfills, the tag worker embeds after
  tagging, `npm run clip:check` proves the model runs. Weights cache in `data/models` (580MB).
- **Bulk actions, keyboard, compare** (FR-30, FR-32, FR-36): multi-select in the grid with add
  to board and set haus, `j k x space c esc /`, a compare tray at `/compare`.
- **Boards, complete** (FR-33, FR-34, FR-35): reorder, cover, **smart boards** from "Save
  search", and **client share links**: an unguessable expiring URL, a client-only page with no
  way into the library, images served only with the token, per-image likes that come back to the
  board. Verified with no session at all.
- **Eval gate** (FR-18): `npm run eval` scores precision and recall per facet on the golden set
  and records `facet_gates`. Until a facet passes, its AI tags are **suggested**: dashed, in
  review, never filtered on, one click to accept. `PALETTE_TRUST_UNGATED=1` is the escape hatch
  and the settings page says when it is on. With no eval run, everything is suggested. That is
  the PRD's rule and it is strict on purpose.
- **Role admin** at `/people`: owners change roles; the last owner cannot be demoted.
- **Instagram export backfill** (FR-2): `npm run backfill:instagram` parses Meta's archive into
  `/backfill`, a checklist that ticks itself when the extension clips a post.
- **Operational tools**: `export` (FR-42, whole library as files + manifest + CSV), `mirror`
  (FR-14, verified copy to a HAUS directory), `backup` (FR-15, database dump + manifest),
  `purge` (FR-43, the only hard delete, dry-run by default), `watch` (FR-10, a drop folder).
  Export, backup and purge were exercised here; mirror needs a target directory.
- **Offline capture** (FR-8): `public/sw.js` intercepts every capture POST (`/share`,
  `/api/ingest`); with no network it stores fields and photo bytes in IndexedDB, answers
  "saved on this phone", and replays to `/api/ingest` on Background Sync (Android) or next open
  (iOS). `/capture` is the phone-first page and the one page cached for offline. A pill shows
  what is waiting. `tests/sw.test.ts` runs the real worker against a fake IndexedDB and a
  switchable network (8 tests). **Not yet run on a real phone**: service workers need HTTPS, so
  that waits for the deployed host; the embedded browser pane refuses to register any worker.
- **Vocabulary admin** at `/taxonomy` (FR-16, FR-23): the model's proposed terms to add or
  reject, every term with usage, synonyms, retire and restore. The only way a closed facet grows.
- **Notes, rating, hero, remove** on every item (FR-37, FR-43 soft delete). **Colour search**
  (FR-25, `?near=hex`), **New this week**, and search now shows exact lexical hits first.
- **JSON API** for The HausBuch bridge (FR-38, FR-39 from this side): `/api/items`,
  `/api/items/:id`, plus `/api/health` (NFR-11, NFR-12). Token or session.
- **`next build` passes clean**: 14 routes, Edge-safe middleware, types valid.
- Round 3 before it: the **browser extension** (`extension/`) and boards.

Gate: `tsc` clean, `next build` clean, **40 tests** at the root (fake embedder) plus 8 in the extension, integrity
PASS. Every feature was driven in the browser or by curl before being called done.

### Deploy target changed: a container, not Vercel
Vercel caps request bodies at 4.5MB (phone photos are 3 to 12MB), cannot hold the CLIP model,
and its Hobby plan rejects a cron more frequent than daily. `docs/DEPLOY.md` now walks through
**Railway** (Dockerfile in the repo, Postgres in the same project, R2 for images, a `/data`
volume for the model). First boot migrates, verifies the triggers and seeds the vocabulary, so
no command is run against production. `PALETTE_WORKER=1` (set in the Dockerfile) runs the tag
queue in-process every 60s. `/api/healthz` is the unauthenticated liveness check. Verified
locally in production mode against an empty database; the Dockerfile itself has not been built
(no Docker on this machine), so the first Railway build is its test.

### Hosting decision (2026-09-18): Railway + R2 now, own hardware later
- **Why not the Proxmox box:** it is an AMD A4-9120C, 2 cores, 7.2GB RAM with 5.6GB used and already swapping, 35GB free on one disk. Palette does not fit beside Home Assistant, walkmyhaus and pipeline. `docs/SELF-HOST.md`, `docker-compose.yml`, `tools/provision-proxmox.sh` and `tools/tunnel-setup.sh` are ready (untested) for the day there is a bigger machine; moving is `npm run export` then `npm run import`.
- **Domain:** `hauspalette.com`, registered at GoDaddy, DNS moved to Cloudflare (same account as the R2 bucket). Apex CNAME to Railway (DNS only) and the `_railway-verify` TXT are in place.
- **LIVE at https://hauspalette.com since 2026-09-18.** Railway project `adorable-hope`, Postgres, R2 bucket `palette`, Google client `Palette web` (Internal, project `palette-509023`). Boot log showed `seeded 8 facets, 129 terms` and `tag worker started`; `/api/healthz` 200, Google provider advertises the right callback, `/api/ingest` answers 401 without a token. All 12 variables live in Railway (not in git); `AUTH_URL=https://hauspalette.com` is required behind Railway's proxy or sign-in redirects to `0.0.0.0:8080`.
- **Still to do on Railway:** the generated `palette-production-6917.up.railway.app` domain targets port 3200 and answers 502 (app listens on 8080): delete it or retarget it. No `/data` volume yet, so the CLIP model re-downloads on each deploy. `ANTHROPIC_API_KEY` not set, so tags are filename guesses. First sign-in (becomes owner) and the first R2 `npm run verify -- --full` are not done yet.
- Access note: agents cannot use `~/.ssh/pipeline_deploy_ed25519` (blocked by the permission classifier). Proxmox is reachable over Teleport via its web UI once Trevor signs in.

### ORDERED 2026-09-19: the new server
Trevor bought real hardware to bring Palette home and leave room for the rest of the HAUS apps
(he is weighing a build-your-own Buildertrend: Pipeline + HausBuch + Palette + walkmyhaus are
already the first modules). The rack is a NavePoint 15U wall mount, **16 inches deep, 200 lb**,
which is why this is a mini PC on a shelf mount and not a rack server.

| Item | Qty | Price |
|---|---|---|
| Minisforum MS-01, i5-12600H, 32GB RAM + 1TB SSD (amazon.com/dp/B0DXNFP13J) | 1 | $959.00 |
| Samsung 990 EVO Plus 2TB NVMe, no heatsink, for a mirrored data pool (amazon.com/dp/B0DHLCRF91) | 2 | $359.99 each |
| Rack mount for MS-01, 19 inch 2U (amazon.com/dp/B0DHRXX8XP) | 1 | $54.00 |
| CyberPower CP1500PFCRM2U UPS, 1000W, 2U, 10.5 inches deep (amazon.com/dp/B0B354X985) | 1 | $359.95 |
| CyberPower CPS1215RM basic PDU, 10 outlets, 1U (amazon.com/dp/B00077IG3O) | 1 | $59.99 |

Total **$2,152.92** before tax. Rack units used by the new gear: 2U + 2U + 1U = 5U of 15.
Still to have on hand: a USB stick for the Proxmox installer, and an SFP+ DAC or Cat6 patch
depending on the UniFi switch port. Plan the disks as: Proxmox on the included 1TB, the two 2TB
drives as a ZFS mirror for guests and the Palette library (about 1.8TB usable, roughly 350,000
images at 5MB). 32GB RAM covers Home Assistant (4GB), Palette (4GB) and the four small
containers with more than half to spare.

When it arrives: install Proxmox, join or migrate the existing containers (homeassistant 100,
fileserver 101, camrelay 102, walkmyhaus 103, palette-db 104, pipeline 105) one at a time, run
`tools/provision-proxmox.sh`, `npm run export` from Railway and `npm run import` at home, repoint
the `hauspalette.com` CNAME at a tunnel, keep R2 as the offsite copy, then delete the Railway
project.

### Bugs found and fixed this round
- The `haus` field arrives as a slug from every capture surface but ingest treated it as an id
  (round 3). `resolveOpenTermIds()` accepts either.
- A CLIP query with no lexical hits returned the whole library ranked. Added a similarity floor
  (0.21) below which the semantic half returns nothing.
- `config.mirrorDir` had been dropped in the round-2 rewrite; restored.
- `?color=` collided with the taxonomy facet whose key is `color` and was read as a facet
  filter. Colour search uses `?near=`. Any new URL parameter must not be a facet key.
- **The middleware was redirecting every cookie-less `/api/*` call to the sign-in page**, so a
  bearer-token client (the extension's own `whoAmI`, The HausBuch bridge) got HTML instead of
  JSON. Only `/api/ingest` had been excluded. The middleware now guards pages only; every API
  route authenticates itself and answers 401 or 403 in JSON. Verified route by route with curl.
- Rank fusion interleaved eleven vaguely similar images ahead of the one note that contained
  the word typed. Few exact hits now lead; fusion is kept for long, inexact queries.

### Built 2026-09-20: new look, multi-image posts, video stills
- **Look v2**, after Trevor said he loves Stasht's polish. True-black canvas, the photograph is the whole tile, caption and up to three tags overlaid on a bottom fade, frosted pills on the image (brass pill = the haus, stack badge = "3 of 8", play badge = video time), 20px corners, DM Sans with Fraunces for the wordmark and item titles, brass accent kept. The left facet rail is gone: one big search pill, then a row of pill filters (hauses first, then Mine, New this week, From video, Review, then a dropdown per facet, which becomes a bottom sheet on phones). Setup pages moved behind the avatar menu. Tokens are in `app/globals.css`; every component rule for the new look is in **`app/look.css`**, imported after it. Fonts load at run time from Google Fonts, never at build time.
- **A post is not an image.** `sources` gained `post_id`, `slide_index`, `slide_count`, `media_kind` (image, video_cover, video_frame) and `frame_time_s`. The server builds a per-slide external id (`ig:CODE#3`, `ig:CODE@14.2`), which fixes a real bug: the second slide saved from a post used to lose its provenance to the one-row-per-post unique key. `postFor()` returns the post and its saved siblings; the item page shows an "Also from this post" strip with a "+N, open the post to save the rest" marker. Two images from the same post are never folded into each other as near-duplicates.
- **Video: a still and a link, never the file.** Decision made with Trevor: he cares about images, a Reel is 20 to 100MB, and neither Stasht nor Sprink keeps the video either (Stasht says the save dies with the post). The item page says so in plain words. `?video=1` filters for stills from video.
- **Extension:** on an open multi-image post, "Save this slide" or "Save all N" (it presses the post's own back and next buttons, shows every slide for review, then saves the chosen ones to one haus). On a video, "Save cover" or "Save this frame": the tab is photographed and cropped to the player, because a page cannot read pixels from a cross-origin video; the player's overlays are hidden for that instant and restored. **Untested against live Instagram** (needs Trevor's signed-in browser): the selectors lean on aria-labels ("Next", "Go back") and on the indicator dots, and are the likeliest thing to need a tweak.
- **Pasting a link to a post now works** (`src/ingest/page-preview.ts`). Found by Trevor on the first real link he tried: an Instagram post URL was refused as "not an image". A link to a page now saves the page's Open Graph preview image with credit, clean URL (tracking parameters stripped) and the same post id the extension sends. One signed-out request identified as PaletteBot, no cookies: what a link preview does, and within R-1. Limits, which the item page states: only the post's cover, at preview size (Instagram gives 640px), never the other slides or a video frame. Verified locally against the real post; **not yet verified from Railway's IP**, which Instagram may treat differently from a home connection.
- **2026-09-20, after Trevor called the live site "clunky and does not work well"** (he was right; it had only ever been looked at with synthetic shapes on a laptop). Fixed from what his own browser showed: grid tiles painted **black** in Chrome (CSS multi-column with rounded clipping and overlays), so the grid is now a hand-rolled masonry in `app/ui/grid.tsx`; a pasted Instagram link now saves **every image of the post at full size** from the public embed view (`slidesFromEmbed`, signed out, falls back to the Open Graph cover); a larger copy of the same slide **supersedes** the small one and inherits its human tags, notes and board spots; the no-key tagger's guesses are kept off the tiles; the developer-speak banners are replaced by one plain owner-only line. **Lesson: check every change on hauspalette.com through Trevor's signed-in Chrome, with real photographs, before calling it done.**
- 62 root tests, 12 extension tests, tsc, verify and `next build` clean.

### Built 2026-09-19 (while the server ships)
- **Text in images is searchable (FR-24)** with no OCR dependency: the tagging call now also returns `visible_text`, stored in `items.ocr_text` (already in `search_tsv`) and shown on the item page. `PROMPT_VERSION` is `tag-v2`. Needs `ANTHROPIC_API_KEY`; the heuristic tagger reads nothing and never blanks existing text. Images tagged before this need `npm run tag -- --all` to gain it.
- **A smart board per haus (FR-46):** `createOpenTerm('project', ...)` calls `ensureHausBoard()`; boot backfills any haus without one. The boards list now shows a real count and cover for smart boards.
- **"Which haus?" after a phone share:** the item page asks once, skippably, when `?shared=1` and no haus is set. This settles the open question without adding a step to the share itself.
- **Pushing to `main` deploys to production** (Railway watches the branch). Gate every push on `tsc`, `npm test`, `npm run verify` and `npx next build`.

### Not built, and why
- **Pinterest API connector** (FR-1): needs a Pinterest developer app and standard-tier
  approval. The extension already imports Pinterest boards from the browser, which is the same
  images without the approval wait.
- **Email ingest** (FR-9): needs an inbound mail provider. The watch folder and the phone cover
  the same need.
- **Region tagging** (FR-45): Phase 5. (The useful half of FR-46, a self-filling board per haus, is built.)
- **The HausBuch bridge** (FR-38, FR-39): a round in that repo.
- **pgvector**: not needed below ~50k images; the step is in `docs/DEPLOY.md`.

## Next steps

**READ FIRST: `docs/REF-02-POSTS.md`.** Trevor rejected the per-slide model after using the live site and studying Stasht (which, seen first-hand in his account, keeps its own copies of images and video). He approved the redesign on a working mock ("way better, roll it out so I can test"). **Built and deployed 2026-09-20:** one card per post (`items.group_id`, lead and members), a swipeable carousel with counter, dots, thumbnails, full-screen and "Make cover" (`app/item/[id]/carousel.tsx`), **video stored and played from Palette's own copy** when Instagram's public embed page offers the file (muted autoplay, mute, full screen, scrubber; otherwise the cover is kept and the page says so), one-tap save with a confirmation that offers Open, Undo and hauses as chips (`app/ui/upload-zone.tsx`, `DELETE /api/items/[id]` removes the whole post, saving again revives it), emoji-only captions get "Post by @handle" titles. **Verified on hauspalette.com 2026-09-20, in Trevor's signed-in Chrome:** his Focus Room link is one card with a "7" mark; the post page shows 7 slides at 1088x1344 with clean title, credit and caption; a public Reel saved in 7 seconds with its 7.8MB MP4 in R2, which answers byte ranges (206). Actual playback on the live site was **not** seen by an agent, because Chrome will not load media in a hidden automation tab; it played locally with the same code. **Two production-only faults found and fixed by testing live:** `next.config.ts` made the image install TypeScript (127 packages) on every boot, now `next.config.mjs`; and saving a seven-image post restarted the container for memory, because the CLIP model wants about 700MB and Railway's trial has under 1GB, so the cloud image defaults to `PALETTE_EMBEDDINGS=off` (the home-server compose file turns it on) and sharp runs with no cache and one thread. **Search by what a picture looks like is therefore off on Railway until the new server.** A test Reel ("Video by @maroon5") was left in Trevor's library so he can see video play; he can remove it. **Share sheet, all three platforms (2026-09-20, Trevor: "I NEED THE SHARE SHEET FOR IPHONE, PC AND ANDROID"):** `/install` ("Get the app and share sheet" under the avatar, linked from the library) detects the device and walks the person through it. Android and Windows: install the web app and `share_target` puts Palette in the system share sheet; `/share` now brings the whole post and builds its redirects from the forwarded host (it used the container's internal address, which would have broken every Android share in production). iPhone: Apple allows no web app in its share sheet, so it is an Apple Shortcut posting to `/api/ingest` with a per-phone key made on that page; the API now finds a link inside text or inside the tiny text file Shortcuts sends, and answers with a `message` sentence for the notification. **Needs Trevor once:** build the Shortcut on his iPhone per the page, add an import question for the key, copy its iCloud link; set that as `PALETTE_SHORTCUT_URL` in Railway and the page shows a one-tap "Add the Palette Shortcut" for the team. **Not yet tried on a real iPhone, Android phone or the Windows share window.** If the Shortcut still feels clunky, the step up is a thin native iOS app with a Share Extension via TestFlight (needs an Apple developer account, $99 a year, and a Mac to build). **Also 2026-09-20:** "+ New lookbook..." in every picker; **boards are called lookbooks** in everything a person reads (Trevor's word; code and `/boards` URLs keep `board`); a ghosted platform mark in each card's bottom-right corner (Trevor picked option A from a mock; `platformOf()` in `app/ui/icons.tsx`); the app icon is a P with the brass full stop, not the Q left over from "Quarry"; and **TikTok** saves like Instagram (`src/ingest/tiktok.ts`): the public page's JSON, best H.264 rendition, file fetched with the anonymous visitor cookie the page sets for everyone. Verified on the live server: a TikTok saved in 6 seconds with its video stored. **Network, 2026-09-20 evening:** Trevor's iPhone twice failed to reach the site at all ("Safari can't connect to the server" during Google sign-in; "The network connection was lost" from the Shortcut) while the server answered every test and logged nothing. The apex was a DNS-only CNAME straight to Railway, which is **IPv4 only**; phone networks are IPv6 first and reach IPv4 hosts through a translation layer that is a classic source of exactly that iOS error. At Trevor's instruction the apex CNAME is now **proxied through Cloudflare** (SSL mode Full): the domain has IPv6 addresses and HTTP/3, and pages, sign-in, the Shortcut's request and a 12MB upload were all verified through it. Cloudflare's free plan caps a request body at 100MB. To undo: Cloudflare, DNS, the `hauspalette.com` CNAME, proxy off. **Confirmed from Trevor's phone** (Palette's own messages started arriving). Then a second fault: it worked once and failed again with "connection lost", the signature of iOS trying **HTTP/3** after the first reply advertised it and something on his network dropping QUIC. **HTTP/3 is now off** in Cloudflare (Speed, Settings, Protocol) and connection-lost stopped. Leave it off. The key may now arrive as a form field named `key` as well as in the Authorization header, because the Shortcut editor's Headers section proved too fiddly; keys are accepted however they were pasted (`tests/phone-key.test.ts`). `www.hauspalette.com` still 404s: a "Redirect from WWW to root" rule is filled in under Rules, Redirect Rules but not deployed (the permission classifier blocked the agent; Trevor can press Deploy). Smart tagging: `PALETTE_TAG_MODEL=claude-haiku-4-5` is staged in Railway, waiting for Trevor to add `ANTHROPIC_API_KEY` and deploy. The iPhone Shortcut steps on `/install` were rewritten in full (two form fields `url` and `files`; newer iOS has no Done button, shortcuts save themselves). **Still to do from REF-02:** the "+" suggestion chips on the post page, a board entry that points at one slide, "Keep this frame", the iPhone Shortcut, the extension sending video (needed for Reels whose file Instagram withholds, such as Trevor's UC Verde one), and the independent critic pass against the acceptance list on the live site.

0. **First real-world check of 2026-09-20's work:** Trevor reloads the unpacked extension (`extension/.output/chrome-mv3` after `npm run build` in `extension/`), opens a multi-image Instagram post and a Reel, and tries the four buttons. Then **email-in (FR-9)** via Cloudflare Email Routing to a Worker that POSTs attachments to `/api/ingest` with a device token. Not started. After that: region tagging (FR-45), then the HausBuch bridge. The server hardware is ordered (see "ORDERED" above); still open is whether to write a PRD for the Buildertrend replacement, starting with a shared sign-in and job list.
1. **Railway leftovers** (sign-in, upload, R2 and tagging are all proven live since 9/18 to 9/22):
   delete or retarget the 502 `up.railway.app` domain, try a `/data` volume, confirm the
   `MissingSecret` log line was only the pre-variables deployment, and Trevor deletes the
   downloaded Google `client_secret*.json` from Downloads if still there.
2. **Load the extension** and run the first real scan on your Instagram saved list.
3. Done: `ANTHROPIC_API_KEY` set, all pictures re-tagged, tags applied automatically (gate
   skipped 9/22). Labelling the golden set and `npm run eval` is now optional, only to measure
   the model.
4. First `npm run verify -- --full` against R2, and `npm run mirror` to the fileserver share.
5. The HausBuch's in-code rename, in that repo.

## Open decisions / questions for me

- Suggested-by-default is strict. If the team would rather filter on unmeasured tags while the
  golden set is being built, set `PALETTE_TRUST_UNGATED=1`; the settings page will say so.
- The share page shows "HAUS" as plain text. MK-01 brand assets belong to The HausBuch's
  design pipeline; when they are shareable, the client page should use them.
- Smart boards resolve the filter live and cannot be shared with a client (a share is a fixed
  set). Reasonable, but worth knowing.

## Gotchas

- `extension/` is its own package: run its checks inside it. The root typecheck and test runner
  exclude it. A root Bash `cd extension && ...` moves the session's working directory.
- `data/models` holds the CLIP weights (580MB, gitignored). First `npm run embed` or
  `npm run clip:check` downloads them; the sandbox this was built in could not reach
  `cdn.hf.co`, a normal machine can.
- Tests run with `PALETTE_EMBEDDINGS=fake`; the fake embedder has no similarity floor.
- `.env` holds `PALETTE_DEV_AUTH=1` and nothing secret. Gitignored regardless.
- `data/` is the PGlite database and local store; deleting it is a full reset. Signed-in
  browsers are redirected to sign-in afterwards because their user id no longer exists.
- `migrate()` runs on every boot and throws if any of the four triggers is missing. The DDL
  file ends with `ADD COLUMN IF NOT EXISTS` lines for columns added after the first release;
  keep adding there rather than editing the CREATE TABLE.
- `public/sw.js` is plain JavaScript on purpose (no bundler touches it) and is tested as-is.
  Bump `VERSION` in it when its caching changes. Photo bytes are stored as ArrayBuffers, not
  Blobs, because iOS Safari has lost Blobs in IndexedDB before.
- `npm run purge` is the only thing that deletes bytes. Dry run unless `--confirm`.
- Port 3200. The HausBuch owns 3100 and 3101.

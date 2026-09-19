# Handoff
Last updated: 2026-09-18 on Trevor_Lenovo (hardware list flagged for 2026-09-19)

## Current state

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

### FLAGGED FOR 2026-09-19: the server purchase
Trevor wants real hardware to bring Palette home and leave room for the rest of the HAUS apps
(he is weighing a build-your-own Buildertrend: Pipeline + HausBuch + Palette + walkmyhaus are
already the first modules). The current rack is a NavePoint 15U wall mount, **16 inches deep,
200 lb**, so full-depth rack servers are out; a deeper rack only unlocks loud, power-hungry
gear and was advised against. Prices below were read on 2026-09-18 and are moving fast (RAM and
SSD prices have spiked: 64GB of DDR5 SODIMM alone is $830 to $1,000).

| Item | Price | Where |
|---|---|---|
| Minisforum MS-01, i5-12600H, 32GB + 1TB (buy populated: the RAM+SSD bundle is $520, parts alone are about $745) | $959.00 | amazon.com/dp/B0DXNFP13J (sold by Minisforum US; same at store.minisforum.com) |
| Samsung 990 EVO Plus 2TB NVMe x2, mirrored data pool | $352.10 each | newegg.com/samsung-2tb-990-evo-plus-nvme-2-0/p/N82E16820147900 |
| Rack mount for MS-01, 19 inch 2U | $54.00 | amazon.com/dp/B0DHRXX8XP |
| CyberPower OR500LCDRM1U 1U UPS (check depth against 16 inches) | $219.95 | amazon.com/dp/B000XJJN60 |

Total about **$1,937** before tax. Cheaper: Crucial P310 2TB x2 at $299.99 (amazon.com/dp/B0DC8RVRBZ,
QLC) saves about $105; or skip the 2TB pair and mirror the included 1TB with a Crucial P310 1TB
at $174.70 (amazon.com/dp/B0DC8VPSHV) for about $1,408 total. Also needed: SFP+ DAC or Cat6
depending on the UniFi switch, a USB stick for the Proxmox installer. Later, if storage passes
about 1TB: UniFi UNAS Pro (not priced). Trevor places the order himself; agents never check out.

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

### Not built, and why
- **Pinterest API connector** (FR-1): needs a Pinterest developer app and standard-tier
  approval. The extension already imports Pinterest boards from the browser, which is the same
  images without the approval wait.
- **Email ingest** (FR-9): needs an inbound mail provider. The watch folder and the phone cover
  the same need.
- **OCR** (FR-24): tesseract.js is a large dependency for a feature nobody has asked for yet.
- **Region tagging, auto-board suggestions** (FR-45, FR-46): Phase 5.
- **The HausBuch bridge** (FR-38, FR-39): a round in that repo.
- **pgvector**: not needed below ~50k images; the step is in `docs/DEPLOY.md`.

## Next steps

0. **Flagged for 2026-09-19: decide on and order the server** (list and prices under "FLAGGED" above; re-check prices first). Also open: whether to write a PRD for the Buildertrend replacement, starting with a shared sign-in and job list; needs what HAUS pays Buildertrend and which modules the team really uses.
1. **Pick up here (stopped for the night 2026-09-18):** Trevor signs in at https://hauspalette.com
   first (becomes owner), drops one image to prove upload, R2 and tagging, and deletes the
   downloaded Google `client_secret*.json` from Downloads. Then: delete or retarget the 502
   `up.railway.app` domain, try a `/data` volume, confirm the `MissingSecret` log line was only
   the pre-variables deployment.
2. **Load the extension** and run the first real scan on your Instagram saved list.
3. **`ANTHROPIC_API_KEY`**, `npm run tag -- --all`, then **label the golden set** (the designer,
   200 images, `evals/README.md`) and `npm run eval`. Until then every tag is a suggestion,
   which is honest but means the facet rail is thin.
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

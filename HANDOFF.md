# Handoff
Last updated: 2026-09-18 on Trevor_Lenovo

## Current state

Round 3 is done: **the browser extension and boards**, on top of the multi-user Phase 0 from
round 2. Everything below was verified on this machine today.

Repos and folders are in their final names: this is **Palette**, the reference library, at
`~/projects/Palette` and `HAUS-Custom-Homes/Palette`. The selections register is **The HausBuch**
at `~/projects/HausBuch` and `HAUS-Custom-Homes/HausBuch`; its own code still calls itself Palette
until a round in that repo renames it.

### Round 3
- **Extension** (`extension/`, WXT, MV3, builds for Chrome and Firefox): right-click save, toolbar
  popup with the page's images and a haus picker, and the **collection scan**: on an Instagram
  saved list or a Pinterest board it scrolls, collects one image per post, shows a review grid,
  and imports what you keep. Images are fetched by the browser with the person's own cookies and
  posted with their device token and full provenance (post URL, author, caption). Pure logic is
  unit-tested (8 tests); typecheck clean; `npm run build` produces a valid manifest.
  **Not yet driven against a live Instagram session from this machine.** The first real scan is
  the test, and `extension/README.md` says so.
- **Boards** (FR-34): `/boards`, `/boards/[id]`, and a Boards panel on every item. Team-visible
  unless the owner makes one private. 3 tests.
- Server: `/api/ingest` accepts provenance fields; `GET /api/me` and `GET /api/taxonomy` answer
  to a device token so the extension can test itself and offer a haus.
- Gate: `tsc` clean (root excludes `extension/`), **20 tests** at the root plus 8 in the
  extension, integrity PASS.

Bug found this round, worth remembering: the `haus` field arrives as a **slug** from every
capture surface (dropdown, extension, Shortcut) but ingest treated it as a term id, so the
in-app "any haus" dropdown had been silently broken too. `resolveOpenTermIds()` now accepts
either, drops unknowns rather than failing the upload, and refuses closed facets. Covered by
`tests/haus.test.ts`.

Known edge, not fixed: ingest is bytes-first and not one transaction. If a step after the asset
insert fails (as the haus bug did), the image and item exist but the caller is told it failed;
the next identical upload reports "duplicate" and completes the missing pieces. Acceptable by
design (never lose bytes), but the error message could say "stored, tagging incomplete".

### Rounds 1 and 2, still true
See README.md. Postgres via PGlite locally and hosted in prod; Google sign-in restricted to the
Workspace; device tokens; per-person "Needs me" with quarantine; Haus facet human-only; R2 driver
written but never run against a real bucket.

## Next steps

1. **Trevor: deploy** (`docs/DEPLOY.md`). Neon, R2, Google OAuth client, Vercel. Until then the
   team cannot reach it. Sign in first so owner lands on you.
2. **Load the extension in your Chrome** (`extension/README.md`), make a token named for the
   computer, and run the first real scan on your Instagram saved list. Expect the scan to need
   a selector tweak; it relies on `<img>` inside a link to `/p/`, `/reel/` or `/pin/`.
3. `ANTHROPIC_API_KEY`, then `npm run tag -- --all`. Then the **FR-18 eval gate** before any
   board goes in front of a client.
4. First `npm run verify -- --full` against R2.
5. Role admin page (roles are changed in SQL today). Multi-select in the grid for bulk add to
   board. Embeddings (`VECTOR` markers in `src/search/query.ts`). Local mirror and cold copy
   (FR-14, FR-15).

## Open decisions / questions for me

- Should a phone share ask "which haus?" (a third tap) or stay at two taps and rely on
  "Needs me"? Built as two taps.
- Board ordering: items keep insertion order; there is no drag-to-reorder yet. Needed for a
  client-facing board, not for an internal one.
- The HausBuch's in-code rename: its README, CLAUDE.md and UI still say Palette. A round in
  that repo, with its own agent rules.

## Gotchas

- `extension/` has its own `package.json`, `node_modules` and test runner. The root `tsconfig`
  and `vitest.config` exclude it on purpose; run its checks from inside the folder.
- A root Bash `cd extension && ...` moves the session's working directory for later commands.
  Use absolute paths or `cd` back.
- `.env` holds `PALETTE_DEV_AUTH=1` and nothing secret. Gitignored regardless.
- `data/` is the PGlite database and local store; deleting it is a full reset. Sessions signed
  in before a reset are redirected to sign-in because their user id no longer exists.
- The system user `system@palette.local` owns anything imported without `--as`.
- `migrate()` runs on every boot and throws if any of the four triggers is missing.
- Stopping the dev task can leave the child `node` on port 3200: `netstat -ano | grep :3200`,
  then `taskkill //F //PID`.
- Port 3200. The HausBuch owns 3100 and 3101.

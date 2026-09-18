# Handoff
Last updated: 2026-09-18 on Trevor_Lenovo

## Current state

Round 2 is done: **multi-user Phase 0**. The concept became a team tool with sign-in, per-person
responsibility, phone capture, project tags, and a real Postgres schema. Everything below was
verified on this machine today, in the browser and by test.

- Postgres everywhere. **PGlite** (Postgres 18 in-process, no Docker) for dev and tests under
  `./data/pg`; hosted Postgres via `DATABASE_URL` in production. One schema, one set of PL/pgSQL
  triggers, `drizzle/`. SQLite is gone.
- **Google sign-in** restricted to `@hauscustomhomes.com` (Auth.js v5). First person in becomes
  owner, everyone after is editor. A dev-only sign-in box (`QUARRY_DEV_AUTH=1`) is refused in
  production.
- **Phones.** Per-device tokens (shown once, stored hashed, revocable) on `/settings`.
  `/api/ingest` takes a bearer token or a session. Android gets the PWA share target (`/share`);
  iPhone gets the Shortcut in `docs/SHORTCUT.md`. Both paths proven in the browser today.
- **Each person owns their images.** "Mine" filter, a "Needs me" page with two lists: images the
  tagger gave up on after three tries (quarantine) and images with low-confidence tags. Nobody
  sees anyone else's list.
- **Haus facet** (`project`): open, human-only, never shown to the model. Created from any item
  or at import (`--haus Hurst`). Filters combine: `?project=hurst&space=kitchen`.
- **R2 driver** written (`src/storage/r2.ts`), same interface as local. **Not yet run against a
  real bucket.**
- Tagging runs three ways: `after()` in the ingest route, Vercel Cron on `/api/cron/tag`
  (`vercel.json`), and `npm run tag`. Atomic claim with `FOR UPDATE SKIP LOCKED` so they never
  double-tag.
- `tsc` clean, **15/15 tests** on PGlite in memory, `npm run verify -- --full` PASS on 18 assets.

Bugs found and fixed this round, worth remembering:

1. `auth.config.ts` imported `config.ts`, which imports `node:path`. Middleware runs on the Edge
   runtime, so every route 500'd at boot. The edge half of auth now reads env directly and
   imports nothing from Node. Rule added to CLAUDE.md.
2. PGlite bundled by Next's server webpack passes its WASM path to `fs.readFile` as a `URL`
   object and every query fails with "path argument must be of type string". Fixed by adding
   `@electric-sql/pglite` and `postgres` to `serverExternalPackages`.
3. Stopping the dev task leaves the child `node` process holding port 3200 and the database
   files. Kill by port: `netstat -ano | grep :3200`, then `taskkill //F //PID`.

## Next steps

1. **Trevor: the four accounts** in `docs/DEPLOY.md` (Neon, R2, Google OAuth client, Vercel) and
   the env vars into Vercel. Nothing in the code is waiting on anything else. Sign in first so
   the owner role lands on the right person.
2. **First real test against R2**: `npm run verify -- --full` with the R2 env. The driver is
   untested until then.
3. Set `ANTHROPIC_API_KEY` and run `npm run tag -- --all` for real vision tagging. Then build
   the **FR-18 eval gate** before trusting any facet in front of a client.
4. Browser extension (WXT): one-click clip, and the Instagram and Pinterest saved-posts backfill
   in the user's own session. Everything it needs server-side (`/api/ingest`, tokens) exists.
5. Embeddings (FR-17 Layer A). Every insertion point is marked `VECTOR` in `src/search/query.ts`.
6. Boards UI. Schema exists, no pages yet.

## Open decisions / questions for me

- **Name**: built as Quarry. Still `D-7`.
- **Who tags the haus on a phone share?** Today a share lands with no haus and the person adds it
  later from the item page. The Shortcut could ask "which haus?" with a menu, at the cost of a
  third tap. Recommend leaving it at two taps and letting the "Needs me" habit cover it.
- **Viewer role** exists in the schema and is enforced on writes, but nobody is a viewer yet and
  there is no admin page to change roles. Change roles in SQL until there is.
- **Hobby vs Pro on Vercel**: Hobby limits cron to daily. `after()` covers uploads, so it is fine
  to start on Hobby; retries of quarantined items just wait for the daily run or `npm run tag`.

## Gotchas

- `.env` holds `QUARRY_DEV_AUTH=1` and nothing secret. It stays gitignored regardless.
- `data/` and `data-test/` are gitignored. `data/pg` is the PGlite database; deleting it is a
  full reset. The concept has no mirror and no cold copy yet (FR-14, FR-15 unbuilt).
- The system user `system@quarry.local` owns everything imported by tools without `--as`. Use
  `--as trevor@hauscustomhomes.com` (after that person has signed in once) so imports land on the
  right "Mine" and "Needs me".
- `migrate()` runs on every boot and throws if any of the **four** triggers is missing.
- Tests use `QUARRY_PGLITE=memory` and `./data-test`, set in `vitest.config.ts`.
- The tagger tags the 1600px derivative, not the original.
- Screenshots of the browser pane time out when the app window is behind another window; use
  `get_page_text`.
- Port 3200. Palette is on 3100 and 3101.

# Palette

The HAUS visual reference library: Next.js 15, Postgres (PGlite in dev, hosted in prod), Auth.js,
sharp, Anthropic SDK. README.md has the full picture. docs/REF-01-PRD.md is the spec and the
source of every requirement id. docs/DEPLOY.md and docs/SHORTCUT.md are for Trevor and the team.

## Session start
Read HANDOFF.md first: where work stands, what is next, and what is waiting on Trevor.

## Commands
    npm install
    npm run setup                      # migrate + seed the taxonomy (PGlite under ./data/pg)
    npm run dev                        # http://localhost:3200, dev sign-in with PALETTE_DEV_AUTH=1
    npm run demo                       # synthetic demo images
    npm run import -- <folder> [--as email] [--haus Name] [--recursive]
    npm run clip -- <image-url>
    npm run tag                        # process the tag queue; -- --all re-tags everything (FR-20)
    npm run embed                      # CLIP-embed anything without a vector (FR-17 Layer A)
    npm run clip:check                 # prove CLIP runs on this machine, warm the model cache
    npm run verify -- --full           # integrity scrub (FR-40); works against R2 too
    npm run eval                       # FR-18 gate on evals/golden; -- --dry to only score
    npm run export | mirror | backup | purge | watch | backfill:instagram   # see README
    npm run migrate                    # against DATABASE_URL, for a new production database
    npm run typecheck
    npm test

Work is done only when `tsc` is clean, `npm test` passes, and `npm run verify` passes.

## Layout
`src/db/` client (PGlite or postgres-js behind one query interface), schema, migrate ·
`drizzle/` DDL and the enforcement triggers · `src/storage/` ObjectStore, local and R2 drivers ·
`src/derive/` sharp, blurhash, perceptual hashes · `src/ingest/` pipeline, dedupe, tag queue ·
`src/ai/` Tagger, taxonomy-to-schema, the FR-19 writer · `src/taxonomy/` vocabulary seed ·
`src/search/` hybrid search, facets, `vectors.ts` in-process CLIP index · `src/auth.ts` + `src/auth.config.ts` ·
`src/lib/users.ts` people and device tokens · `src/boards/` boards · `app/` pages and routes ·
`tools/` CLIs · `tests/` the guarantees · `extension/` the WXT browser extension, its own package

## Rules
- **FR-19 is the rule the product depends on.** A tagging run may only touch rows where
  `item_terms.source = 'ai'`. Never modify or delete a human row, never re-add a rejected term.
  Enforced by triggers and by `src/ai/apply-tags.ts`. Keep `tests/guarantees.test.ts` green.
- **Originals are immutable.** Never re-encode, resize, strip or overwrite anything under
  `originals/`. Derivatives are disposable; originals are the record.
- `drizzle/triggers.sql` is applied by `src/db/migrate.ts`, which counts the four triggers and
  throws if any is missing. A database that cannot enforce FR-11 and FR-19 does not serve.
- **FR-18: an AI tag is applied only on a facet whose gate has passed for that model.** The owner may pass every facet at once from the library page ("Apply tags automatically", `trustModel()` writes the `*` row in `facet_gates`; Trevor chose this on 2026-09-22). Otherwise
  `item_terms.suggested = true`: shown dashed, counted in review, excluded from filters and
  facet counts. `applyTags()` decides; `tests/gates.test.ts` proves it. Do not bypass with SQL.
- **The model never sees an open facet.** `project` (Haus) is human-only. Closed facets grow only
  through `proposed_terms` and a human promotion. `createOpenTerm()` refuses closed facets.
- **`src/auth.config.ts` runs on the Edge runtime.** It imports nothing from Node and not even
  `src/config.ts`. Database work belongs in `src/auth.ts` callbacks only.
- Native and WASM packages stay in `serverExternalPackages` in `next.config.mjs` (plain JS on purpose: a .ts config makes the production image install TypeScript on every boot): `sharp`,
  `@electric-sql/pglite`, `postgres`, `@huggingface/transformers`, `onnxruntime-node`. Bundling
  PGlite breaks every query; bundling transformers.js breaks embedding.
- Embeddings are `real[]`, one schema for both databases. Do not introduce a pgvector column
  without the DEPLOY.md migration note; the in-process index in `src/search/vectors.ts` is the
  search path until then. Tests run with `PALETTE_EMBEDDINGS=fake`.
- Raw SQL uses `$1` placeholders through `db().query()` / `one()` / `transaction()`. Do not
  import a driver directly anywhere else.
- **Every capture surface in the web app must POST to `/api/ingest` or `/share`.** That is what
  the service worker intercepts for offline queueing (FR-8). A capture that posts anywhere else
  is silently lost with no signal. `tests/sw.test.ts` runs the real `public/sw.js`.
- **Production is one always-on container** (`Dockerfile`), not serverless: uploads exceed
  Vercel's 4.5MB cap and CLIP needs a disk. `boot()` migrates, checks the triggers, seeds an empty
  database and, with `PALETTE_WORKER=1`, runs the tag queue every 60s. Keep first boot
  command-free.
- **Middleware guards pages, never `/api`.** Every API route must authenticate itself (session,
  device token, cron secret or share token) and answer 401/403 in JSON. A new route that forgets
  is open to the world; a middleware rule that covers `/api` breaks every bearer-token client.
- URL parameters on the library page must never reuse a facet key (`color`, `space`, `style`...):
  `parse()` reads every facet key as a filter. Colour search is `?near=` for that reason.
- **A post is a post (REF-02).** People see one card per post. Underneath, each picture or video is still its own `items` row, tied together by `items.group_id`; the lead (group_id = its own id) carries title, haus, notes and boards; **tags belong to each picture** (`memberTags()`, the post page shows the slide's own tags, 2026-09-22), `is_cover` picks the picture that stands for it. Anything that lists items to a person must list leads and look inside the group (`MEMBER`, `toPosts()` in `src/search/query.ts`). Removing a post removes its members. Never fold two items from the same post into each other as near-duplicates. **Palette keeps its own copy of video** when it can get the file (`items.video_asset_id`, same immutable content-addressed storage), and says so plainly when it cannot.
- **The look lives in two files:** tokens in `app/globals.css`, every v2 component rule in `app/look.css` (imported after, so it wins by order). The photograph is the tile; text sits on it. Do not add a build-time font dependency: fonts load at run time so a build never needs the network.
- **People read "lookbook"; the code says board.** Trevor chose the word on 2026-09-20 so as not to borrow Pinterest's. Every string a person can read says lookbook. Tables, routes (`/boards`), functions and components keep `board`, so links and history stay intact. Pinterest's own boards are still called boards when talking about Pinterest.
- Each person owns their images. Quarantine and review lists are filtered by `created_by`.
  Never build a page that shows one person another person's "Needs me".
- Edit `.ts`, `.tsx` and `.sql` with the Edit/Write tools, never through shell heredocs or `sed`.
- No em dashes in user-visible copy. Client-facing copy spells house as "haus".
- Never scrape Instagram or Pinterest with anyone's credentials from a server. Capture is
  user-driven, in the user's own browser or phone (REF-01 R-1). Same rule as Buildertrend.
- `.env` holds credentials. Gitignored, never printed, pasted or committed. Trevor enters every
  production secret himself.
- Agents and tests work against `./data-test` and `PALETTE_PGLITE=memory`, never `./data`.
- `extension/` is its own package: run `npm install`, `npx tsc --noEmit`, `npm test` and `npm run build`
  inside it. The root typecheck and test runner exclude it. Never `cd extension` in a root command
  without coming back.
- The extension never signs in anywhere. It reads the page the person has open and fetches with
  their own cookies. Keep it that way (REF-01 R-1).
- Port 3200. The HausBuch owns 3100 and 3101.

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
    npm run verify -- --full           # integrity scrub (FR-40); works against R2 too
    npm run migrate                    # against DATABASE_URL, for a new production database
    npm run typecheck
    npm test

Work is done only when `tsc` is clean, `npm test` passes, and `npm run verify` passes.

## Layout
`src/db/` client (PGlite or postgres-js behind one query interface), schema, migrate ·
`drizzle/` DDL and the enforcement triggers · `src/storage/` ObjectStore, local and R2 drivers ·
`src/derive/` sharp, blurhash, perceptual hashes · `src/ingest/` pipeline, dedupe, tag queue ·
`src/ai/` Tagger, taxonomy-to-schema, the FR-19 writer · `src/taxonomy/` vocabulary seed ·
`src/search/` tsvector search, facets, per-user views · `src/auth.ts` + `src/auth.config.ts` ·
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
- **The model never sees an open facet.** `project` (Haus) is human-only. Closed facets grow only
  through `proposed_terms` and a human promotion. `createOpenTerm()` refuses closed facets.
- **`src/auth.config.ts` runs on the Edge runtime.** It imports nothing from Node and not even
  `src/config.ts`. Database work belongs in `src/auth.ts` callbacks only.
- Native and WASM packages stay in `serverExternalPackages` in `next.config.ts`: `sharp`,
  `@electric-sql/pglite`, `postgres`. Bundling PGlite breaks every query.
- Raw SQL uses `$1` placeholders through `db().query()` / `one()` / `transaction()`. Do not
  import a driver directly anywhere else.
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

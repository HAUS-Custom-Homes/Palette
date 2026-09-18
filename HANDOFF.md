# Handoff
Last updated: 2026-09-18 on Trevor_Lenovo

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
- **Vocabulary admin** at `/taxonomy` (FR-16, FR-23): the model's proposed terms to add or
  reject, every term with usage, synonyms, retire and restore. The only way a closed facet grows.
- **Notes, rating, hero, remove** on every item (FR-37, FR-43 soft delete). **Colour search**
  (FR-25, `?near=hex`), **New this week**, and search now shows exact lexical hits first.
- **JSON API** for The HausBuch bridge (FR-38, FR-39 from this side): `/api/items`,
  `/api/items/:id`, plus `/api/health` (NFR-11, NFR-12). Token or session.
- **`next build` passes clean**: 14 routes, Edge-safe middleware, types valid.
- Round 3 before it: the **browser extension** (`extension/`) and boards.

Gate: `tsc` clean, `next build` clean, **32 tests** at the root (fake embedder) plus 8 in the extension, integrity
PASS. Every feature was driven in the browser or by curl before being called done.

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

1. **Trevor: deploy** (`docs/DEPLOY.md`). On Vercel, `PALETTE_EMBEDDINGS=off` and run
   `npm run embed` from a machine with the model; the doc explains.
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
- `npm run purge` is the only thing that deletes bytes. Dry run unless `--confirm`.
- Port 3200. The HausBuch owns 3100 and 3101.

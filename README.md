# Palette

The HAUS visual reference library. **One item per image, HAUS owns the bytes, and every person
owns their own captures.**

The problem it replaces: design inspiration lives in Instagram saves, Pinterest boards, phone
screenshots and folders on a share. None of it is searchable together, none of it is described in
HAUS's own words, and none of it is safe, because a save is a pointer to someone else's server.

Palette captures the actual file, stores it under its own SHA-256 forever, describes it against a
controlled HAUS vocabulary, and makes it findable in a second, by the whole team, from a phone.

**Sibling system:** [The HausBuch](../HausBuch) (`SEL-*`) is the selections register. It records what was
*chosen*. Palette records what it was chosen *from*.

---

## Status: the REF-01 scope, less what needs credentials

| | |
|---|---|
| Stack | Next.js 15, TypeScript, Postgres (PGlite locally, hosted in production), Auth.js, sharp, Anthropic SDK |
| Runs on | This laptop with no Docker, no cloud, no API key. Deploys to Vercel + Neon + R2 (`docs/DEPLOY.md`) |
| Sign-in | Google, restricted to `@hauscustomhomes.com`. First person in is owner |
| Phones | iPhone via a two-tap Shortcut (`docs/SHORTCUT.md`), Android via the share sheet, both to `/api/ingest` |
| Desktop | Browser extension (`extension/`): right-click save, toolbar popup, and import of existing Instagram and Pinterest saves from your own session |
| Tests | 32 at the root on real Postgres plus 8 in the extension, each defending a named requirement. `next build` clean |

## Running it locally

```bash
npm install
cp .env.example .env               # PALETTE_DEV_AUTH=1 gives a local sign-in box
npm run setup                      # migrate + seed: 8 facets, 129 terms
npm run demo && npm run import -- ./demo-images --haus Hurst
npm run tag && npm run embed       # tag, then CLIP-embed (first run downloads ~350MB)
npm run dev                        # http://localhost:3200
```

Sign in with any email at the dev sign-in box. Real images:

```bash
npm run import -- "C:/Users/tbirb/Pictures/inspiration" --recursive --as trevor@hauscustomhomes.com
```

Real tagging: set `ANTHROPIC_API_KEY` in `.env`, then `npm run tag -- --all`. Human corrections
survive that, by design and by test.

## How the team uses it

- **Capture.** Share, then Palette. Two taps from any app on a phone; drop or paste on desktop.
  The image is stored by hash before anything else happens, and tagged within a minute.
- **Find.** One search box that understands both words and pictures: a lexical ranking over tags, synonyms and provenance is fused with a CLIP ranking of what the images look like, so "warm kitchen with a plaster hood" works even when no tag says so. Plus a facet rail: Haus, image type, space, element, material, style,
  color. Counts respond to the active filter. Any search is a URL you can send.
- **Curate.** Boards: a haus, a room, a meeting. Reorder, pick a cover, save a search as a smart board that stays current. Team-visible unless the owner makes one private.
- **Show a client.** A board becomes an unguessable, expiring, read-only link. The client sees that board and nothing else, taps what they like, and the likes come back to the board.
- **Trust the tags, measurably.** A model's tags on a facet are applied only after `npm run eval` records a pass on the designer's golden set. Until then they are suggestions: dashed, reviewable, never filtered on.
- **Own.** "Mine" shows what you saved. "Needs me" is your list and nobody else's: images the
  tagger gave up on, and tags it was unsure about. Nothing on it is anyone else's job.
- **Remember why.** A note, a rating and a hero flag on any image; notes are searchable. Search by colour from the picker, or see what the team added this week.
- **Grow.** The Vocabulary page is the ten-minutes-a-week job: the model's proposed words, add or reject, plus synonyms and retire for every term. Anyone can add a haus. Nobody can add a material or a style by typing one; those grow
  through the model's proposals and a human decision, which is what keeps one word per tile.

## The five things worth understanding

### 1. The hash is the identity, and originals are immutable

Every file is stored at `originals/<aa>/<bb>/<sha256>.<ext>` and never re-encoded or overwritten.
Identical bytes from three platforms are one asset with three provenance records. A trigger aborts
any write that changes an asset's hash, size or key.

### 2. Human corrections are permanent

`item_terms.source` is `ai`, `human` or `rule`, and `set_by` says who. A tagging run may only
touch its own `ai` rows. Two triggers stop it modifying or deleting a human row, and the writer
refuses to re-add a term a human rejected. Re-tagging the whole library under a better model is
therefore a safe, routine operation.

### 3. The model is never asked for free text, and never sees the Haus facet

A Zod schema is generated from the live vocabulary at call time, so the only tags the model can
return already exist. Facets marked `ai_tagged = false` (Haus) are excluded from the schema and
the prompt entirely; only a person knows which project an image is for. The vocabulary block is
byte-identical across calls and sits ahead of the prompt-cache breakpoint.

### 4. Capture never waits on the model

Ingest stores the bytes, writes the records, queues a job, and returns. `after()` tags it once
the response has gone; Vercel Cron and `npm run tag` catch anything left. Jobs are claimed with
`FOR UPDATE SKIP LOCKED`, so three workers never tag one image twice. After three failures a
job is quarantined and its owner is asked, not the whole team.

### 5. Embeddings without a vector database

CLIP ViT-B/32 runs in-process through transformers.js (no Python, no GPU, no API cost; the
weights download once into `data/models`). Vectors are stored as `real[]` so PGlite and hosted
Postgres share one schema, and searched from an in-process cosine index that is milliseconds at
50,000 images. When the library outgrows that, the upgrade is pgvector with an HNSW index on the
same column; `docs/DEPLOY.md` has the step. `PALETTE_EMBEDDINGS=off` turns it off, `fake` is what
tests use.

### 6. One Postgres, two doors

`DATABASE_URL` unset means PGlite: Postgres 18 compiled to WASM, in-process, persisted under
`data/pg`. Set, it means a hosted Postgres. Same DDL, same PL/pgSQL triggers, same queries. The
tests run against PGlite in memory. There is no "works in SQLite but not in prod" class of bug.

## Layout

```
src/db/        client (PGlite | postgres-js), schema, migrate
drizzle/       0000_init.sql, triggers.sql (the enforcement gates)
src/storage/   ObjectStore, local driver, R2 driver
src/derive/    sharp derivatives, blurhash, dHash + aHash
src/ingest/    ingest, dedupe, near-duplicate clustering, tag queue
src/ai/        Tagger, taxonomy-to-schema, the FR-19 writer, open-facet terms
src/search/    hybrid search (tsvector + CLIP, rank fusion), facets, per-user views, vectors index
src/auth*.ts   Auth.js: edge-safe config, DB-backed callbacks
src/lib/       users, device tokens, boot
app/           library, item, boards, attention, settings, ingest, share, cron, asset, tokens, me, taxonomy
src/boards/    boards
extension/     the WXT browser extension, its own package (see extension/README.md)
tools/         seed, import, clip, retag, verify, migrate, demo, icons
tests/         the guarantees
docs/          REF-01-PRD.md, DEPLOY.md, SHORTCUT.md
```

## API, for The HausBuch and anything else inside the wall

Session or device token (`Authorization: Bearer plt_...`).

```
GET  /api/items?q=&project=&space=&material=&near=hex&limit=    hybrid search, JSON
GET  /api/items/:id                                              one item with tags and provenance
GET  /api/taxonomy                                               the live vocabulary
GET  /api/health                                                 counts, queue, embeddings, spend, last integrity scrub
GET  /api/me                                                     who this token is
POST /api/ingest                                                 files or url, with provenance and haus
```

## Tools

```bash
npm run embed                 # CLIP-embed anything without a vector
npm run eval                  # score the tagger on evals/golden and record the gate (FR-18)
npm run export -- ./out       # the whole library as files, manifest.json and items.csv (FR-42)
npm run mirror                # verified copy of every original to PALETTE_MIRROR_DIR (FR-14)
npm run backup                # database dump + hash manifest to PALETTE_BACKUP_DIR (FR-15)
npm run purge -- --confirm    # hard-delete items soft-deleted over 90 days ago (FR-43)
npm run watch -- <folder>     # a drop folder that ingests what lands in it (FR-10)
npm run backfill:instagram -- <export> --as you@hauscustomhomes.com   # FR-2 worklist at /backfill
```

## Not built, and named rather than hidden

| Missing | State |
|---|---|
| **R2 against a real bucket** | Driver written, not yet exercised. First `npm run verify -- --full` on R2 is the test. |
| **Extension against live Instagram** | Built and unit-tested; not yet run on a real saved list from this machine. |
| **A labelled golden set** | `evals/golden/labels.csv` is empty. Until the designer fills it and `npm run eval` passes, every AI tag is a suggestion. |
| **Pinterest API, email ingest, OCR** (FR-1, FR-9, FR-24) | Need credentials or a large dependency; the extension, the watch folder and the phone cover the same needs. |
| **pgvector** | Not needed below ~50k images; the upgrade is a documented step. |

## Rules

See `CLAUDE.md`. The short version: never touch an original, never let the AI touch a human
row, never scrape a platform with someone's credentials, never commit `.env`.

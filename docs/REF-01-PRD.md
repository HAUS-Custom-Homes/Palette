# PALETTE — HAUS Visual Reference Library
## Product Requirements Document

| | |
|---|---|
| Doc code | `REF-01` |
| Status | Draft for approval |
| Date | 2026-09-17 |
| Author | Claude Opus 5, acting as Principal PM / Lead AI Solutions Architect |
| Owner | Trevor, HAUS Custom Homes |
| Sibling system | The HausBuch (`SEL-*`), the HAUS selections register |
| Product name | **Placeholder.** Swap the moniker and the `REF-` doc prefix once the name is chosen. |

---

## 0. How to read this document

Every requirement carries an ID. `FR-n` functional, `NFR-n` non-functional, `R-n` roadblock, `D-n` decision needed from Trevor. Sub-agents in the build loop are handed **requirement IDs, not prose**. If a behavior is not written here with an ID, it is not in scope, and the agent that wants it raises it to the orchestrator rather than inventing it.

Section 6 is the execution blueprint. It is written to be read by the orchestrator and by each sub-agent at the start of every round.

---

## 1. Executive summary and product vision

### 1.1 The problem, in one paragraph

HAUS makes design decisions from visual reference, and that reference is scattered across Instagram saves, Pinterest boards, screenshots on a phone, and folders on a share. None of it is searchable in one place, none of it is described in HAUS's own vocabulary, and none of it is safe: an Instagram save is a pointer to someone else's server, and a deleted post, a disabled account, or a changed CDN URL takes the reference with it. The library that should be appreciating as HAUS's most valuable design asset is instead quietly decaying.

### 1.2 The product, in one paragraph

Palette is a private, self-owned visual reference library. Every image is captured as an actual file into content-addressed permanent storage, described against a controlled HAUS taxonomy by an AI tagging pass with human override, and retrievable in under a second by image type, space, element, material, style, and color, or by natural language, or by visual similarity to another image. Sources feed in continuously through a browser clipper, a mobile share sheet, a Pinterest connector, and direct upload. The source can disappear; the library does not.

### 1.3 Vision

> HAUS never loses a reference again, and every reference gets better with age.

Three horizons:

1. **Permanence (v1).** The bytes are HAUS's. Nothing in the library depends on a third party staying online.
2. **Retrieval (v1).** Any image in the library is findable in seconds, by the words a designer actually uses.
3. **Leverage (v2+).** The library stops being an archive and becomes an input. Inspiration attaches to a The HausBuch selection slot, flows into the Interior Design Package, and shows up in client presentations. The HausBuch records what was *chosen*; Palette records what it was chosen *from*.

### 1.4 Why this pairs with The HausBuch

| | The HausBuch (`SEL-*`) | Palette (`REF-*`) |
|---|---|---|
| Question it answers | What did we decide? | What could we decide from? |
| Unit | One row per decision | One item per image |
| Scope | Per haus | Across all hauses, and pre-haus |
| Lifecycle | Closes at issue | Never closes, appreciates |
| Relationship | Consumes Palette | Feeds The HausBuch |

They share a stack, an agent-loop pattern, and eventually a foreign key (`FR-38`). They do not share a database in v1 (`D-5`).

### 1.5 Goals

- **G1.** Every ingested image exists as a HAUS-owned file, verified by hash, backed up in two places, restorable on demand.
- **G2.** Adding an image from any surface takes two interactions or fewer. If clipping is slower than tapping Instagram's own save button, the product fails.
- **G3.** An image is usefully described without a human typing anything.
- **G4.** Filtering by image type, space, element, material, style and color returns correct results across the whole library.
- **G5.** The taxonomy is controlled, versioned, and re-runnable. A better model in 2027 re-tags the whole library without destroying a single human correction.
- **G6.** The library survives HAUS changing tools, accounts, hosts, or vendors.

### 1.6 Non-goals (v1)

- Not a public website, not a portfolio, not a shared social product.
- Not a DAM for HAUS project photography, marketing assets, or contracts. Reference only.
- Not a The HausBuch replacement. No pricing, no quantities, no purchasing.
- No editing of images. Palette stores and describes, it does not retouch.
- No multi-tenant SaaS. Single organization, small team.
- No republication of third-party images to the public. See `R-6`.

---

## 2. Personas and core user journeys

### 2.1 Personas

**P1. Trevor, Builder / Principal.** The primary user and the library's owner. Saves constantly, often on a phone, often at night, often mid-scroll. Searches rarely but urgently, usually in front of a client or a trade. Tolerance for friction at capture time: zero. Tolerance for a bad search result: also zero.

**P2. The Interior Designer (StudioHaus).** The heaviest searcher. Thinks in rooms, materials and styles, not in filenames. Needs to assemble a set of eight images for a primary bath conversation in under five minutes. Owns the truth of the taxonomy vocabulary: if the term is wrong, the library is wrong.

**P3. The Selections Coordinator.** Lives in The HausBuch. Comes to Palette to answer "show me what the client liked for the backsplash" and to attach a reference to a selection slot. Wants the two systems to feel like one.

**P4. The Client (read-only, v3).** Sees a curated board, never the library. Judges HAUS by how the board looks. Never logs in to anything complicated.

**P5. The Archivist (a role, not a person).** The interest that nobody represents at the table unless we seat them: is the backup real, can this file be opened in ten years, did the integrity scrub actually run. Represented in the build loop by a dedicated QC agent (`§6.2`).

### 2.2 Core journeys

**J1. Capture from Instagram on a phone (P1, the highest-frequency journey).**
Trevor sees a kitchen on Instagram. He taps share, taps Palette in the share sheet, and returns to scrolling. Elapsed time under three seconds, no typing, no waiting. In the background Palette resolves the post, downloads the image at the largest resolution available, stores it, tags it, and it appears in the grid. If he is offline, the capture queues and fires when he reconnects.
Requirements: `FR-6`, `FR-7`, `FR-8`, `FR-20`, `NFR-3`.

**J2. Capture from the web on a desktop (P1, P2).**
A browser extension button on any page. One click captures the hovered or largest image plus the page URL, title, and any caption text. On Pinterest and Instagram, the extension understands the page and captures the pin or post properly, including the full-resolution asset and the author.
Requirements: `FR-4`, `FR-5`, `FR-20`.

**J3. Bulk backfill (P1, once, at launch).**
Trevor points Palette at a Pinterest account. Every board and every pin is imported with board names preserved as provisional collections. He uploads a folder of 4,000 screenshots from a phone backup and they are ingested, deduplicated, and tagged. For Instagram, he requests Meta's official data export and hands Palette the archive, which becomes a work queue (`R-1`).
Requirements: `FR-1`, `FR-2`, `FR-3`, `FR-21`, `FR-22`.

**J4. Find it right now (P2, in front of a client).**
"Show me warm white oak kitchens with a plaster hood, real photos not renders." The designer types that sentence, or clicks four facet chips, and gets a grid in under half a second. She pins six to the compare tray, drags two into a board, and presents.
Requirements: `FR-23` through `FR-33`, `NFR-1`.

**J5. Fix a wrong tag once, forever (P2).**
The model called a limewash wall "plaster". She corrects it. The correction is sticky, marked human-sourced, never overwritten by any future model run, and offered as a rule for similar images.
Requirements: `FR-16`, `FR-17`, `FR-19`.

**J6. Attach inspiration to a decision (P3, v4).**
In The HausBuch, on the primary bath floor tile slot, the coordinator clicks "add reference", searches Palette inline, and attaches two images. They print in the client selections book next to the chosen product.
Requirements: `FR-38`, `FR-39`.

**J7. Prove the library is safe (P5, quarterly).**
The integrity job reports: N items, N bytes, 0 hash mismatches, 0 missing objects, last restore drill passed on date D. A random item is restored from cold backup to a scratch location and opened. If this report cannot be produced, the permanence pillar is a claim rather than a fact.
Requirements: `FR-40`, `FR-41`, `NFR-8`, `NFR-9`.

---

## 3. Functional requirements

Phase tags: **`[P0]`** foundations, **`[P1]`** MVP, **`[P2]`**, **`[P3]`**, **`[P4]`**, **`[P5]`** later.

### 3.1 Ingestion pipeline

The ingestion decision that governs everything else: **each source gets the most durable lawful path available, and no path uses HAUS's own logged-in credentials from a server.** This mirrors the The HausBuch precedent on Buildertrend (never automate a vendor UI with a browser, it breaks terms and risks the account of record). The same discipline applies here and it shapes the Instagram answer specifically.

| Source | Path chosen | Why not the alternative |
|---|---|---|
| Pinterest | **Official API v5**, OAuth, `boards:read` + `pins:read` | Scrapers exist and work, but a sanctioned API with a documented rate limit is the durable choice |
| Instagram | **User-driven clipper + official data export backfill** | No official API exposes a personal account's saved posts to a third party. Server-side scraping with Trevor's credentials risks the account. See `R-1` |
| Web pages | **Browser extension clipper** | Nothing else sees a logged-in page the way the user's own browser does |
| Phone | **PWA share target (Android) + iOS Shortcut posting to the API** | iOS does not support web share targets, so the Shortcut is the real answer, not a nice-to-have |
| Local files | **Drag-drop, folder import, watched directory on the fileserver share** | Simplest, most durable, always available |
| Email | **Per-user ingest address** | Catches everything the other paths miss |

**`FR-1` `[P1]` Pinterest connector.** OAuth against Pinterest API v5. List boards and sections, page all pins, capture for each pin: image at the largest available size, pin URL, board name, section name, pin note, dominant link, created date. Board and section names are imported as provisional collections (`FR-34`). Incremental resync on a schedule, using pin id as the idempotency key. Trial-tier access is capped at 1,000 requests per day, so backfill must be resumable and rate-aware (`R-2`).

**`FR-2` `[P2]` Instagram export backfill.** Accept a Meta "Download Your Information" archive (JSON, includes `saved_posts` and `saved_collections`). Parse it into a work queue of post URLs with collection names preserved as provisional collections. Each queued post is resolved by the user's clipper or by a user-initiated, user-visible fetch, never by an unattended server job using the user's session.

**`FR-3` `[P1]` Direct upload.** Drag-drop and file picker, multi-file, up to 500 files per batch. Accept JPEG, PNG, WebP, HEIC, AVIF, GIF (first frame), TIFF, PDF (each page becomes an item). HEIC is transcoded for display but **the original file is always retained unmodified** (`FR-11`).

**`FR-4` `[P1]` Browser extension clipper.** Built with WXT (cross-browser: Chrome, Firefox, Safari from one codebase). Capabilities: clip the image under the cursor via right-click; clip the largest image on the page via toolbar button; clip an explicit selection of several images; capture page URL, `og:` metadata, page title, and nearby caption text as provenance. Site-aware adapters for Instagram, Pinterest, Houzz, ArchDaily, Dezeen, and builder or product sites, each resolving the true full-resolution asset rather than the thumbnail in the DOM.

**`FR-5` `[P1]` Clip must be non-blocking.** The extension returns "saved" as soon as the job is durably queued. Fetch, store, hash, derive and tag all happen server-side afterward. Adoption depends on this (`G2`).

**`FR-6` `[P2]` Mobile capture, Android.** Installable PWA registering a Web Share Target accepting images and URLs.

**`FR-7` `[P2]` Mobile capture, iOS.** A published iOS Shortcut that appears in the native share sheet and POSTs the shared URL or image to `/api/ingest` with a device token. Distributed as an iCloud Shortcut link plus setup instructions.

**`FR-8` `[P2]` Offline queue.** Mobile captures made without connectivity queue locally and flush on reconnect. No silent loss.

**`FR-9` `[P3]` Email ingest.** A unique address per user. Attachments and linked images in forwarded mail are ingested with the subject line as the initial note.

**`FR-10` `[P3]` Watched folder.** A directory on the HAUS fileserver share (`\\192.168.1.125\share`) polled on an interval. Files dropped there are ingested and moved to a `processed/` subdirectory. This is the zero-friction path for anyone who will not install anything.

### 3.2 Storage architecture and permanence

**`FR-11` `[P0]` Content-addressed immutable originals.** On ingest, compute SHA-256 of the exact bytes received. Store the original at key `originals/<sha256[0:2]>/<sha256[2:4]>/<sha256>` with its original extension recorded as metadata. **Originals are never re-encoded, resized, stripped, or overwritten.** The hash is the identity of the asset. Ingesting identical bytes twice produces one asset and two provenance records, never two copies.

**`FR-12` `[P0]` Derivatives are disposable and regenerable.** Thumbnails (256px), grid (640px), detail (1600px) and a BlurHash placeholder are generated with `sharp` into `derived/<sha256>/<variant>.webp`. Derivatives may be deleted at any time and rebuilt from the original. They are never the system of record.

**`FR-13` `[P0]` Primary object store: Cloudflare R2.** S3-compatible, no egress fees (the library is read-heavy and serves images to browsers, which is exactly the shape that makes egress-billed stores expensive), reachable from anywhere. Object versioning on. Access via signed URLs with short TTL, never a public bucket.

**`FR-14` `[P0]` Local mirror on the HAUS fileserver.** Nightly `rclone sync` of `originals/` to `/srv/share/palette/originals` on LXC 101. This is the "HAUS owns the bytes" guarantee in physical form. A read-only path, never written to by the app.

> **Rationale for R2 as primary rather than the fileserver as primary.** The fileserver is LAN-only today, and reaching it off-network is a known open item in the `haus-fileserver` handoff. A library Trevor cannot open from a job site is not the product described in `J4`. R2 primary plus local mirror gives availability from anywhere and physical ownership at the same time. If remote access to the LAN is solved first, revisit under `D-2`.

**`FR-15` `[P0]` Third copy, cold.** Weekly versioned backup of `originals/` plus a nightly `pg_dump` of the database to a second provider (Backblaze B2 or AWS S3 Glacier Instant Retrieval), encrypted at rest, with object lock or immutability enabled for 90 days. Three copies, two media classes, one offsite. Credentials live in `.env`, never in git (house rule).

**`FR-40` `[P1]` Integrity scrub.** A scheduled job walks a rolling subset of assets, re-reads bytes, recomputes SHA-256, and compares. Mismatches and missing objects are recorded in `integrity_checks` and alert immediately. Full library covered at least monthly.

**`FR-41` `[P1]` Restore drill.** A one-command script restores a random sample of N items from the cold copy into a scratch location and verifies they open and hash correctly. Result written to the integrity log. A backup that has never been restored is not a backup.

**`FR-42` `[P2]` Export everything.** One command produces a self-contained archive: every original in a sane folder tree, plus a `manifest.json` and a CSV of all metadata and tags. This is the anti-lock-in guarantee and it is tested in CI against a fixture library.

**`FR-43` `[P1]` Soft delete only.** Deleting an item marks `deleted_at` and hides it. Bytes are retained for 90 days minimum. Hard delete is a separate, explicitly confirmed, audited operation.

**`FR-44` `[P2]` Optional page snapshot.** For web clips, optionally store a single-file HTML snapshot of the source page (monolith) alongside the image, for provenance when the source dies.

### 3.3 AI tagging and taxonomy engine

This is the part that makes or breaks `G4`. The core architectural claim: **free-text AI tags drift and are useless for filtering. Tags must be constrained to a versioned controlled vocabulary, with an explicit overflow channel for terms the vocabulary is missing.**

**`FR-16` `[P1]` Controlled taxonomy, stored as data.** Facets and terms live in `taxonomy_facets` and `taxonomy_terms`, not in code. Terms carry a slug, a label, optional parent, synonyms, and a status (`active`, `proposed`, `retired`). Editable through an admin UI by the designer persona, who owns the vocabulary (`D-4`).

**Facet set for v1** (initial term lists; the designer agent owns final vocabulary):

| Facet | Key | Cardinality | Initial terms (abbreviated) |
|---|---|---|---|
| Image type | `image_type` | single | real photo, rendering, hand sketch, CAD or drawing, floor plan, elevation, detail drawing, product shot, material sample, moodboard or collage, diagram, screenshot |
| Space | `space` | multi | kitchen, pantry, primary bath, secondary bath, powder, mudroom, laundry, primary bedroom, bedroom, great room, dining, study, stair, hall, closet, garage, wine room, gym, exterior front, exterior rear, porch, pool, outdoor kitchen, landscape, motor court |
| Element | `element` | multi | cabinetry, countertop, backsplash, flooring, wall finish, ceiling, millwork, door, window, stair rail, plumbing fixture, lighting fixture, hardware, appliance, fireplace, tile, roof, siding, column, beam, shower, tub, vanity, island, range hood, built-in, paneling, wainscot |
| Material | `material` | multi | white oak, walnut, painted wood, quartzite, marble, quartz, soapstone, granite, porcelain tile, zellige, cement tile, terrazzo, brick, limestone, stucco, plaster, limewash, shiplap, board and batten, standing seam metal, cedar shake, glass, brass, nickel, matte black, bronze, stainless |
| Style | `style` | multi | modern farmhouse, transitional, contemporary, traditional, Mediterranean, coastal, mountain modern, midcentury modern, Tudor, Colonial, Craftsman, Shaker, English country, Belgian, Japandi, industrial, minimal |
| Color | `color` | multi | white, off-white, greige, warm wood, black, charcoal, navy, blue, green, terracotta, brass or gold, mixed |
| Attributes | `attribute` | multi | day, night, staged, watermarked, contains people, text overlay, low resolution, client-presentable |

**`FR-17` `[P1]` Two-layer AI pass.** Every item runs both:

- **Layer A, embedding.** A CLIP-family image embedding (SigLIP 2 or OpenCLIP, self-hosted, GPU or CPU batch) written to `embeddings` as a pgvector column. Powers visual similarity (`FR-31`) and semantic search (`FR-26`). Model name and dimension stored per row so two models can coexist during a migration.
- **Layer B, structured tagging.** A vision call to Claude returning **JSON validated against a Zod schema generated from the live taxonomy**, using structured outputs (`output_config.format`), never free text. The schema enumerates allowed slugs per facet. Response includes per-term confidence, a one-sentence caption, and an `unmatched_suggestions` array for concepts the taxonomy does not cover.

**Model and cost.** Default `claude-opus-5` for quality-sensitive work. For bulk tagging specifically, the orchestrator may select `claude-sonnet-5` or `claude-haiku-4-5` if and only if the eval gate (`FR-18`) shows the cheaper model meets threshold on the golden set; that is a measured decision, not an assumed one. Two cost levers apply and both are mandatory for backfill: the **Message Batches API (50% discount, asynchronous, correct shape for a 20,000-image backfill)** and **prompt caching** on the taxonomy block, which is large, identical across every request, and must therefore sit at the front of the prompt with the per-image content after the last cache breakpoint. Verify caching is live by asserting `usage.cache_read_input_tokens > 0` in the job log; if it is zero, a silent invalidator is present.

**`FR-18` `[P1]` Tagging eval gate, the acceptance test for the AI.** A golden set of 200 images hand-labeled by the designer persona across all facets. A runnable eval scores precision and recall per facet. **Auto-tagging may not be trusted in the UI until the gate passes:** precision at or above 0.90 on `image_type`, 0.85 on `space` and `element`, 0.80 on `material` and `style`. Below threshold on a facet, that facet's tags are written but rendered as "suggested" and routed to the review queue rather than being applied silently. The eval is re-run on every prompt change, every taxonomy change, and every model change, and its scores are recorded per run.

**`FR-19` `[P1]` Human overrides are permanent.** `item_terms.source` is one of `ai`, `human`, `rule`. A re-tagging run may add, remove, or adjust rows where `source = 'ai'`. It may **never** modify or delete a row where `source = 'human'`, and may not re-add a term a human removed (a tombstone row carries `rejected = true`). This is the single rule that makes `G5` possible.

**`FR-20` `[P1]` Re-taggable library.** Every tagging run records `model_version`, `prompt_version`, and `taxonomy_version` on the rows it writes. A single command re-tags the whole library or any filtered subset under a new model, with human work preserved by `FR-19`. This is what lets a 2027 model improve 2026's captures overnight.

**`FR-21` `[P1]` Exact deduplication.** SHA-256 collision on ingest means the asset already exists. Attach the new provenance record to the existing asset and return the existing item. No duplicate rows, no duplicate bytes.

**`FR-22` `[P2]` Near-duplicate clustering.** Perceptual hash (dHash and pHash, 64-bit) computed at ingest. Items within Hamming distance 10 are clustered; the highest-resolution member becomes canonical and the rest become variants, collapsed in the grid with a badge showing the count. The same pin saved from three places should read as one thing.

**`FR-23` `[P1]` Review queue.** Items with any facet below confidence threshold, or with `unmatched_suggestions`, surface in a review queue. Two-click accept or correct. `unmatched_suggestions` aggregate into a "proposed terms" list that the taxonomy owner promotes or rejects, which is how the vocabulary grows without drifting.

**`FR-24` `[P2]` OCR.** Extract text from images with visible text (product tags, spec sheets, screenshots of captions) into a searchable field.

**`FR-25` `[P2]` Color extraction.** Dominant color palette per image, stored as LAB values, enabling "find me images in this color range".

### 3.4 Search, filtering and UI

**`FR-26` `[P1]` Hybrid search, one bar.** A single input runs both a lexical query (Postgres full-text over caption, notes, OCR text, source caption, board names, and tag labels) and a vector query (the text embedding of the query against image embeddings), fused with reciprocal rank fusion. The user does not choose a mode.

**`FR-27` `[P1]` Facet rail.** Every facet from `FR-16` renders as a filter group with live result counts. AND across facets, OR within a facet. Filter state is in the URL, so a search is a shareable link.

**`FR-28` `[P1]` Masonry grid.** Virtualized infinite scroll, preserving aspect ratios, BlurHash placeholders while loading, responsive columns, and scroll position restored on back navigation.

**`FR-29` `[P1]` Quick look.** Space bar or click opens a detail overlay: large image, all tags with their source badge (AI or human), provenance block with the source link and capture date, notes field, boards it belongs to, and "more like this".

**`FR-30` `[P1]` Keyboard-first.** `/` focuses search, `j`/`k` move, space opens, `b` adds to board, `x` selects, `escape` closes. The designer persona works faster with hands on keys.

**`FR-31` `[P2]` More like this.** Vector nearest-neighbor on the item's embedding, excluding its own near-dup cluster.

**`FR-32` `[P2]` Compare tray.** Pin up to six images into a persistent tray and view them side by side at full width. This is what a designer physically does with printouts, and no consumer tool does it well.

**`FR-33` `[P2]` Saved searches as smart boards.** A saved filter state renders as a board that stays current as new items arrive.

**`FR-34` `[P1]` Boards.** Manual collections, an item may be in many, drag to reorder, cover image, description. Imported Pinterest board names land here as provisional boards.

**`FR-35` `[P3]` Client share links.** A board publishes to a read-only, unguessable, expiring URL, branded to MK-01, with optional per-image "like" feedback that writes back into Palette. Gated on `D-3` and `R-6`.

**`FR-36` `[P1]` Bulk operations.** Multi-select in the grid, then bulk add to board, bulk tag, bulk delete, bulk re-tag.

**`FR-37` `[P2]` Item notes and ratings.** Free-text note and a simple star or "hero" flag per item, both fully searchable.

**`FR-38` `[P4]` The HausBuch integration, outbound.** A Palette item can be attached to a The HausBuch selection slot. Stored as a link record with the slot id, resolved through a small API on the The HausBuch side rather than a shared database.

**`FR-39` `[P4]` The HausBuch integration, inbound.** From inside The HausBuch, an inline Palette search panel for attaching references without leaving the register.

**`FR-45` `[P5]` Region tagging.** Tag a rectangle within an image ("this cabinet pull"), so a single kitchen photo can carry element-level references.

**`FR-46` `[P5]` Auto-board suggestions.** Cluster embeddings to propose boards the user has not thought to make.

---

## 4. Non-functional requirements

**`NFR-1` Performance.** Grid first paint of 50 items at p95 under 300ms from warm cache. Search round trip at p95 under 500ms at 100,000 items. Facet counts computed in the same query, not as N+1.

**`NFR-2` Scale.** Design target 100,000 items and 2TB of originals. Expected year-one reality: 10,000 to 20,000 items. Nothing in the schema or the storage layout may assume the small number. Vector index is HNSW, which holds at this scale in Postgres.

**`NFR-3` Ingest latency.** Clip to "saved" acknowledgment under 1 second. Clip to visible in grid under 30 seconds at p95. Tagging is asynchronous and may take minutes; the item is usable before it is tagged.

**`NFR-4` Throughput.** Backfill sustains 1,000 items per hour end to end, constrained in practice by Pinterest's trial rate limit rather than by Palette.

**`NFR-5` Availability.** Best-effort, single region. This is an internal tool; an hour of downtime is an inconvenience, not an incident. Data durability is the hard requirement, not uptime.

**`NFR-6` Durability.** Three copies, two storage classes, one offsite (`FR-13` through `FR-15`). Target: zero unrecoverable item loss, ever. This is the product's reason to exist.

**`NFR-7` Security.** Session auth, roles `owner`, `editor`, `viewer`. All object access through short-TTL signed URLs; no public bucket, ever. Secrets in `.env`, gitignored, never printed or committed (house rule, carried from The HausBuch). TLS everywhere. Rate limiting on the ingest endpoint. Device tokens for mobile capture are scoped to ingest only and individually revocable.

**`NFR-8` Integrity.** Full-library hash verification at least monthly, alert on any mismatch (`FR-40`).

**`NFR-9` Recoverability.** Documented, tested restore procedure. Quarterly drill with a written result (`FR-41`). RPO 24 hours, RTO 24 hours.

**`NFR-10` Privacy and licensing posture.** The library is private reference material for internal design work. Third-party images are stored under a reference-and-research posture, not republished. Any client-facing surface (`FR-35`) shows attribution and the source link. See `R-6`.

**`NFR-11` Observability.** Structured logs for every ingest job with its dedupe key, a job dashboard showing queued, running, failed and quarantined counts, and per-run AI cost recorded in dollars.

**`NFR-12` Cost ceiling.** Monthly run cost (storage, egress, AI) is reported in the admin view. Backfill cost is estimated and approved before the job runs, never discovered afterward (`D-6`).

**`NFR-13` Portability.** No dependency that cannot be replaced in a week. Object store behind an `ObjectStore` interface, AI behind a `Tagger` interface, embeddings behind an `Embedder` interface. Swapping R2 for MinIO is a config change plus a sync.

**`NFR-14` Accessibility.** Keyboard navigable throughout, visible focus states, alt text populated from the AI caption, WCAG AA contrast.

---

## 5. Data schema and architecture

### 5.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js 15 App Router, TypeScript | Matches The HausBuch. Shared conventions, shared agent patterns, one thing for HAUS to maintain |
| DB | Postgres 17 | Relational model, full-text search, and pgvector in one engine. No separate search service to keep in sync |
| ORM | Drizzle | Matches The HausBuch. Typed schema, migrations as code |
| Vector | pgvector, HNSW index | Avoids a second datastore at this scale |
| Queue | pg-boss (Postgres-backed job queue) | One fewer moving part than Redis. Jobs are transactional with the data |
| Images | sharp | Derivatives, metadata, HEIC transcode |
| Object store | Cloudflare R2 via S3 SDK, behind `ObjectStore` | `FR-13`, `NFR-13` |
| AI, tagging | Anthropic SDK, `claude-opus-5` default, Batches API for bulk | `FR-17` |
| AI, embeddings | SigLIP 2 or OpenCLIP, self-hosted inference service | Local, free at volume, no per-image API cost, and re-runnable offline |
| Extension | WXT | One codebase to Chrome, Firefox and Safari |
| Hosting | App on Vercel or a Proxmox LXC; DB on the existing Postgres host (CT 104) | Matches existing HAUS practice |

### 5.2 Schema (Drizzle-shaped DDL)

```sql
-- ============ assets: the bytes. immutable, content-addressed ============
CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256          char(64) NOT NULL UNIQUE,
  storage_key     text NOT NULL,
  mime_type       text NOT NULL,
  byte_size       bigint NOT NULL,
  width           integer,
  height          integer,
  phash           bit(64),
  dhash           bit(64),
  blurhash        text,
  dominant_colors jsonb,
  exif            jsonb,
  mirrored_at     timestamptz,      -- FR-14 local mirror confirmation
  archived_at     timestamptz,      -- FR-15 cold copy confirmation
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ items: the thing a user sees. one asset may back several ============
CREATE TABLE items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL REFERENCES assets(id),
  title        text,
  note         text,
  caption_ai   text,
  ocr_text     text,
  rating       smallint,
  is_hero      boolean NOT NULL DEFAULT false,
  variant_of   uuid REFERENCES items(id),   -- FR-22 near-dup cluster
  captured_at  timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL REFERENCES users(id),
  deleted_at   timestamptz,                 -- FR-43 soft delete
  search_tsv   tsvector GENERATED ALWAYS AS (
                 setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                 setweight(to_tsvector('english', coalesce(note,'')), 'A') ||
                 setweight(to_tsvector('english', coalesce(caption_ai,'')), 'B') ||
                 setweight(to_tsvector('english', coalesce(ocr_text,'')), 'C')
               ) STORED
);

-- ============ provenance: where it came from. never trusted for retrieval ============
CREATE TYPE source_kind AS ENUM
  ('instagram','pinterest','web','upload','email','watch_folder','api');

CREATE TABLE sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind           source_kind NOT NULL,
  source_url     text,
  external_id    text,
  author_handle  text,
  author_url     text,
  caption_text   text,
  board_name     text,
  section_name   text,
  page_title     text,
  snapshot_key   text,             -- FR-44
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, external_id)
);

-- ============ taxonomy: data, not code ============
CREATE TABLE taxonomy_facets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,     -- image_type, space, element, material, style, color, attribute
  label      text NOT NULL,
  is_multi   boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TYPE term_status AS ENUM ('active','proposed','retired');

CREATE TABLE taxonomy_terms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facet_id   uuid NOT NULL REFERENCES taxonomy_facets(id),
  slug       text NOT NULL,
  label      text NOT NULL,
  parent_id  uuid REFERENCES taxonomy_terms(id),
  synonyms   text[] NOT NULL DEFAULT '{}',
  status     term_status NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (facet_id, slug)
);

-- ============ the join that FR-19 protects ============
CREATE TYPE tag_source AS ENUM ('ai','human','rule');

CREATE TABLE item_terms (
  item_id          uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id          uuid NOT NULL REFERENCES taxonomy_terms(id),
  confidence       numeric(4,3),
  source           tag_source NOT NULL,
  rejected         boolean NOT NULL DEFAULT false,  -- human tombstone; AI may never re-add
  model_version    text,
  prompt_version   text,
  taxonomy_version integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, term_id)
);

-- ============ embeddings: model-scoped so two can coexist ============
CREATE TABLE embeddings (
  item_id   uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model     text NOT NULL,
  dim       integer NOT NULL,
  vector    vector(1152) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, model)
);

-- ============ boards, saved searches ============
CREATE TABLE boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  cover_item_id uuid REFERENCES items(id),
  is_smart    boolean NOT NULL DEFAULT false,
  filter_json jsonb,                       -- FR-33 when is_smart
  share_token text UNIQUE,                 -- FR-35
  share_expires_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_items (
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id  uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (board_id, item_id)
);

-- ============ jobs, integrity, audit ============
CREATE TYPE job_state AS ENUM ('queued','running','done','failed','quarantined');

CREATE TABLE ingest_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  state       job_state NOT NULL DEFAULT 'queued',
  dedupe_key  text UNIQUE,                 -- idempotency, FR-21
  payload     jsonb NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  cost_usd    numeric(10,4),               -- NFR-12
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE integrity_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,               -- 'scrub' | 'restore_drill'
  checked     integer NOT NULL,
  mismatched  integer NOT NULL,
  missing     integer NOT NULL,
  detail      jsonb,
  ran_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (                -- The HausBuch precedent
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES users(id),
  entity     text NOT NULL,
  entity_id  uuid NOT NULL,
  action     text NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ indexes ============
CREATE INDEX items_search_idx    ON items USING gin (search_tsv);
CREATE INDEX items_created_idx   ON items USING brin (captured_at);
CREATE INDEX item_terms_term_idx ON item_terms (term_id) WHERE rejected = false;
CREATE INDEX embeddings_hnsw_idx ON embeddings USING hnsw (vector vector_cosine_ops);
CREATE INDEX assets_phash_idx    ON assets (phash);
```

### 5.3 Module boundaries (these are the sub-agent work packages)

```
src/
  storage/      ObjectStore interface, R2 impl, CAS keys, mirror + archive jobs   -> platform agent
  ingest/       job runner, source adapters (pinterest, instagram, web, upload)   -> ingest agent
  derive/       sharp pipeline, blurhash, phash/dhash, exif                       -> platform agent
  ai/           Tagger + Embedder interfaces, Claude tagger, taxonomy->Zod,
                batch runner, eval harness                                        -> ai agent
  taxonomy/     facet/term CRUD, versioning, proposed-term promotion              -> ai + interiors
  search/       lexical, vector, RRF fusion, facet counts                         -> platform agent
  db/           Drizzle schema, migrations, triggers, seed                        -> platform agent
app/            grid, search, quicklook, boards, review queue, admin              -> frontend agent
extension/      WXT clipper, site adapters                                        -> ingest agent
tools/          integrity scrub, restore drill, export, backfill CLIs             -> platform agent
```

Each module has one owning agent, a defined public interface, and its own tests. Agents may read across boundaries; they may write only inside their own.

### 5.4 API surface (v1)

```
POST   /api/ingest                 clip or upload; returns immediately (FR-5)
POST   /api/ingest/batch           multi-file upload
GET    /api/items                  filter + search + facet counts, cursor paginated
GET    /api/items/:id
PATCH  /api/items/:id              note, rating, title
POST   /api/items/:id/terms        human tag add/remove (FR-19)
GET    /api/items/:id/similar      FR-31
GET    /api/taxonomy               facets + terms
POST   /api/taxonomy/terms         promote proposed term
GET    /api/boards, POST, PATCH, DELETE
POST   /api/boards/:id/share       FR-35
GET    /api/review                 review queue (FR-23)
POST   /api/connectors/pinterest/sync
GET    /api/admin/health           job counts, integrity, cost (NFR-11, NFR-12)
```

---

## 6. Agentic loop execution blueprint

This section is the operating manual for the build. It follows the pattern already proven on The HausBuch (`SEL-02 §11`) and tightens it where this product differs: the AI tagging layer needs an evaluation gate that a code review cannot substitute for, and the permanence pillar needs an adversary whose only job is to disbelieve the backup.

### 6.1 Orchestrator

I act as orchestrator (`plt-pm`). I own sequencing, architecture decisions, cross-module integration, the definition of done, and the decision to accept or re-queue a round. I do not write feature code. When two agents disagree, I decide and record why.

### 6.2 Agent roster

Each agent gets a role file in `.claude/agents/`. Roles are written as **standing instructions plus a veto**, because an agent with no veto is decoration.

| Agent | Role | Owns | Veto |
|---|---|---|---|
| `plt-pm` | Orchestrator (me) | Sequencing, architecture, integration, acceptance | Final |
| `plt-platform` | Senior engineer | Schema, migrations, storage, CAS, derivatives, jobs, search engine, API | Anything that risks data integrity |
| `plt-ingest` | Senior engineer | Source adapters, extension, mobile capture, dedupe, backfill CLIs | Anything that violates a source's terms of service |
| `plt-ai` | ML engineer | Tagger, Embedder, taxonomy-to-schema generation, batch runner, eval harness, cost | Shipping a facet that has not passed `FR-18` |
| `plt-frontend` | Senior engineer | Grid, search UI, quicklook, boards, review queue, admin | Anything that breaks keyboard flow or `NFR-1` |
| `plt-interiors` | Interior designer | Taxonomy vocabulary, facet structure, what a designer actually calls things, golden-set labeling | Any term in the taxonomy. If the word is wrong, it does not ship |
| `plt-designer` | Graphic designer | MK-01 brand compliance on every surface, client share board, grid typography and rhythm | Any client-facing surface |
| `plt-qc-designer` | QC, searcher's eyes | Walks the product as P2 with a real question and a client waiting. Is it fast, is it right, is it beautiful | Round acceptance |
| `plt-qc-archivist` | QC, permanence's eyes | Disbelieves the storage claims. Kills the container, deletes the bucket in staging, demands a restore. Can HAUS open this file in 2036 | Round acceptance |
| `plt-verify` | Adversarial verifier | Attempts to refute every completion claim. Runs the code, reads the numbers, reproduces the failure modes the PRD says are impossible | Round acceptance |

**The productive tension, stated on purpose.** `plt-qc-designer` wants speed, density, and instant everything. `plt-qc-archivist` wants verification, redundancy, and immutability, all of which cost time and money. `plt-ingest` wants maximum coverage of sources; its own terms-of-service veto pulls against that. These conflicts are the point. A round that produced no disagreement probably had one agent asleep.

### 6.3 Round protocol

Work proceeds in **rounds**. A round is one coherent slice, usually one phase item or a small group, and never more than one week of agent work. Every round produces files on disk, not chat.

```
docs/rounds/ROUND-<n>-BRIEF.md      written by plt-pm before work starts
docs/rounds/ROUND-<n>-REPORT.md     written by each build agent as it finishes
docs/rounds/ROUND-<n>-VERIFY.md     written by plt-verify
docs/rounds/ROUND-<n>-QC.md         written by both QC agents
docs/rounds/ROUND-<n>-CLOSE.md      written by plt-pm; accepted or re-queued
CHANGELOG.md                        appended every round (The HausBuch practice)
HANDOFF.md                          updated every round (cross-machine rule)
```

**`ROUND-n-BRIEF.md` template, the handover contract:**

```markdown
# Round <n>: <title>
## Requirement IDs in scope
FR-x, FR-y, NFR-z          <- the only authority. Nothing outside this list ships.
## Out of scope, explicitly
<the adjacent things an agent will be tempted to do>
## Agent assignments
| Agent | Module | Deliverable | Interface it must not change |
## Interfaces frozen this round
<signatures other agents depend on>
## Definition of done
- [ ] tsc: 0 errors
- [ ] unit tests pass, new tests cover every FR in scope
- [ ] UI tests pass (where applicable)
- [ ] smoke scripts pass against the test database
- [ ] eval gate re-run and recorded (rounds touching ai/ or taxonomy/)
- [ ] no secret, key, or connection string in any diff
## Known risks entering the round
## Questions for Trevor (blocking vs non-blocking)
```

### 6.4 The loop

```
   plt-pm writes BRIEF
        |
        v
   build agents work in parallel, one module each
        |                          (no agent writes outside its module)
        v
   each writes REPORT with: what shipped, FR coverage, what it could not do
        |
        v
   plt-verify attempts refutation  ------> refuted? back to the agent, same round
        |  (runs the code; does not
        |   accept a claim it did not
        |   reproduce itself)
        v
   plt-qc-designer  and  plt-qc-archivist  review in parallel, from their own vantage
        |
        v
   plt-pm: accept, or re-queue with a named reason
        |
        v
   CHANGELOG + HANDOFF updated, round closed
```

**Rules that make the loop actually work**, most of them learned on The HausBuch:

1. **The verifier runs the code.** `plt-verify` never accepts a claim from a report. It executes, reads output, and checks numbers against the requirement. Its default posture is that the claim is wrong.
2. **A phase does not close until both QC agents and the verifier sign.** Any one of them can hold a phase open.
3. **Agents work against the test database only.** `.env.test`, a separate database, a separate bucket prefix. Never the live data. Carried directly from the The HausBuch rule.
4. **No agent edits a `.ts`, `.tsx` or `.sql` file through a shell heredoc or `sed`.** Editor tools only. The HausBuch lost time to a heredoc turning a regex `\b` into a literal backspace byte.
5. **Interfaces are frozen at the brief.** If `plt-platform` needs to change `ObjectStore` mid-round, it stops and raises it to `plt-pm`; it does not change it and tell people afterward.
6. **One requirement, one test.** Every FR in scope gets at least one test that fails if the requirement regresses. The test names the FR id.
7. **Cost is reported, not discovered.** Any round that calls a paid API reports actual dollars spent in its REPORT.
8. **Secrets never enter a diff, a log, or a report.**

### 6.5 Verification gates specific to this product

Ordinary test suites do not catch the two things most likely to go wrong here, so each gets a dedicated gate.

**Gate A, the tagging eval (`FR-18`), owned by `plt-ai`, labeled by `plt-interiors`.**
200 hand-labeled images. Precision and recall per facet, scored on every prompt, taxonomy, or model change. Thresholds in `FR-18`. A facet below threshold ships in "suggested" mode, not applied mode. Scores are recorded per run in `docs/evals/` so the trend is visible. `plt-verify` re-runs the eval itself rather than reading the number from a report.

**Gate B, the permanence drill (`FR-41`), owned by `plt-qc-archivist`.**
Before any phase containing storage work closes, in the staging environment: delete the primary bucket's copy of a random sample, run the restore procedure, verify hashes, open the files. Then delete the database and restore from `pg_dump`, and verify the item still resolves to the right bytes. Written up with the actual commands and the actual output. **If the restore has not been performed, the storage requirements are unmet regardless of what the code looks like.**

**Gate C, adoption (`G2`), owned by `plt-qc-designer`.**
Time the capture path with a stopwatch on a real phone against a real Instagram post. If it is slower than Instagram's own save button, the round does not close. This is `R-7` made testable.

### 6.6 Phasing

| Phase | Name | Contents | Exit criterion |
|---|---|---|---|
| **P0** | Foundations | Repo, CI, schema, migrations, `ObjectStore` + R2, CAS, derivatives, auth, upload, plain grid | 100 images uploaded, stored by hash, visible, mirrored, and restored from cold copy once |
| **P1** | MVP | Taxonomy engine, Claude tagger + eval gate, embeddings, hybrid search, facet rail, quicklook, boards, browser clipper, Pinterest connector, review queue, integrity scrub | 5,000 images in, Gate A passed on all facets, Gate B passed, Gate C passed, `J4` demonstrated live |
| **P2** | Reach | Mobile capture (iOS + Android), offline queue, Instagram export backfill, near-dup clustering, OCR, compare tray, more-like-this, export-everything | Trevor captures from his phone for two weeks without touching a desktop |
| **P3** | Polish and share | Saved searches, color extraction, client share links, email ingest, watched folder, brand pass | A client board sent and used in a real meeting |
| **P4** | The HausBuch bridge | `FR-38`, `FR-39`, references in the selections book | A reference attached to a real selection slot on a real haus |
| **P5** | Advanced | Region tagging, auto-board suggestions, re-tag under a newer model as a routine operation | Full library re-tagged with human work provably intact |

**P0 and P1 are the commitment.** P2 onward re-plans after P1 ships, because what P1 teaches will change it.

---

## 7. Roadblocks

**`R-1` Instagram has no lawful bulk path. (High. The biggest threat to Pillar 1.)**
Meta retired the Basic Display API in December 2024, and the current Instagram API covers business and creator accounts only. Saved posts and collections are private by design and are not exposed to any third-party application. So there is no API that will hand Palette a personal account's saves. Unofficial scrapers (instaloader, gallery-dl) do work, and they also breach Instagram's terms and put the account at risk of restriction. HAUS has already set the precedent on exactly this question with Buildertrend: no browser automation against a vendor's UI. Applying the same rule here, the plan is: **user-driven clipping in the user's own browser and phone as the primary path (`FR-4`, `FR-6`, `FR-7`), plus Meta's official "Download Your Information" export as the backfill seed (`FR-2`).** Consequence to accept openly: Instagram backfill is partly manual, and there is no one-click import of years of saves. Mitigation: make clipping so fast that going forward it is not a chore, and use the DYI export to produce a finite, checkable worklist rather than a vague sense of loss. Decision `D-1` confirms this posture.

**`R-2` Pinterest trial rate limits gate the backfill. (Medium, time only.)**
Trial access is capped at roughly 1,000 requests per day; standard access is far higher but requires approval. A large board set could take several days to backfill on trial. Mitigation: resumable, rate-aware backfill; apply for standard access at project start so approval runs in parallel with P0.

**`R-3` AI tag quality is unknown until measured. (Medium, and the usual place these projects quietly fail.)**
A tagging pass that is 70% right is worse than no tagging, because it teaches the user not to trust the filters. Mitigation is `FR-18` in full: a hand-labeled golden set, per-facet thresholds, suggested-mode for facets that miss, and a review queue. Not "the AI seemed good in a demo".

**`R-4` Taxonomy drift. (Medium, organizational.)**
If everyone can invent a term, within a year there are five words for the same tile. Mitigation: closed vocabulary, `unmatched_suggestions` as the only growth path, and one named owner (`D-4`).

**`R-5` Storage cost and the off-LAN problem. (Low to medium.)**
2TB of originals plus derivatives is real money but not alarming money at R2 rates with no egress charge. The related issue is that the local mirror lives on a LAN that is not reachable off-network, which is an open item in the `haus-fileserver` handoff. This PRD routes around it by making R2 primary, but the mirror is only as useful as HAUS's ability to reach it. Recommend solving remote access (Tailscale is the obvious fit, already on that project's shortlist) in parallel.

**`R-6` Copyright posture. (Low technically, worth stating.)**
Collecting third-party images into a private internal reference library is ordinary professional practice and is what every designer's Pinterest already is. The posture changes when images are shown to clients (`FR-35`). Rule for v1: every client-facing image carries attribution and a link to its source, and the share board is unguessable and expiring rather than public. If HAUS ever wants public publication, that is a different conversation with different rules.

**`R-7` Adoption. (The one that actually kills projects.)**
If saving to Palette is slower than tapping Instagram's bookmark icon, Trevor will tap the bookmark icon, and the library will stop growing the week after launch. Mitigations are structural, not aspirational: `FR-5` (acknowledge before processing), `FR-7` (native share sheet, not a web page), `FR-8` (offline queue), and Gate C (`§6.5`), which makes the stopwatch a release blocker.

**`R-8` Single-user bus factor.** Nearly all value accrues to one person's habit. Mitigation: `FR-42` export-everything, so the library is portable and legible even if Palette itself is retired.

---

## 8. Success metrics

| Metric | Today | Target |
|---|---|---|
| Places design inspiration lives | 4+, none searchable together | 1 |
| Images HAUS actually owns the file for | Near 0 | 100% of the library |
| Time to find "warm white oak kitchen, real photo" | Not answerable | Under 10 seconds |
| Time to capture an image on a phone | 1 tap, into a silo | 2 taps, into the library |
| Images lost to link rot or account changes, per year | Unknown and unmeasurable | 0, and provable |
| Images described in HAUS vocabulary | 0% | 100% tagged, 90%+ within threshold |
| Human tag corrections destroyed by a re-tag | n/a | 0, structurally impossible (`FR-19`) |
| Restore drills passed | 0 | 4 per year, written up |
| Library growth after month 3 | Flat or decaying | Still growing (the real adoption test) |

---

## 9. Decisions needed from Trevor

| ID | Decision | Recommendation |
|---|---|---|
| `D-1` | Confirm the Instagram posture in `R-1`: user-driven clipping plus official export, no credentialed server-side scraping | Confirm. It is the same rule HAUS already set for Buildertrend, and account risk is not worth the convenience |
| `D-2` | Storage primary: Cloudflare R2 with local mirror, or fileserver-primary with cloud backup | R2 primary. The library has to work from a job site |
| `D-3` | Are client-facing share boards in scope, and for which phase | Yes, P3. Not in the MVP |
| `D-4` | Who owns the taxonomy vocabulary | The interior designer. One named person, with the `plt-interiors` agent representing the role during the build |
| `D-5` | Same database as The HausBuch, or separate with an API between | Separate. Different lifecycles, different scaling shapes, and a clean boundary at `FR-38` |
| `D-6` | Budget ceiling for the initial AI tagging backfill, and approval to run it | Set a hard ceiling before P1's backfill; use the Batches API (50% off) and prompt caching, and report actual spend per run |
| `D-7` | The product name, from the list at the top | Palette |
| `D-8` | Apply for Pinterest standard API access now | Yes, at project start, so approval overlaps P0 |

---

## 10. On approval

On approval of this document I will, as `plt-pm`:

1. Create the repository under `HAUS-Custom-Homes`, with `CLAUDE.md`, `HANDOFF.md`, `CHANGELOG.md` and `docs/` following the The HausBuch conventions.
2. Write the eleven agent role files into `.claude/agents/`.
3. Write `ROUND-1-BRIEF.md` covering Phase 0, and start the loop.

No code is written before the name, `D-1`, and `D-2` are settled, because all three change the first commit.

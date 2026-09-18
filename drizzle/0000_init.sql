-- REF-01 section 5.2. Postgres form, the real one.
-- Applied by src/db/migrate.ts against PGlite in development and hosted
-- Postgres in production. Idempotent.

-- ============ enums ============
DO $$ BEGIN
  CREATE TYPE source_kind AS ENUM
    ('instagram','pinterest','web','upload','email','watch_folder','api','share');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE term_status AS ENUM ('active','proposed','retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tag_source AS ENUM ('ai','human','rule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_state AS ENUM ('queued','running','done','failed','quarantined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ people ============
CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  name         text,
  image        text,
  role         user_role NOT NULL DEFAULT 'editor',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

-- FR-7. One token per phone, revocable one at a time. Only the hash is kept.
CREATE TABLE IF NOT EXISTS device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE,
  label        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

-- ============ assets: the bytes. immutable, content-addressed (FR-11) ============
CREATE TABLE IF NOT EXISTS assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256          char(64) NOT NULL UNIQUE,
  storage_key     text NOT NULL,
  mime_type       text NOT NULL,
  byte_size       bigint NOT NULL,
  width           integer,
  height          integer,
  phash           char(16),
  dhash           char(16),
  blurhash        text,
  dominant_colors jsonb,
  exif            jsonb,
  mirrored_at     timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ items: the thing a user sees ============
CREATE TABLE IF NOT EXISTS items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL REFERENCES assets(id),
  title        text,
  note         text,
  caption_ai   text,
  ocr_text     text,
  -- Tag labels, synonyms and provenance text, rebuilt by reindexItem() so the
  -- generated column below can index them. Never edited by hand.
  search_extra text NOT NULL DEFAULT '',
  rating       smallint,
  is_hero      boolean NOT NULL DEFAULT false,
  variant_of   uuid REFERENCES items(id),
  captured_at  timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL REFERENCES users(id),
  deleted_at   timestamptz,
  search_tsv   tsvector GENERATED ALWAYS AS (
                 setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                 setweight(to_tsvector('english', coalesce(note,'')), 'A') ||
                 setweight(to_tsvector('english', coalesce(caption_ai,'')), 'B') ||
                 setweight(to_tsvector('english', coalesce(search_extra,'')), 'B') ||
                 setweight(to_tsvector('english', coalesce(ocr_text,'')), 'C')
               ) STORED
);
CREATE INDEX IF NOT EXISTS items_search_idx   ON items USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS items_captured_idx ON items (captured_at DESC);
CREATE INDEX IF NOT EXISTS items_variant_idx  ON items (variant_of);
CREATE INDEX IF NOT EXISTS items_owner_idx    ON items (created_by);

-- ============ provenance ============
CREATE TABLE IF NOT EXISTS sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind          source_kind NOT NULL,
  source_url    text,
  external_id   text,
  author_handle text,
  author_url    text,
  caption_text  text,
  board_name    text,
  section_name  text,
  page_title    text,
  snapshot_key  text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, external_id)
);
CREATE INDEX IF NOT EXISTS sources_item_idx ON sources (item_id);

-- ============ taxonomy: data, not code (FR-16) ============
CREATE TABLE IF NOT EXISTS taxonomy_facets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  label      text NOT NULL,
  is_multi   boolean NOT NULL DEFAULT true,
  -- is_open: any editor may add a term directly (projects, hauses).
  -- ai_tagged: the model is shown this facet and may answer it.
  -- A facet that is open is normally not AI-tagged, and vice versa.
  is_open    boolean NOT NULL DEFAULT false,
  ai_tagged  boolean NOT NULL DEFAULT true,
  guidance   text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facet_id   uuid NOT NULL REFERENCES taxonomy_facets(id),
  slug       text NOT NULL,
  label      text NOT NULL,
  parent_id  uuid REFERENCES taxonomy_terms(id),
  synonyms   text[] NOT NULL DEFAULT '{}',
  status     term_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (facet_id, slug)
);

-- ============ FR-18 the eval gate, per facet and model ============
-- A facet the current model has not passed the gate on is still tagged, but
-- its tags are "suggested": shown dashed, routed to review, and not used for
-- filtering. Passing is a measured fact recorded here by `npm run eval`.
CREATE TABLE IF NOT EXISTS facet_gates (
  facet_key  text NOT NULL,
  model      text NOT NULL,
  passed     boolean NOT NULL,
  precision_ numeric(4,3),
  recall     numeric(4,3),
  threshold  numeric(4,3),
  samples    integer NOT NULL DEFAULT 0,
  ran_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facet_key, model)
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model            text NOT NULL,
  prompt_version   text NOT NULL,
  taxonomy_version integer NOT NULL,
  samples          integer NOT NULL,
  scores           jsonb NOT NULL,
  cost_usd         numeric(10,4),
  ran_at           timestamptz NOT NULL DEFAULT now()
);

-- ============ the join FR-19 protects ============
CREATE TABLE IF NOT EXISTS item_terms (
  item_id          uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id          uuid NOT NULL REFERENCES taxonomy_terms(id),
  confidence       numeric(4,3),
  source           tag_source NOT NULL,
  rejected         boolean NOT NULL DEFAULT false,
  -- FR-18: written by a model that has not passed the gate for this facet.
  suggested        boolean NOT NULL DEFAULT false,
  set_by           uuid REFERENCES users(id),
  model_version    text,
  prompt_version   text,
  taxonomy_version integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, term_id)
);
CREATE INDEX IF NOT EXISTS item_terms_term_idx ON item_terms (term_id) WHERE rejected = false;

-- ============ FR-17 Layer A: embeddings, model-scoped so two can coexist ============
-- real[] rather than pgvector so PGlite and hosted Postgres share one schema.
-- Searched from an in-process index (src/search/vectors.ts). When the library
-- outgrows that, add pgvector and an HNSW index on this column (docs/DEPLOY.md).
CREATE TABLE IF NOT EXISTS embeddings (
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model      text NOT NULL,
  dim        integer NOT NULL,
  vector     real[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, model)
);

-- ============ FR-23 proposals ============
CREATE TABLE IF NOT EXISTS proposed_terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facet_key   text NOT NULL,
  raw_label   text NOT NULL,
  item_id     uuid REFERENCES items(id) ON DELETE CASCADE,
  occurrences integer NOT NULL DEFAULT 1,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','promoted','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facet_key, raw_label)
);

-- ============ boards ============
CREATE TABLE IF NOT EXISTS boards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  owner_id         uuid REFERENCES users(id),
  is_private       boolean NOT NULL DEFAULT false,
  cover_item_id    uuid REFERENCES items(id),
  is_smart         boolean NOT NULL DEFAULT false,
  filter_json      jsonb,
  share_token      text UNIQUE,
  share_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_items (
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id  uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (board_id, item_id)
);

-- ============ FR-35 client feedback on a shared board ============
-- A client taps "like" on a read-only board. No account, no session: the
-- share token is the credential, and it expires.
CREATE TABLE IF NOT EXISTS board_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  viewer     text NOT NULL DEFAULT '',
  sentiment  text NOT NULL DEFAULT 'like' CHECK (sentiment IN ('like','no')),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, item_id, viewer)
);

-- ============ jobs, integrity, audit ============
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  state       job_state NOT NULL DEFAULT 'queued',
  dedupe_key  text UNIQUE,
  payload     jsonb NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  cost_usd    numeric(10,4),
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_state_idx ON ingest_jobs (kind, state, created_at);

CREATE TABLE IF NOT EXISTS integrity_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  checked     integer NOT NULL,
  mismatched  integer NOT NULL,
  missing     integer NOT NULL,
  detail      jsonb,
  ran_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   text,
  entity     text NOT NULL,
  entity_id  uuid NOT NULL,
  action     text NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events (entity, entity_id, created_at DESC);

-- ============ FR-2 Instagram export backfill worklist ============
-- Parsed from Meta's "Download your information" archive. Each row is a
-- post the person once saved; it is done the moment an item with the same
-- external id exists, which the extension produces when they clip it.
CREATE TABLE IF NOT EXISTS backfill (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        source_kind NOT NULL,
  external_id text NOT NULL,
  url         text NOT NULL,
  collection  text,
  saved_at    timestamptz,
  skipped     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, external_id)
);

-- Columns added after the first release. ADD COLUMN IF NOT EXISTS keeps
-- this file idempotent against a database created before they existed.
ALTER TABLE item_terms ADD COLUMN IF NOT EXISTS suggested boolean NOT NULL DEFAULT false;

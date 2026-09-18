import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

/**
 * REF-01 section 5.2. Typed mirror of drizzle/0000_init.sql for Drizzle
 * selects. The SQL file is the source of truth for DDL; this file must match
 * it. Generated columns and triggers live only in SQL.
 */

export const sourceKind = pgEnum("source_kind", [
  "instagram", "pinterest", "web", "upload", "email", "watch_folder", "api", "share",
]);
export const termStatus = pgEnum("term_status", ["active", "proposed", "retired"]);
export const tagSource = pgEnum("tag_source", ["ai", "human", "rule"]);
export const jobState = pgEnum("job_state", ["queued", "running", "done", "failed", "quarantined"]);
export const userRole = pgEnum("user_role", ["owner", "editor", "viewer"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: userRole("role").notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const deviceTokens = pgTable("device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sha256: char("sha256", { length: 64 }).notNull().unique(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  phash: char("phash", { length: 16 }),
  dhash: char("dhash", { length: 16 }),
  blurhash: text("blurhash"),
  dominantColors: jsonb("dominant_colors"),
  exif: jsonb("exif"),
  mirroredAt: timestamp("mirrored_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull().references(() => assets.id),
    title: text("title"),
    note: text("note"),
    captionAi: text("caption_ai"),
    ocrText: text("ocr_text"),
    searchExtra: text("search_extra").notNull().default(""),
    rating: smallint("rating"),
    isHero: boolean("is_hero").notNull().default(false),
    variantOf: uuid("variant_of"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("items_captured_idx").on(t.capturedAt), index("items_owner_idx").on(t.createdBy)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    sourceUrl: text("source_url"),
    externalId: text("external_id"),
    authorHandle: text("author_handle"),
    authorUrl: text("author_url"),
    captionText: text("caption_text"),
    boardName: text("board_name"),
    sectionName: text("section_name"),
    pageTitle: text("page_title"),
    snapshotKey: text("snapshot_key"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sources_external_idx").on(t.kind, t.externalId)],
);

export const taxonomyFacets = pgTable("taxonomy_facets", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  isMulti: boolean("is_multi").notNull().default(true),
  isOpen: boolean("is_open").notNull().default(false),
  aiTagged: boolean("ai_tagged").notNull().default(true),
  guidance: text("guidance").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const taxonomyTerms = pgTable(
  "taxonomy_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facetId: uuid("facet_id").notNull().references(() => taxonomyFacets.id),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    parentId: uuid("parent_id"),
    synonyms: text("synonyms").array().notNull().default([]),
    status: termStatus("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("terms_facet_slug_idx").on(t.facetId, t.slug)],
);

export const itemTerms = pgTable(
  "item_terms",
  {
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    termId: uuid("term_id").notNull().references(() => taxonomyTerms.id),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    source: tagSource("source").notNull(),
    rejected: boolean("rejected").notNull().default(false),
    setBy: uuid("set_by").references(() => users.id),
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version"),
    taxonomyVersion: integer("taxonomy_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.termId] })],
);

export const proposedTerms = pgTable("proposed_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  facetKey: text("facet_key").notNull(),
  rawLabel: text("raw_label").notNull(),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
  occurrences: integer("occurrences").notNull().default(1),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id),
  isPrivate: boolean("is_private").notNull().default(false),
  coverItemId: uuid("cover_item_id"),
  isSmart: boolean("is_smart").notNull().default(false),
  filterJson: jsonb("filter_json"),
  shareToken: text("share_token").unique(),
  shareExpiresAt: timestamp("share_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boardItems = pgTable(
  "board_items",
  {
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.itemId] })],
);

export const ingestJobs = pgTable("ingest_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  state: jobState("state").notNull().default("queued"),
  dedupeKey: text("dedupe_key").unique(),
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const integrityChecks = pgTable("integrity_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  checked: integer("checked").notNull(),
  mismatched: integer("mismatched").notNull(),
  missing: integer("missing").notNull(),
  detail: jsonb("detail"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id"),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

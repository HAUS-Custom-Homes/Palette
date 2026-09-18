import { config } from "@/config";
import { db } from "@/db/client";
import { hammingDistance } from "@/derive/pipeline";
import { fuse, searchByText, similarByVector } from "./vectors";

/**
 * REF-01 FR-26, FR-27, FR-31.
 *
 * Hybrid search: the lexical half (tsvector over text, tags, synonyms and
 * provenance) and the semantic half (CLIP, src/search/vectors.ts) each
 * produce a ranking, and reciprocal rank fusion merges them. Facet filters,
 * "Mine" and "Review" apply to the merged list, so a picture that only the
 * vector half found still has to satisfy the facets. Facet counts are
 * computed against the active filter so the rail never lies.
 */

export type SearchParams = {
  q?: string;
  /** facet key -> selected term slugs. AND across facets, OR within one. */
  facets?: Record<string, string[]>;
  reviewOnly?: boolean;
  /** Restrict to items this user saved. */
  ownerId?: string;
  /** Only items captured in the last N days ("new this week"). */
  sinceDays?: number;
  /** FR-25. A hex colour; items whose dominant palette comes near it. */
  nearColor?: string;
  /** Internal: nearColor resolved to item ids. */
  colorIds?: string[];
  limit?: number;
  offset?: number;
};

/** FR-25. Which items have a dominant colour within reach of the one asked for. */
async function idsNearColor(hex: string): Promise<string[] | null> {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const want = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const d = await db();
  const rows = await d.query<{ id: string; colors: Array<{ r: number; g: number; b: number }> | null }>(
    `SELECT i.id, a.dominant_colors AS colors FROM items i JOIN assets a ON a.id = i.asset_id
      WHERE i.deleted_at IS NULL AND i.variant_of IS NULL AND a.dominant_colors IS NOT NULL`,
  );
  // Weighted RGB distance ("redmean"), close enough to perceptual for a filter
  // and needs no LAB conversion. 80 is roughly "the same family of colour".
  const dist = (c: { r: number; g: number; b: number }) => {
    const rm = (c.r + want[0]) / 2;
    const dr = c.r - want[0], dg = c.g - want[1], db = c.b - want[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  };
  return rows
    .map((r) => ({ id: r.id, best: Math.min(...(r.colors ?? []).slice(0, 3).map(dist), Infinity) }))
    .filter((r) => r.best <= 80)
    .sort((a, b) => a.best - b.best)
    .map((r) => r.id);
}

export type ItemRow = {
  id: string;
  title: string | null;
  captionAi: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  sha256: string;
  capturedAt: string;
  sourceKind: string | null;
  ownerName: string | null;
  needsReview: number;
};

/** Postgres websearch_to_tsquery handles quotes and OR; we add prefix on the last word. */
function toTsQuery(q: string): string {
  const words = q.trim().replace(/[':&|!()<>*\\]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return "";
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(" & ");
}

function buildWhere(p: SearchParams, startAt = 1, opts: { skipText?: boolean } = {}) {
  const wheres: string[] = ["i.deleted_at IS NULL", "i.variant_of IS NULL"];
  const params: unknown[] = [];
  let n = startAt;

  if (p.q?.trim() && !opts.skipText) {
    const ts = toTsQuery(p.q);
    if (ts) {
      wheres.push(`i.search_tsv @@ to_tsquery('english', $${n++})`);
      params.push(ts);
    }
  }

  for (const [facetKey, slugs] of Object.entries(p.facets ?? {})) {
    if (!slugs.length) continue;
    wheres.push(
      `EXISTS (SELECT 1 FROM item_terms it
                 JOIN taxonomy_terms t ON t.id = it.term_id
                 JOIN taxonomy_facets f ON f.id = t.facet_id
                WHERE it.item_id = i.id AND it.rejected = false AND it.suggested = false
                  AND f.key = $${n++} AND t.slug = ANY($${n++}::text[]))`,
    );
    params.push(facetKey, slugs);
  }

  if (p.reviewOnly) {
    wheres.push(
      `EXISTS (SELECT 1 FROM item_terms it
                WHERE it.item_id = i.id AND it.source = 'ai' AND (it.confidence < $${n++} OR it.suggested))`,
    );
    params.push(config.reviewConfidenceThreshold);
  }

  if (p.ownerId) {
    wheres.push(`i.created_by = $${n++}`);
    params.push(p.ownerId);
  }

  if (p.sinceDays && p.sinceDays > 0) {
    wheres.push(`i.captured_at > now() - ($${n++} || ' days')::interval`);
    params.push(String(Math.min(365, Math.floor(p.sinceDays))));
  }

  if (p.colorIds) {
    wheres.push(`i.id = ANY($${n++}::uuid[])`);
    params.push(p.colorIds);
  }

  return { sql: wheres.join("\n AND "), params, next: n };
}

const ITEM_SELECT = `
  SELECT i.id, i.title, i.caption_ai AS "captionAi",
         a.width, a.height, a.blurhash, a.sha256,
         i.captured_at::text AS "capturedAt",
         (SELECT kind::text FROM sources s WHERE s.item_id = i.id LIMIT 1) AS "sourceKind",
         u.name AS "ownerName",
         (SELECT count(*)::int FROM item_terms it
           WHERE it.item_id = i.id AND it.source = 'ai' AND (it.confidence < ${config.reviewConfidenceThreshold} OR it.suggested)) AS "needsReview"
    FROM items i
    JOIN assets a ON a.id = i.asset_id
    LEFT JOIN users u ON u.id = i.created_by`;

export async function search(p0: SearchParams): Promise<{ items: ItemRow[]; total: number }> {
  const d = await db();
  const limit = Math.min(p0.limit ?? 60, 200);
  const offset = p0.offset ?? 0;
  // Colour is resolved to ids once, up front, so every branch below and the
  // facet counts see the same restriction.
  const colorIds = p0.nearColor ? await idsNearColor(p0.nearColor) : null;
  const p: SearchParams = { ...p0, colorIds: colorIds ?? undefined };
  if (p0.nearColor && (!colorIds || colorIds.length === 0)) return { items: [], total: 0 };

  // ---- with a query: two rankings, fused ----------------------------------
  if (p.q?.trim()) {
    const lex = buildWhere(p);
    const lexical = await d.query<{ id: string }>(
      `SELECT i.id FROM items i
        WHERE ${lex.sql}
        ORDER BY ts_rank_cd(i.search_tsv, to_tsquery('english', $${lex.next})) DESC, i.captured_at DESC
        LIMIT 200`,
      [...lex.params, toTsQuery(p.q)],
    );
    const semantic = await searchByText(p.q, 200);
    // Exact matches first, in rank order, then what only the picture matched.
    // Rank fusion interleaves the two, which reads as noise when someone typed
    // a specific word: a note that says "proportion" should come before eleven
    // images that merely look proportionate. fuse() is kept for the case where
    // both lists are long and neither is exact, which is the semantic query.
    const lexIds = lexical.map((r) => r.id);
    const semIds = semantic.map((s) => s.itemId);
    const fused = lexIds.length && lexIds.length <= 5
      ? [...lexIds, ...semIds.filter((id) => !lexIds.includes(id))]
      : fuse([lexIds, semIds]);
    if (!fused.length) return { items: [], total: 0 };

    // Filters other than the text apply to the fused list.
    const rest = buildWhere(p, 1, { skipText: true });
    const rows = await d.query<ItemRow>(
      `${ITEM_SELECT}
        WHERE ${rest.sql} AND i.id = ANY($${rest.next}::uuid[])
        ORDER BY array_position($${rest.next}::uuid[], i.id)`,
      [...rest.params, fused],
    );
    return { items: rows.slice(offset, offset + limit), total: rows.length };
  }

  // ---- without a query: newest first --------------------------------------
  const { sql, params, next } = buildWhere(p);
  const items = await d.query<ItemRow>(
    `${ITEM_SELECT} WHERE ${sql} ORDER BY i.captured_at DESC LIMIT $${next} OFFSET $${next + 1}`,
    [...params, limit, offset],
  );
  const total = await d.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM items i JOIN assets a ON a.id = i.asset_id WHERE ${sql}`,
    params,
  );
  return { items, total: Number(total?.n ?? 0) };
}

export type FacetCount = {
  key: string;
  label: string;
  isMulti: boolean;
  isOpen: boolean;
  terms: Array<{ slug: string; label: string; count: number; selected: boolean }>;
};

/**
 * FR-27. Counts are computed against the *current* filter so the rail tells the
 * truth about what clicking next would do, with each facet's own selection
 * removed so multi-select within a facet stays additive.
 */
export async function facetCounts(p0: SearchParams): Promise<FacetCount[]> {
  const d = await db();
  const colorIds = p0.nearColor ? await idsNearColor(p0.nearColor) : null;
  const p: SearchParams = { ...p0, colorIds: colorIds ?? undefined };
  const facets = await d.query<{ id: string; key: string; label: string; is_multi: boolean; is_open: boolean }>(
    `SELECT id, key, label, is_multi, is_open FROM taxonomy_facets ORDER BY sort_order`,
  );

  const out: FacetCount[] = [];
  for (const f of facets) {
    const others = { ...(p.facets ?? {}) };
    delete others[f.key];
    const { sql, params, next } = buildWhere({ ...p, facets: others });

    const rows = await d.query<{ slug: string; label: string; count: number }>(
      `SELECT t.slug, t.label, count(DISTINCT i.id)::int AS count
         FROM taxonomy_terms t
         LEFT JOIN item_terms it ON it.term_id = t.id AND it.rejected = false AND it.suggested = false
         LEFT JOIN items i ON i.id = it.item_id AND (${sql})
        WHERE t.facet_id = $${next} AND t.status = 'active'
        GROUP BY t.id, t.slug, t.label, t.sort_order
        ORDER BY count DESC, t.sort_order, t.label`,
      [...params, f.id],
    );

    const selected = new Set(p.facets?.[f.key] ?? []);
    out.push({
      key: f.key,
      label: f.label,
      isMulti: f.is_multi,
      isOpen: f.is_open,
      terms: rows.map((r) => ({ ...r, selected: selected.has(r.slug) })),
    });
  }
  return out;
}

export async function getItem(id: string) {
  const d = await db();
  const item = await d.one<Record<string, unknown>>(
    `SELECT i.*, a.sha256, a.width, a.height, a.blurhash, a.mime_type AS "mimeType",
            a.byte_size AS "byteSize", a.dhash, a.storage_key AS "storageKey",
            u.name AS "ownerName", u.email AS "ownerEmail"
       FROM items i JOIN assets a ON a.id = i.asset_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.id = $1`,
    [id],
  );
  if (!item) return null;

  const tags = await d.query<Record<string, unknown>>(
    `SELECT f.key AS "facetKey", f.label AS "facetLabel", f.is_open AS "facetOpen",
            t.id AS "termId", t.slug, t.label,
            it.confidence::float AS confidence, it.source::text AS source, it.rejected, it.suggested,
            it.model_version AS "modelVersion", su.name AS "setByName"
       FROM item_terms it
       JOIN taxonomy_terms t ON t.id = it.term_id
       JOIN taxonomy_facets f ON f.id = t.facet_id
       LEFT JOIN users su ON su.id = it.set_by
      WHERE it.item_id = $1
      ORDER BY f.sort_order, it.confidence DESC`,
    [id],
  );

  const sources = await d.query<Record<string, string | null>>(
    `SELECT kind::text AS kind, source_url, author_handle, board_name, page_title FROM sources WHERE item_id = $1`,
    [id],
  );

  const variants = await d.query<{ id: string; sha256: string }>(
    `SELECT i.id, a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.variant_of = $1`,
    [id],
  );

  const job = await d.one<{ state: string; last_error: string | null; attempts: number }>(
    `SELECT state::text AS state, last_error, attempts FROM ingest_jobs WHERE dedupe_key = $1`,
    [`tag:${id}`],
  );

  return { item, tags, sources, variants, job };
}

/**
 * FR-31. Looks like this one: by vector when the item has one, else by
 * shared tags, which is at least explainable.
 */
export async function similar(itemId: string, limit = 12): Promise<Array<{ id: string; sha256: string; shared: number; how: "vector" | "tags" }>> {
  const d = await db();
  const near = await similarByVector(itemId, limit);
  if (near.length) {
    const ids = near.map((n) => n.itemId);
    const rows = await d.query<{ id: string; sha256: string }>(
      `SELECT i.id, a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id
        WHERE i.id = ANY($1::uuid[]) AND i.deleted_at IS NULL
        ORDER BY array_position($1::uuid[], i.id)`,
      [ids],
    );
    return rows.map((r) => ({ ...r, shared: 0, how: "vector" as const }));
  }
  const byTags = await d.query<{ id: string; sha256: string; shared: number }>(
    `SELECT i.id, a.sha256, count(*)::int AS shared
       FROM item_terms mine
       JOIN item_terms theirs ON theirs.term_id = mine.term_id AND theirs.item_id <> mine.item_id
       JOIN items i ON i.id = theirs.item_id
       JOIN assets a ON a.id = i.asset_id
      WHERE mine.item_id = $1 AND mine.rejected = false AND theirs.rejected = false
        AND i.deleted_at IS NULL AND i.variant_of IS NULL
      GROUP BY i.id, a.sha256, i.captured_at
      ORDER BY shared DESC, i.captured_at DESC
      LIMIT $2`,
    [itemId, limit],
  );
  return byTags.map((r) => ({ ...r, how: "tags" as const }));
}

/**
 * FR-22. Near-duplicates, requiring *both* hashes to agree. dHash encodes
 * horizontal gradient only; aHash encodes brightness distribution. They fail
 * differently, and demanding both keeps the real re-saves and drops the
 * coincidences. A wrong merge hides an image; a missed one only duplicates it.
 */
export async function nearDuplicates(dhash: string, phash: string | null, threshold: number) {
  const d = await db();
  const all = await d.query<{ id: string; dhash: string; phash: string | null }>(
    `SELECT id, dhash, phash FROM assets WHERE dhash IS NOT NULL`,
  );
  // Linear scan. Instant at this scale; a BK-tree at 100k, which is contained work.
  return all
    .map((a) => ({
      id: a.id,
      distance: hammingDistance(dhash, a.dhash),
      aDistance: phash && a.phash ? hammingDistance(phash, a.phash) : 64,
    }))
    .filter((a) => a.distance <= threshold && a.aDistance <= threshold)
    .sort((a, b) => a.distance + a.aDistance - (b.distance + b.aDistance));
}

/** Per-user: images of mine the tagger gave up on. They need a person (FR-5). */
export async function quarantined(ownerId: string) {
  const d = await db();
  return d.query<{ id: string; sha256: string; title: string | null; lastError: string | null; attempts: number }>(
    `SELECT i.id, a.sha256, i.title, j.last_error AS "lastError", j.attempts
       FROM ingest_jobs j
       JOIN items i ON i.id = (j.payload->>'itemId')::uuid
       JOIN assets a ON a.id = i.asset_id
      WHERE j.kind = 'tag' AND j.state = 'quarantined'
        AND i.created_by = $1 AND i.deleted_at IS NULL
      ORDER BY j.created_at DESC`,
    [ownerId],
  );
}

export async function stats(ownerId?: string) {
  const d = await db();
  const row = await d.one<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM items WHERE deleted_at IS NULL)::text AS items,
       (SELECT count(*) FROM assets)::text AS assets,
       (SELECT coalesce(sum(byte_size),0) FROM assets)::text AS bytes,
       (SELECT count(DISTINCT item_id) FROM item_terms WHERE source = 'ai')::text AS tagged,
       (SELECT count(*) FROM item_terms WHERE source = 'human')::text AS "humanTags",
       (SELECT count(DISTINCT item_id) FROM item_terms WHERE source = 'ai' AND (confidence < $1 OR suggested))::text AS "needsReview",
       (SELECT count(DISTINCT it.item_id) FROM item_terms it JOIN items i ON i.id = it.item_id
         WHERE it.source = 'ai' AND (it.confidence < $1 OR it.suggested) AND i.created_by = $2)::text AS "myReview",
       (SELECT count(*) FROM ingest_jobs j JOIN items i ON i.id = (j.payload->>'itemId')::uuid
         WHERE j.state = 'quarantined' AND i.created_by = $2)::text AS "myQuarantined",
       (SELECT count(*) FROM proposed_terms WHERE status = 'pending')::text AS proposed,
       (SELECT count(*) FROM items WHERE variant_of IS NOT NULL)::text AS variants,
       (SELECT count(*) FROM users WHERE email <> 'system@palette.local')::text AS people`,
    [config.reviewConfidenceThreshold, ownerId ?? "00000000-0000-0000-0000-000000000000"],
  );
  const n = (k: string) => Number(row?.[k] ?? 0);
  return {
    items: n("items"), assets: n("assets"), bytes: n("bytes"), tagged: n("tagged"),
    humanTags: n("humanTags"), needsReview: n("needsReview"), myReview: n("myReview"),
    myQuarantined: n("myQuarantined"), proposed: n("proposed"), variants: n("variants"), people: n("people"),
  };
}

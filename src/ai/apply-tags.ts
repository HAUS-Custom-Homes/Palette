import { PROMPT_VERSION, TAXONOMY_VERSION, config } from "@/config";
import { db } from "@/db/client";
import { reindexItem } from "@/search/index-item";
import { slugify } from "@/taxonomy/seed-data";
import type { TagResult } from "./tag-schema";

/**
 * REF-01 FR-19 and FR-20, in one function.
 *
 * This is the only place in the system allowed to write AI tags, and the rule
 * it enforces is the reason the library appreciates rather than decays:
 *
 *   A tagging run owns its own rows and nobody else's. It may add, update and
 *   remove rows it previously wrote as 'ai'. It may not touch a row a human
 *   owns, and it may not re-add a term a human has rejected, no matter how
 *   confident a newer model is.
 *
 * The database enforces the first half with triggers (drizzle/triggers.sql).
 * This function enforces the rejection half, which a trigger cannot see,
 * because "do not insert this" is a decision about a row that does not exist.
 */
export async function applyTags(
  itemId: string,
  result: TagResult,
  modelVersion: string,
): Promise<{ added: number; removed: number; keptHuman: number; proposed: number }> {
  const d = await db();

  const facets = await d.query<{ id: string; key: string; is_multi: boolean; ai_tagged: boolean }>(
    `SELECT id, key, is_multi, ai_tagged FROM taxonomy_facets`,
  );
  const terms = await d.query<{ id: string; facet_id: string; slug: string }>(
    `SELECT id, facet_id, slug FROM taxonomy_terms WHERE status = 'active'`,
  );
  const existing = await d.query<{ term_id: string; source: string; rejected: boolean }>(
    `SELECT term_id, source, rejected FROM item_terms WHERE item_id = $1`,
    [itemId],
  );

  const facetByKey = new Map(facets.map((f) => [f.key, f]));
  const termBySlug = new Map(terms.map((t) => [`${t.facet_id}:${t.slug}`, t]));
  const humanTermIds = new Set(existing.filter((r) => r.source === "human").map((r) => r.term_id));
  const rejectedTermIds = new Set(existing.filter((r) => r.rejected).map((r) => r.term_id));
  const priorAiTermIds = new Set(existing.filter((r) => r.source === "ai").map((r) => r.term_id));

  // ---- resolve the model's answer into term ids -------------------------
  const wanted = new Map<string, number>();
  for (const [facetKey, rows] of Object.entries(result.facets)) {
    const facet = facetByKey.get(facetKey);
    if (!facet || !facet.ai_tagged || rows.length === 0) continue;

    // Cardinality is enforced here rather than in the schema, so a model that
    // is torn between two answers can say so and we can see it happen.
    const candidates = facet.is_multi
      ? rows
      : [[...rows].sort((a, b) => b.confidence - a.confidence)[0]];

    for (const row of candidates) {
      const term = termBySlug.get(`${facet.id}:${row.term}`);
      if (!term) continue; // outside the vocabulary; the schema should have prevented it
      if (rejectedTermIds.has(term.id)) continue; // FR-19: a human said no. That is final.
      if (humanTermIds.has(term.id)) continue; // owned by a human; leave it alone
      wanted.set(term.id, Math.max(wanted.get(term.id) ?? 0, row.confidence));
    }
  }

  let added = 0;
  let removed = 0;

  await d.transaction(async (tx) => {
    for (const termId of priorAiTermIds) {
      if (!wanted.has(termId)) {
        await tx.query(
          `DELETE FROM item_terms WHERE item_id = $1 AND term_id = $2 AND source = 'ai'`,
          [itemId, termId],
        );
        removed++;
      }
    }

    for (const [termId, confidence] of wanted) {
      const rows = await tx.query(
        `INSERT INTO item_terms
           (item_id, term_id, confidence, source, rejected,
            model_version, prompt_version, taxonomy_version)
         VALUES ($1, $2, $3, 'ai', false, $4, $5, $6)
         ON CONFLICT (item_id, term_id) DO UPDATE SET
           confidence = excluded.confidence,
           model_version = excluded.model_version,
           prompt_version = excluded.prompt_version,
           taxonomy_version = excluded.taxonomy_version
         WHERE item_terms.source = 'ai'
         RETURNING term_id`,
        [itemId, termId, confidence, modelVersion, PROMPT_VERSION, TAXONOMY_VERSION],
      );
      if (rows.length) added++;
    }

    if (result.caption) {
      await tx.query(`UPDATE items SET caption_ai = $1 WHERE id = $2`, [result.caption, itemId]);
    }

    // FR-23. The only channel by which a closed vocabulary grows.
    for (const s of result.unmatched) {
      const label = s.label.trim().toLowerCase();
      if (!label) continue;
      await tx.query(
        `INSERT INTO proposed_terms (facet_key, raw_label, item_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (facet_key, raw_label)
         DO UPDATE SET occurrences = proposed_terms.occurrences + 1`,
        [s.facet, label, itemId],
      );
    }

    await tx.query(
      `INSERT INTO audit_events (actor_id, entity, entity_id, action, after)
       VALUES ($1, 'item', $2, 'tagged', $3)`,
      [modelVersion, itemId, JSON.stringify({ added, removed, model: modelVersion })],
    );
  });

  await reindexItem(itemId);

  return { added, removed, keptHuman: humanTermIds.size, proposed: result.unmatched.length };
}

/**
 * A human adds or removes a tag. Human writes always win and are permanent.
 * Removing an AI tag leaves a tombstone rather than a hole, because otherwise
 * the next tagging run would helpfully put it straight back.
 */
export async function setHumanTag(
  itemId: string,
  termId: string,
  action: "add" | "remove",
  userId: string,
): Promise<void> {
  const d = await db();

  await d.transaction(async (tx) => {
    if (action === "add") {
      await tx.query(
        `INSERT INTO item_terms (item_id, term_id, confidence, source, rejected, set_by, taxonomy_version)
         VALUES ($1, $2, 1.0, 'human', false, $3, $4)
         ON CONFLICT (item_id, term_id) DO UPDATE SET
           source = 'human', confidence = 1.0, rejected = false, set_by = excluded.set_by,
           model_version = NULL, prompt_version = NULL`,
        [itemId, termId, userId, TAXONOMY_VERSION],
      );
    } else {
      // The tombstone. source stays 'human' so the delete trigger protects it,
      // and rejected = true so applyTags() will never reinstate the term.
      await tx.query(
        `INSERT INTO item_terms (item_id, term_id, confidence, source, rejected, set_by, taxonomy_version)
         VALUES ($1, $2, 0.0, 'human', true, $3, $4)
         ON CONFLICT (item_id, term_id) DO UPDATE SET
           source = 'human', rejected = true, confidence = 0.0, set_by = excluded.set_by,
           model_version = NULL, prompt_version = NULL`,
        [itemId, termId, userId, TAXONOMY_VERSION],
      );
    }
    await tx.query(
      `INSERT INTO audit_events (actor_id, entity, entity_id, action, after)
       VALUES ($1, 'item_term', $2, $3, $4)`,
      [userId, itemId, `tag_${action}`, JSON.stringify({ termId })],
    );
  });

  await reindexItem(itemId);
}

/**
 * An editor creates a term in an open facet (a new haus) and, optionally,
 * tags an item with it in the same motion. Refused on closed facets: those
 * grow only through proposals (FR-23).
 */
export async function createOpenTerm(
  facetKey: string,
  label: string,
  userId: string,
): Promise<{ termId: string; created: boolean }> {
  const d = await db();
  const clean = label.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) throw new Error("term label must be 2 to 60 characters");

  const facet = await d.one<{ id: string; is_open: boolean }>(
    `SELECT id, is_open FROM taxonomy_facets WHERE key = $1`,
    [facetKey],
  );
  if (!facet) throw new Error(`no facet ${facetKey}`);
  if (!facet.is_open) throw new Error(`facet ${facetKey} is closed; propose the term instead`);

  const slug = slugify(clean);
  const existing = await d.one<{ id: string }>(
    `SELECT id FROM taxonomy_terms WHERE facet_id = $1 AND slug = $2`,
    [facet.id, slug],
  );
  if (existing) return { termId: existing.id, created: false };

  const row = await d.one<{ id: string }>(
    `INSERT INTO taxonomy_terms (facet_id, slug, label, status, created_by)
     VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
    [facet.id, slug, clean, userId],
  );
  return { termId: row!.id, created: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Callers name a haus by slug (the dropdown, the extension, the Shortcut) or
 * by id (internal). Both are accepted; unknown slugs are dropped rather than
 * failing the whole upload, because losing a haus tag is recoverable and
 * losing an image is not. Only open facets are resolvable this way.
 */
export async function resolveOpenTermIds(facetKey: string, values: string[]): Promise<string[]> {
  const clean = values.map((v) => v.trim()).filter(Boolean);
  if (!clean.length) return [];
  const d = await db();
  const ids = clean.filter((v) => UUID.test(v));
  const slugs = clean.filter((v) => !UUID.test(v)).map(slugify);
  if (slugs.length) {
    const rows = await d.query<{ id: string }>(
      `SELECT t.id FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
        WHERE f.key = $1 AND f.is_open = true AND t.status = 'active' AND t.slug = ANY($2::text[])`,
      [facetKey, slugs],
    );
    ids.push(...rows.map((r) => r.id));
  }
  return [...new Set(ids)];
}

/** FR-23. Items carrying a tag the model was not sure about. */
export async function needsReview(itemId: string): Promise<boolean> {
  const d = await db();
  const row = await d.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM item_terms
      WHERE item_id = $1 AND source = 'ai' AND confidence < $2`,
    [itemId, config.reviewConfidenceThreshold],
  );
  return Number(row?.n) > 0;
}

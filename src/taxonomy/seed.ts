import { db } from "@/db/client";
import { SEED_FACETS } from "./seed-data";

/**
 * Seeds the v1 vocabulary (REF-01 FR-16). Idempotent and additive: it inserts
 * what is missing and never deletes or renames, so re-running it after the
 * designer has edited terms cannot undo their work. Called by `npm run seed`
 * and, on a database with no facets at all, by the first boot, so a fresh
 * deployment needs no command run against it.
 */
export async function seedTaxonomy(): Promise<{ facetsAdded: number; termsAdded: number; facets: number; terms: number }> {
  const d = await db();
  let facetsAdded = 0;
  let termsAdded = 0;

  for (const [i, f] of SEED_FACETS.entries()) {
    const existing = await d.one<{ id: string }>(`SELECT id FROM taxonomy_facets WHERE key = $1`, [f.key]);
    let facetId = existing?.id;
    if (!facetId) {
      const row = await d.one<{ id: string }>(
        `INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged, guidance, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [f.key, f.label, f.isMulti, f.isOpen ?? false, f.aiTagged ?? true, f.guidance, i],
      );
      facetId = row!.id;
      facetsAdded++;
    } else {
      // Guidance and label are prompt-affecting text, safe to refresh. Terms are not.
      await d.query(`UPDATE taxonomy_facets SET guidance = $1, label = $2, sort_order = $3 WHERE id = $4`, [f.guidance, f.label, i, facetId]);
    }
    for (const [j, t] of f.terms.entries()) {
      const rows = await d.query(
        `INSERT INTO taxonomy_terms (facet_id, slug, label, synonyms, status, sort_order)
         VALUES ($1, $2, $3, $4, 'active', $5) ON CONFLICT (facet_id, slug) DO NOTHING RETURNING id`,
        [facetId, t.slug, t.label, t.synonyms ?? [], j],
      );
      if (rows.length) termsAdded++;
    }
  }

  const totals = await d.one<{ facets: string; terms: string }>(
    `SELECT (SELECT count(*) FROM taxonomy_facets)::text AS facets,
            (SELECT count(*) FROM taxonomy_terms WHERE status = 'active')::text AS terms`,
  );
  return { facetsAdded, termsAdded, facets: Number(totals?.facets ?? 0), terms: Number(totals?.terms ?? 0) };
}

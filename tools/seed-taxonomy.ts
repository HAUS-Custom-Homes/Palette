import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { SEED_FACETS } from "@/taxonomy/seed-data";

/**
 * Seeds the v1 vocabulary (REF-01 FR-16).
 *
 * Idempotent and additive on purpose. Re-running after the designer has edited
 * terms must not undo their work, so this only inserts what is missing and
 * never deletes or renames. Retiring a term is a human action with a status
 * change, not a side effect of running a script.
 */
async function seed() {
  await migrate({ quiet: true });
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
         VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (facet_id, slug) DO NOTHING RETURNING id`,
        [facetId, t.slug, t.label, t.synonyms ?? [], j],
      );
      if (rows.length) termsAdded++;
    }
  }

  const totals = await d.one<{ facets: string; terms: string }>(
    `SELECT (SELECT count(*) FROM taxonomy_facets)::text AS facets,
            (SELECT count(*) FROM taxonomy_terms WHERE status = 'active')::text AS terms`,
  );
  console.log(`[seed] +${facetsAdded} facets, +${termsAdded} terms. Vocabulary now: ${totals?.facets} facets, ${totals?.terms} active terms.`);
  await d.close();
}

seed().catch((e) => { console.error(e); process.exit(1); });

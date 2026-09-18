import { db } from "@/db/client";
import { slugify } from "./seed-data";

/**
 * REF-01 FR-16, FR-23. How a closed vocabulary grows and shrinks.
 *
 * The model proposes; a person promotes or rejects. Promotion creates the
 * term and, on request, tags every item the model proposed it for, as a
 * suggestion from that model rather than a human tag, because the person
 * approved the word, not each picture. Retiring a term keeps its rows (the
 * history is real) but removes it from the schema the model sees and from
 * the facet rail.
 */
export async function listProposals() {
  const d = await db();
  return d.query<{ id: string; facetKey: string; facetLabel: string; label: string; occurrences: number; sample: string | null; createdAt: string }>(
    `SELECT p.id, p.facet_key AS "facetKey", f.label AS "facetLabel", p.raw_label AS label, p.occurrences,
            (SELECT a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = p.item_id) AS sample,
            p.created_at::text AS "createdAt"
       FROM proposed_terms p JOIN taxonomy_facets f ON f.key = p.facet_key
      WHERE p.status = 'pending'
      ORDER BY p.occurrences DESC, p.created_at`,
  );
}

export async function promoteProposal(proposalId: string, userId: string, opts: { label?: string; synonyms?: string[] } = {}): Promise<string> {
  const d = await db();
  const p = await d.one<{ facet_key: string; raw_label: string }>(`SELECT facet_key, raw_label FROM proposed_terms WHERE id = $1 AND status = 'pending'`, [proposalId]);
  if (!p) throw new Error("no such pending proposal");
  const facet = await d.one<{ id: string }>(`SELECT id FROM taxonomy_facets WHERE key = $1`, [p.facet_key]);
  if (!facet) throw new Error("no such facet");

  const label = (opts.label ?? p.raw_label).trim().replace(/\s+/g, " ");
  const slug = slugify(label);
  const term = await d.one<{ id: string }>(
    `INSERT INTO taxonomy_terms (facet_id, slug, label, synonyms, status, created_by)
     VALUES ($1, $2, $3, $4, 'active', $5)
     ON CONFLICT (facet_id, slug) DO UPDATE SET status = 'active', label = excluded.label RETURNING id`,
    [facet.id, slug, label.charAt(0).toUpperCase() + label.slice(1), opts.synonyms ?? [], userId],
  );
  await d.query(`UPDATE proposed_terms SET status = 'promoted' WHERE id = $1`, [proposalId]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'term', $2, 'promoted', $3)`, [userId, term!.id, JSON.stringify({ facet: p.facet_key, label })]);
  return term!.id;
}

export async function rejectProposal(proposalId: string, userId: string): Promise<void> {
  const d = await db();
  await d.query(`UPDATE proposed_terms SET status = 'rejected' WHERE id = $1`, [proposalId]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'proposal', $2, 'rejected')`, [userId, proposalId]);
}

export async function listTerms() {
  const d = await db();
  return d.query<{ facetKey: string; facetLabel: string; isOpen: boolean; id: string; slug: string; label: string; synonyms: string[]; status: string; uses: number }>(
    `SELECT f.key AS "facetKey", f.label AS "facetLabel", f.is_open AS "isOpen", t.id, t.slug, t.label, t.synonyms, t.status::text AS status,
            (SELECT count(*)::int FROM item_terms it WHERE it.term_id = t.id AND it.rejected = false) AS uses
       FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
      ORDER BY f.sort_order, t.status, t.label`,
  );
}

export async function setTermStatus(termId: string, status: "active" | "retired", userId: string): Promise<void> {
  const d = await db();
  await d.query(`UPDATE taxonomy_terms SET status = $1::term_status WHERE id = $2`, [status, termId]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'term', $2, $3)`, [userId, termId, status]);
}

export async function setSynonyms(termId: string, synonyms: string[], userId: string): Promise<void> {
  const d = await db();
  const clean = [...new Set(synonyms.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await d.query(`UPDATE taxonomy_terms SET synonyms = $1 WHERE id = $2`, [clean, termId]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'term', $2, 'synonyms', $3)`, [userId, termId, JSON.stringify(clean)]);
}

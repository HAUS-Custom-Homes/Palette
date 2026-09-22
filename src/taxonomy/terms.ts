import { db } from "@/db/client";
import { slugify } from "./seed-data";

/**
 * A person adds a word to the vocabulary from a picture (2026-09-22, Trevor:
 * "foyer" was missing). The model still never invents a term; it proposes
 * (FR-23). But a person on a picture is the promotion step itself, and the
 * cost of that is duplicates: "Foyer", "foyers", "Entry" all meaning one
 * thing. So every creation is first matched against what exists, as a slug,
 * as a synonym, and as a near miss, and the caller decides whether to use
 * the existing term, fold the new word into it as a synonym, or create anew.
 */
export type TermMatch = { id: string; label: string; facetKey: string; facetLabel: string; via: "exact" | "synonym" | "near" };

/** "Foyers " -> "foyer": lower case, one space, no punctuation, singular. */
export function normalize(label: string): string {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return s.split(" ").map(singular).join(" ");
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(x|ch|sh|s)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n]!;
}

/**
 * What the vocabulary already has for this word, across every facet: the
 * same term (by slug or by a synonym someone recorded), and near misses
 * (a plural, a typo, or the word with one more word in it).
 */
export async function findLike(label: string): Promise<{ exact: TermMatch | null; near: TermMatch[] }> {
  const d = await db();
  const rows = await d.query<{ id: string; label: string; slug: string; synonyms: string[]; facetKey: string; facetLabel: string }>(
    `SELECT t.id, t.label, t.slug, t.synonyms, f.key AS "facetKey", f.label AS "facetLabel"
       FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
      WHERE t.status = 'active' AND f.key <> 'project'`,
  );
  const want = normalize(label);
  const slug = slugify(label);
  let exact: TermMatch | null = null;
  const near: TermMatch[] = [];
  for (const r of rows) {
    const m = (via: TermMatch["via"]): TermMatch => ({ id: r.id, label: r.label, facetKey: r.facetKey, facetLabel: r.facetLabel, via });
    if (r.slug === slug || normalize(r.label) === want) { exact ??= m("exact"); continue; }
    if ((r.synonyms ?? []).some((s) => normalize(s) === want)) { exact ??= m("synonym"); continue; }
    const have = normalize(r.label);
    const short = Math.min(have.length, want.length);
    const close = short >= 4 && distance(have, want) <= (short >= 8 ? 2 : 1);
    const contains = short >= 4 && (` ${have} `.includes(` ${want} `) || ` ${want} `.includes(` ${have} `));
    if (close || contains) near.push(m("near"));
  }
  near.sort((a, b) => distance(normalize(a.label), want) - distance(normalize(b.label), want));
  return { exact, near: near.slice(0, 3) };
}

export type Created = { termId: string; label: string; facetKey: string; created: boolean; merged: boolean };

/**
 * Add the word. `synonymOf` folds it into an existing term instead (the
 * person said "same thing"), so search and the model both learn the word
 * without a second term. An identical term is reused, never duplicated. A
 * pending proposal from the model for the same word is closed as promoted.
 */
export async function createTerm(
  input: { facetKey: string; label: string; synonymOf?: string },
  userId: string,
): Promise<Created> {
  const d = await db();
  const clean = input.label.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) throw new Error("a tag needs 2 to 60 characters");
  const label = clean.charAt(0).toUpperCase() + clean.slice(1);

  if (input.synonymOf) {
    const t = await d.one<{ id: string; label: string; synonyms: string[]; facet_key: string }>(
      `SELECT t.id, t.label, t.synonyms, f.key AS facet_key FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id WHERE t.id = $1`,
      [input.synonymOf],
    );
    if (!t) throw new Error("no such term to merge into");
    const syn = [...new Set([...(t.synonyms ?? []), clean.toLowerCase()])].slice(0, 30);
    await d.query(`UPDATE taxonomy_terms SET synonyms = $1 WHERE id = $2`, [syn, t.id]);
    await d.query(`UPDATE proposed_terms SET status = 'promoted' WHERE status = 'pending' AND lower(raw_label) = $1`, [clean.toLowerCase()]);
    await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'term', $2, 'synonyms', $3)`, [userId, t.id, JSON.stringify(syn)]);
    return { termId: t.id, label: t.label, facetKey: t.facet_key, created: false, merged: true };
  }

  if (input.facetKey === "project") throw new Error("a haus is added from the Haus panel");
  const facet = await d.one<{ id: string; key: string }>(`SELECT id, key FROM taxonomy_facets WHERE key = $1`, [input.facetKey]);
  if (!facet) throw new Error(`no facet ${input.facetKey}`);

  const slug = slugify(clean);
  const existing = await d.one<{ id: string; label: string }>(
    `SELECT id, label FROM taxonomy_terms WHERE facet_id = $1 AND slug = $2`,
    [facet.id, slug],
  );
  if (existing) {
    await d.query(`UPDATE taxonomy_terms SET status = 'active' WHERE id = $1`, [existing.id]);
    return { termId: existing.id, label: existing.label, facetKey: facet.key, created: false, merged: false };
  }

  const row = await d.one<{ id: string }>(
    `INSERT INTO taxonomy_terms (facet_id, slug, label, status, created_by) VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
    [facet.id, slug, label, userId],
  );
  await d.query(`UPDATE proposed_terms SET status = 'promoted' WHERE status = 'pending' AND lower(raw_label) = $1`, [clean.toLowerCase()]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'term', $2, 'created', $3)`, [userId, row!.id, JSON.stringify({ facet: facet.key, label })]);
  return { termId: row!.id, label, facetKey: facet.key, created: true, merged: false };
}

/** The model's pending proposals, for a picker to offer as one-tap additions. */
export async function pendingProposals(): Promise<Array<{ id: string; label: string; facetKey: string; facetLabel: string; occurrences: number; itemId: string | null }>> {
  const d = await db();
  return d.query(
    `SELECT p.id, p.raw_label AS label, p.facet_key AS "facetKey", f.label AS "facetLabel", p.occurrences, p.item_id::text AS "itemId"
       FROM proposed_terms p JOIN taxonomy_facets f ON f.key = p.facet_key
      WHERE p.status = 'pending' ORDER BY p.occurrences DESC, p.created_at LIMIT 60`,
  );
}

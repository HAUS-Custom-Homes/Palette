import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { upsertUser } from "@/lib/users";
import { createTerm, findLike, normalize } from "@/taxonomy/terms";

/**
 * 2026-09-22. A person may add a word from a picture. The vocabulary must not
 * fill up with five spellings of one thing: the same word is reused, a near
 * miss is offered first, and "same thing" folds the new word in as a synonym.
 */
let userId: string;

beforeAll(async () => {
  await migrate({ quiet: true });
  const d = await db();
  await d.query(`INSERT INTO taxonomy_facets (key, label, sort_order) VALUES ('space', 'Space', 2) ON CONFLICT (key) DO NOTHING`);
  const f = await d.one<{ id: string }>(`SELECT id FROM taxonomy_facets WHERE key = 'space'`);
  await d.query(`INSERT INTO taxonomy_terms (facet_id, slug, label, synonyms) VALUES ($1, 'entry', 'Entry', '{"entryway"}') ON CONFLICT (facet_id, slug) DO UPDATE SET synonyms = excluded.synonyms`, [f!.id]);
  userId = (await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" })).id;
});
afterAll(async () => { await (await db()).close(); });

describe("adding a word to the vocabulary", () => {
  it("normalises spelling, spacing and plurals", () => {
    expect(normalize(" Foyers ")).toBe("foyer");
    expect(normalize("Wall-sconces")).toBe("wall sconce");
    expect(normalize("Glass")).toBe("glass");
    expect(normalize("Pantries")).toBe("pantry");
  });

  it("finds the same thing under another spelling, and near misses", async () => {
    expect((await findLike("entries")).exact?.label).toBe("Entry");
    expect((await findLike("Entryway")).exact?.via).toBe("synonym");
    const near = await findLike("Entry hall");
    expect(near.exact).toBeNull();
    expect(near.near.map((n) => n.label)).toContain("Entry");
    expect((await findLike("Foyer")).near).toEqual([]);
  });

  it("creates a new word once, reuses it after, and closes the model's proposal for it", async () => {
    const d = await db();
    await d.query(`INSERT INTO proposed_terms (facet_key, raw_label) VALUES ('space', 'foyer') ON CONFLICT DO NOTHING`);
    const a = await createTerm({ facetKey: "space", label: "foyer" }, userId);
    expect(a).toMatchObject({ created: true, label: "Foyer", facetKey: "space" });
    const b = await createTerm({ facetKey: "space", label: "Foyer" }, userId);
    expect(b).toMatchObject({ created: false, termId: a.termId });
    const n = await d.one<{ n: string }>(`SELECT count(*)::text AS n FROM taxonomy_terms WHERE slug = 'foyer'`);
    expect(Number(n!.n)).toBe(1);
    const p = await d.one<{ status: string }>(`SELECT status FROM proposed_terms WHERE raw_label = 'foyer'`);
    expect(p!.status).toBe("promoted");
  });

  it("folds a word into an existing term as a synonym when told it is the same thing", async () => {
    const d = await db();
    const entry = await d.one<{ id: string }>(`SELECT id FROM taxonomy_terms WHERE slug = 'entry'`);
    const r = await createTerm({ facetKey: "space", label: "Entry hall", synonymOf: entry!.id }, userId);
    expect(r).toMatchObject({ merged: true, termId: entry!.id, label: "Entry" });
    expect((await findLike("entry hall")).exact?.via).toBe("synonym");
  });

  it("never makes a haus here", async () => {
    await expect(createTerm({ facetKey: "project", label: "Hurst" }, userId)).rejects.toThrow(/Haus panel/);
  });
});

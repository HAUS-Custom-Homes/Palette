import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTags, createOpenTerm } from "@/ai/apply-tags";
import { buildTagSchema, loadTaxonomy, renderTaxonomyPrompt } from "@/ai/tag-schema";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { upsertUser } from "@/lib/users";
import { listProposals, promoteProposal, rejectProposal, setSynonyms, setTermStatus } from "@/taxonomy/admin";

/** FR-16, FR-23. A closed vocabulary grows through proposals and a person, and nowhere else. */
let user: { id: string };

beforeAll(async () => {
  await migrate({ quiet: true });
  const d = await db();
  await d.query(`INSERT INTO taxonomy_facets (key, label, ai_tagged) VALUES ('material','Material',true) ON CONFLICT (key) DO NOTHING`);
  await d.query(`INSERT INTO taxonomy_facets (key, label, is_open, ai_tagged) VALUES ('project','Haus',true,false) ON CONFLICT (key) DO NOTHING`);
  user = await upsertUser({ email: "designer@hauscustomhomes.com", name: "Designer" });
});

afterAll(async () => { await (await db()).close(); });

describe("vocabulary growth", () => {
  it("a proposal, promoted, becomes a term the model is shown next time", async () => {
    const d = await db();
    const a = await d.one<{ id: string }>(`INSERT INTO assets (sha256, storage_key, mime_type, byte_size) VALUES (repeat('a', 64), 'originals/aa/aa/a.jpg', 'image/jpeg', 10) RETURNING id`);
    const item = await d.one<{ id: string }>(`INSERT INTO items (asset_id, created_by) VALUES ($1, $2) RETURNING id`, [a!.id, user.id]);

    await applyTags(item!.id, { caption: "x", facets: {}, unmatched: [{ facet: "material", label: "Tadelakt" }] }, "m");
    await applyTags(item!.id, { caption: "x", facets: {}, unmatched: [{ facet: "material", label: "tadelakt" }] }, "m");

    const pending = await listProposals();
    expect(pending.map((p) => p.label)).toContain("tadelakt");
    expect(pending.find((p) => p.label === "tadelakt")!.occurrences).toBe(2);

    const materialSlugs = async () => (await loadTaxonomy()).find((f) => f.key === "material")!.terms.map((t) => t.slug);
    expect(await materialSlugs()).not.toContain("tadelakt");
    expect(renderTaxonomyPrompt(await loadTaxonomy())).not.toContain("tadelakt");

    await promoteProposal(pending.find((p) => p.label === "tadelakt")!.id, user.id);
    expect(await materialSlugs()).toContain("tadelakt");
    expect(renderTaxonomyPrompt(await loadTaxonomy())).toContain("tadelakt");
    // And the structured-output schema will accept it: parsing the slug succeeds.
    const schema = buildTagSchema(await loadTaxonomy());
    expect(schema.safeParse({ caption: "x", material: [{ term: "tadelakt", confidence: 0.9 }], unmatched_suggestions: [] }).success).toBe(true);
    expect((await listProposals()).some((p) => p.label === "tadelakt")).toBe(false);
  });

  it("a rejected proposal stays rejected, and a retired term leaves the schema but keeps its rows", async () => {
    const d = await db();
    await d.query(`INSERT INTO proposed_terms (facet_key, raw_label) VALUES ('material', 'glitter') ON CONFLICT DO NOTHING`);
    const p = (await listProposals()).find((x) => x.label === "glitter")!;
    await rejectProposal(p.id, user.id);
    expect((await listProposals()).some((x) => x.label === "glitter")).toBe(false);

    const facet = await d.one<{ id: string }>(`SELECT id FROM taxonomy_facets WHERE key = 'material'`);
    const term = await d.one<{ id: string }>(`INSERT INTO taxonomy_terms (facet_id, slug, label) VALUES ($1, 'soapstone', 'Soapstone') ON CONFLICT (facet_id, slug) DO UPDATE SET label = excluded.label RETURNING id`, [facet!.id]);
    await setSynonyms(term!.id, ["Soap stone", " SOAPSTONE ", "soap stone"], user.id);
    expect((await d.one<{ synonyms: string[] }>(`SELECT synonyms FROM taxonomy_terms WHERE id = $1`, [term!.id]))!.synonyms).toEqual(["soap stone", "soapstone"]);

    const materialSlugs = async () => (await loadTaxonomy()).find((f) => f.key === "material")!.terms.map((t) => t.slug);
    await setTermStatus(term!.id, "retired", user.id);
    expect(await materialSlugs()).not.toContain("soapstone");
    expect((await d.one<{ n: string }>(`SELECT count(*)::text AS n FROM taxonomy_terms WHERE id = $1`, [term!.id]))!.n).toBe("1"); // rows kept
    await setTermStatus(term!.id, "active", user.id);
    expect(await materialSlugs()).toContain("soapstone");
  });

  it("an open facet grows directly and never through proposals", async () => {
    expect((await createOpenTerm("project", "Antoon", user.id)).created).toBe(true);
    await expect(createOpenTerm("material", "anything", user.id)).rejects.toThrow(/closed/);
  });
});

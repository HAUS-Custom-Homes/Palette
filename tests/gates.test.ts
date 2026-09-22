import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyTags, setHumanTag } from "@/ai/apply-tags";
import { passedFacets, trustModel } from "@/ai/gates";
import type { TagResult } from "@/ai/tag-schema";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { upsertUser } from "@/lib/users";
import { facetCounts, search } from "@/search/query";

/**
 * REF-01 FR-18. Until a model has passed the eval gate on a facet, its tags
 * are suggestions: visible, reviewable, never filtered on. The rule that
 * stops a 70%-right model from teaching people to distrust the filters.
 */
// Two genuinely different pictures. A rescale of one would be folded in as a
// near-duplicate (FR-22) and hidden from search, which is right, and not the point here.
const img = (seed = 1) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="hsl(${seed * 90},45%,60%)"/><rect x="${seed * 60}" y="${seed * 35}" width="150" height="90" fill="#123"/><circle cx="${250 - seed * 70}" cy="${seed * 80}" r="40" fill="#fff" opacity=".7"/></svg>`)).jpeg().toBuffer();
const ai = (facets: TagResult["facets"]): TagResult => ({ caption: "x", facets, unmatched: [] });

let user: { id: string };
let itemId: string;
let kitchenId: string;

beforeAll(async () => {
  await migrate({ quiet: true });
  const d = await db();
  const f = await d.one<{ id: string }>(`INSERT INTO taxonomy_facets (key, label) VALUES ('space','Space') ON CONFLICT (key) DO UPDATE SET label = excluded.label RETURNING id`);
  kitchenId = (await d.one<{ id: string }>(`INSERT INTO taxonomy_terms (facet_id, slug, label) VALUES ($1, 'kitchen', 'Kitchen') ON CONFLICT (facet_id, slug) DO UPDATE SET label = excluded.label RETURNING id`, [f!.id]))!.id;
  user = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
  itemId = (await ingestBuffer(await img(), { userId: user.id, filename: "g.jpg", source: { kind: "upload" } })).itemId;
});

afterAll(async () => { await (await db()).close(); });

describe("the eval gate", () => {
  it("with no gate passed, a confident tag is only a suggestion and does not filter", async () => {
    await applyTags(itemId, ai({ space: [{ term: "kitchen", confidence: 0.97 }] }), "model-ungated");
    const d = await db();
    const row = await d.one<{ suggested: boolean }>(`SELECT suggested FROM item_terms WHERE item_id = $1 AND term_id = $2`, [itemId, kitchenId]);
    expect(row!.suggested).toBe(true);
    expect((await search({ facets: { space: ["kitchen"] } })).total).toBe(0);
    expect((await search({ reviewOnly: true })).items.map((i) => i.id)).toContain(itemId);
    expect((await facetCounts({})).find((f) => f.key === "space")!.terms.find((t) => t.slug === "kitchen")!.count).toBe(0);
  });

  it("a person accepting a suggestion makes it a human tag that filters", async () => {
    await setHumanTag(itemId, kitchenId, "add", user.id);
    const d = await db();
    const row = await d.one<{ suggested: boolean; source: string }>(`SELECT suggested, source::text AS source FROM item_terms WHERE item_id = $1 AND term_id = $2`, [itemId, kitchenId]);
    expect(row).toMatchObject({ suggested: false, source: "human" });
    expect((await search({ facets: { space: ["kitchen"] } })).total).toBe(1);
  });

  it("once the gate records a pass for that model and facet, tags are applied", async () => {
    const d = await db();
    const other = (await ingestBuffer(await img(2), { userId: user.id, filename: "g2.jpg", source: { kind: "upload" } })).itemId;
    await d.query(`INSERT INTO facet_gates (facet_key, model, passed, precision_, recall, threshold, samples) VALUES ('space', 'model-gated', true, 0.9, 0.8, 0.85, 40)`);
    await applyTags(other, ai({ space: [{ term: "kitchen", confidence: 0.8 }] }), "model-gated");
    const row = await d.one<{ suggested: boolean }>(`SELECT suggested FROM item_terms WHERE item_id = $1 AND term_id = $2`, [other, kitchenId]);
    expect(row!.suggested).toBe(false);
    expect((await search({ facets: { space: ["kitchen"] } })).total).toBe(2);
  });

  it("the owner may apply a model's tags without the gate; suggestions it already made become applied, human rows stay", async () => {
    const d = await db();
    const third = (await ingestBuffer(await img(3), { userId: user.id, filename: "g3.jpg", source: { kind: "upload" } })).itemId;
    await applyTags(third, ai({ space: [{ term: "kitchen", confidence: 0.9 }] }), "model-trusted");
    expect((await d.one<{ suggested: boolean }>(`SELECT suggested FROM item_terms WHERE item_id = $1`, [third]))!.suggested).toBe(true);

    const flipped = await trustModel("model-trusted", user.id);
    expect(flipped).toBe(1);
    expect((await d.one<{ suggested: boolean }>(`SELECT suggested FROM item_terms WHERE item_id = $1`, [third]))!.suggested).toBe(false);
    expect((await passedFacets("model-trusted")).has("*")).toBe(true);
    // The first picture's tag was made human earlier; untouched.
    expect((await d.one<{ source: string }>(`SELECT source::text AS source FROM item_terms WHERE item_id = $1`, [itemId]))!.source).toBe("human");
    // And the next run by that model applies straight away.
    const fourth = (await ingestBuffer(await img(4), { userId: user.id, filename: "g4.jpg", source: { kind: "upload" } })).itemId;
    await applyTags(fourth, ai({ space: [{ term: "kitchen", confidence: 0.7 }] }), "model-trusted");
    expect((await d.one<{ suggested: boolean }>(`SELECT suggested FROM item_terms WHERE item_id = $1`, [fourth]))!.suggested).toBe(false);
  });
});


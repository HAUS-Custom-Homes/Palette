import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenTerm, resolveOpenTermIds } from "@/ai/apply-tags";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { upsertUser } from "@/lib/users";

/**
 * The haus arrives as a slug from every capture surface (dropdown, extension,
 * Shortcut) and as an id from inside the app. Found the hard way: the first
 * extension-style upload failed with "invalid input syntax for type uuid".
 */
let owner: { id: string };

beforeAll(async () => {
  await migrate({ quiet: true });
  const d = await db();
  await d.query(
    `INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged) VALUES ('project','Haus',true,true,false) ON CONFLICT (key) DO NOTHING`,
  );
  await d.query(
    `INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged) VALUES ('material','Material',true,false,true) ON CONFLICT (key) DO NOTHING`,
  );
  owner = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
});

afterAll(async () => { await (await db()).close(); });

describe("resolving a haus by slug or id", () => {
  it("accepts slugs, labels, ids, ignores unknowns and duplicates", async () => {
    const { termId } = await createOpenTerm("project", "Hurst", owner.id);
    const ids = await resolveOpenTermIds("project", ["hurst", "Hurst", termId, "no-such-haus", " "]);
    expect(ids).toEqual([termId]);
  });

  it("never resolves a closed facet this way", async () => {
    const d = await db();
    const f = await d.one<{ id: string }>(`SELECT id FROM taxonomy_facets WHERE key = 'material'`);
    await d.query(`INSERT INTO taxonomy_terms (facet_id, slug, label) VALUES ($1, 'walnut', 'Walnut') ON CONFLICT DO NOTHING`, [f!.id]);
    expect(await resolveOpenTermIds("material", ["walnut"])).toEqual([]);
  });
});

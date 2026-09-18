import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyTags, createOpenTerm, setHumanTag } from "@/ai/apply-tags";
import type { TagResult } from "@/ai/tag-schema";
import { buildTagSchema, loadTaxonomy, renderTaxonomyPrompt } from "@/ai/tag-schema";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { runTagQueue } from "@/ingest/tag-worker";
import { createDeviceToken, resolveDeviceToken, revokeDeviceToken, upsertUser } from "@/lib/users";
import { facetCounts, quarantined, search, stats } from "@/search/query";
import { SEED_FACETS } from "@/taxonomy/seed-data";

/**
 * These tests make the PRD's promises falsifiable. Each one names the
 * requirement it defends, so a change that breaks a promise fails here with
 * the requirement id attached rather than being discovered in a year by a
 * designer whose corrections silently disappeared.
 *
 * They run against PGlite in memory: real Postgres, real triggers, no Docker.
 */

function panel(seed: number, size = 600) {
  let h = (seed * 2654435761) >>> 0;
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const shapes = Array.from({ length: 7 }, () => {
    const x = Math.round(rand() * size * 0.85), y = Math.round(rand() * size * 0.85);
    const w = Math.round(size * (0.15 + rand() * 0.45)), hh = Math.round(size * (0.15 + rand() * 0.45));
    const g = Math.round(rand() * 255);
    return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="rgb(${g},${g},${g})" opacity="0.8"/>`;
  }).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="hsl(${(seed * 37) % 360},40%,70%)"/>${shapes}</svg>`)).jpeg({ quality: 90 }).toBuffer();
}

async function seedTaxonomy() {
  const d = await db();
  for (const [i, f] of SEED_FACETS.entries()) {
    const row = await d.one<{ id: string }>(
      `INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged, guidance, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (key) DO UPDATE SET label = excluded.label RETURNING id`,
      [f.key, f.label, f.isMulti, f.isOpen ?? false, f.aiTagged ?? true, f.guidance, i],
    );
    for (const [j, t] of f.terms.entries()) {
      await d.query(
        `INSERT INTO taxonomy_terms (facet_id, slug, label, synonyms, sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [row!.id, t.slug, t.label, t.synonyms ?? [], j],
      );
    }
  }
}

async function termId(facetKey: string, slug: string) {
  const d = await db();
  const r = await d.one<{ id: string }>(
    `SELECT t.id FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id WHERE f.key = $1 AND t.slug = $2`,
    [facetKey, slug],
  );
  return r!.id;
}

const ai = (facets: TagResult["facets"]): TagResult => ({ caption: "a test image", facets, unmatched: [] });

let trevor: { id: string; role: string };
let designer: { id: string; role: string };

beforeAll(async () => {
  await migrate({ quiet: true });
  await seedTaxonomy();
  trevor = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
  designer = await upsertUser({ email: "designer@hauscustomhomes.com", name: "Designer" });
});

afterAll(async () => { await (await db()).close(); });

describe("people", () => {
  it("the first person to sign in is owner; everyone after is editor", () => {
    expect(trevor.role).toBe("owner");
    expect(designer.role).toBe("editor");
  });

  it("FR-7 a device token resolves to its person, and stops after revocation", async () => {
    const { id, token } = await createDeviceToken(trevor.id, "Trevor iPhone");
    expect(token.startsWith("plt_")).toBe(true);
    expect((await resolveDeviceToken(token))?.id).toBe(trevor.id);
    expect(await resolveDeviceToken("plt_not_a_real_token")).toBeNull();
    await revokeDeviceToken(id, trevor.id);
    expect(await resolveDeviceToken(token)).toBeNull();
  });
});

describe("FR-11 permanence", () => {
  it("stores bytes under their own sha256 and the database refuses to let the identity change", async () => {
    const res = await ingestBuffer(await panel(1), { userId: trevor.id, filename: "a.jpg", source: { kind: "upload" } });
    const d = await db();
    const asset = await d.one<{ sha256: string; storage_key: string }>(`SELECT sha256, storage_key FROM assets WHERE id = $1`, [res.assetId]);
    expect(asset!.sha256).toBe(res.sha256);
    expect(asset!.storage_key).toContain(res.sha256);
    await expect(d.query(`UPDATE assets SET sha256 = $1 WHERE id = $2`, ["0".repeat(64), res.assetId])).rejects.toThrow(/FR-11/);
  });
});

describe("FR-21 exact deduplication", () => {
  it("collapses byte-identical images into one asset with two provenance records", async () => {
    const buf = await panel(2);
    const first = await ingestBuffer(buf, { userId: trevor.id, filename: "pin.jpg", source: { kind: "pinterest", externalId: "pin-123" } });
    const second = await ingestBuffer(buf, { userId: designer.id, filename: "same.jpg", source: { kind: "instagram", externalId: "ig-456" } });
    expect(second.duplicate).toBe(true);
    expect(second.itemId).toBe(first.itemId);
    const d = await db();
    const kinds = await d.query<{ kind: string }>(`SELECT kind::text AS kind FROM sources WHERE item_id = $1 ORDER BY 1`, [first.itemId]);
    expect(kinds.map((k) => k.kind)).toEqual(["instagram", "pinterest"]);
  });
});

describe("FR-22 near-duplicate clustering", () => {
  it("clusters a rescaled recompressed copy and leaves unrelated images alone", async () => {
    const original = await panel(3, 1200);
    const rescaled = await sharp(original).resize(500).jpeg({ quality: 55 }).toBuffer();
    const a = await ingestBuffer(original, { userId: trevor.id, filename: "o.jpg", source: { kind: "upload" } });
    const b = await ingestBuffer(rescaled, { userId: trevor.id, filename: "small.jpg", source: { kind: "upload" } });
    const c = await ingestBuffer(await panel(99, 1200), { userId: trevor.id, filename: "other.jpg", source: { kind: "upload" } });
    expect(b.duplicate).toBe(false);
    expect(b.variantOf).toBe(a.itemId);
    expect(c.variantOf).toBeUndefined();
  });
});

describe("FR-19 human corrections are permanent", () => {
  it("a re-tagging run cannot overwrite, delete, or reinstate against a human", async () => {
    const { itemId } = await ingestBuffer(await panel(4), { userId: trevor.id, filename: "k.jpg", source: { kind: "upload" } });
    const plaster = await termId("material", "plaster");
    const limewash = await termId("material", "limewash");
    const kitchen = await termId("space", "kitchen");

    await applyTags(itemId, ai({ material: [{ term: "plaster", confidence: 0.82 }], space: [{ term: "kitchen", confidence: 0.91 }] }), "model-v1");
    await setHumanTag(itemId, plaster, "remove", designer.id);
    await setHumanTag(itemId, limewash, "add", designer.id);
    await applyTags(itemId, ai({ material: [{ term: "plaster", confidence: 0.99 }], space: [{ term: "kitchen", confidence: 0.95 }] }), "model-v2");

    const d = await db();
    const rows = await d.query<{ term_id: string; source: string; rejected: boolean; set_by: string | null; model_version: string | null }>(
      `SELECT term_id, source::text AS source, rejected, set_by, model_version FROM item_terms WHERE item_id = $1`, [itemId],
    );
    const by = new Map(rows.map((r) => [r.term_id, r]));
    expect(by.get(plaster)).toMatchObject({ source: "human", rejected: true, set_by: designer.id, model_version: null });
    expect(by.get(limewash)).toMatchObject({ source: "human", rejected: false, set_by: designer.id });
    expect(by.get(kitchen)).toMatchObject({ source: "ai" });
  });

  it("the database refuses an AI write over a human row even if code forgets", async () => {
    const d = await db();
    const itemId = (await d.one<{ id: string }>(`SELECT id FROM items LIMIT 1`))!.id;
    const term = await termId("style", "belgian");
    await d.query(`INSERT INTO item_terms (item_id, term_id, confidence, source) VALUES ($1, $2, 1.0, 'human') ON CONFLICT DO NOTHING`, [itemId, term]);
    await expect(d.query(`UPDATE item_terms SET source = 'ai' WHERE item_id = $1 AND term_id = $2`, [itemId, term])).rejects.toThrow(/FR-19/);
    await expect(d.query(`DELETE FROM item_terms WHERE item_id = $1 AND term_id = $2`, [itemId, term])).rejects.toThrow(/FR-19/);
  });
});

describe("FR-16 closed and open facets", () => {
  it("drops a tag whose slug is not in the taxonomy rather than inventing a term", async () => {
    const { itemId } = await ingestBuffer(await panel(5), { userId: trevor.id, filename: "v.jpg", source: { kind: "upload" } });
    await applyTags(itemId, ai({ material: [{ term: "walnut", confidence: 0.9 }, { term: "reclaimed-barnwood", confidence: 0.95 }] }), "m");
    const d = await db();
    const slugs = (await d.query<{ slug: string }>(`SELECT t.slug FROM item_terms it JOIN taxonomy_terms t ON t.id = it.term_id WHERE it.item_id = $1`, [itemId])).map((r) => r.slug);
    expect(slugs).toContain("walnut");
    expect(slugs).not.toContain("reclaimed-barnwood");
  });

  it("routes an unmatched concept into the proposal queue instead of dropping it", async () => {
    const { itemId } = await ingestBuffer(await panel(6), { userId: trevor.id, filename: "p.jpg", source: { kind: "upload" } });
    await applyTags(itemId, { caption: "x", facets: {}, unmatched: [{ facet: "material", label: "tadelakt" }] }, "m");
    const d = await db();
    expect(await d.one(`SELECT status FROM proposed_terms WHERE raw_label = 'tadelakt'`)).toMatchObject({ status: "pending" });
  });

  it("an editor can create a haus directly, a closed facet refuses, and the model never sees the haus facet", async () => {
    const { termId: hurst, created } = await createOpenTerm("project", "Hurst", designer.id);
    expect(created).toBe(true);
    expect((await createOpenTerm("project", "hurst", trevor.id)).created).toBe(false); // same slug
    await expect(createOpenTerm("material", "tadelakt", trevor.id)).rejects.toThrow(/closed/);

    const tax = await loadTaxonomy();
    expect(renderTaxonomyPrompt(tax)).not.toContain("project");
    expect(Object.keys(buildTagSchema(tax).shape)).not.toContain("project");

    // And applyTags ignores a model that tries to answer it anyway.
    const { itemId } = await ingestBuffer(await panel(7), { userId: trevor.id, filename: "h.jpg", source: { kind: "upload" } });
    await applyTags(itemId, ai({ project: [{ term: "hurst", confidence: 0.99 }] }), "m");
    const d = await db();
    expect(await d.one(`SELECT 1 AS x FROM item_terms WHERE item_id = $1 AND term_id = $2`, [itemId, hurst])).toBeNull();
  });

  it("a haus tag applied at ingest is a human tag and filters the library", async () => {
    const { termId: antoon } = await createOpenTerm("project", "Antoon", trevor.id);
    const { itemId } = await ingestBuffer(await panel(8), { userId: trevor.id, filename: "an.jpg", termIds: [antoon], source: { kind: "share" } });
    const res = await search({ facets: { project: ["antoon"] } });
    expect(res.items.map((i) => i.id)).toEqual([itemId]);
    const counts = await facetCounts({});
    const haus = counts.find((c) => c.key === "project")!;
    expect(haus.isOpen).toBe(true);
    expect(haus.terms.find((t) => t.slug === "antoon")?.count).toBe(1);
  });
});

describe("FR-26, FR-27 search and facets", () => {
  it("finds an item by a tag synonym it was never literally labelled with", async () => {
    const { itemId } = await ingestBuffer(await panel(9), { userId: trevor.id, filename: "bath.jpg", source: { kind: "upload" } });
    await applyTags(itemId, ai({ space: [{ term: "primary-bath", confidence: 0.9 }] }), "m");
    expect((await search({ q: "master bath" })).items.map((i) => i.id)).toContain(itemId);
  });

  it("counts facets against the active filter, so the rail cannot lie", async () => {
    const counts = await facetCounts({ facets: { space: ["primary-bath"] } });
    expect(counts.find((c) => c.key === "material")!.terms.find((t) => t.slug === "walnut")!.count).toBe(0);
    expect(counts.find((c) => c.key === "space")!.terms.some((t) => t.count > 0 && t.slug !== "primary-bath")).toBe(true);
  });

  it("the Mine filter shows only what that person saved", async () => {
    const mine = await search({ ownerId: designer.id });
    expect(mine.items.length).toBe(0); // the designer has only corrected, never saved
    const his = await search({ ownerId: trevor.id });
    expect(his.total).toBeGreaterThan(3);
  });
});

describe("FR-5 the tag queue and per-user quarantine", () => {
  it("a job that keeps failing is quarantined and lands on its owner's list, not anyone else's", async () => {
    const { itemId } = await ingestBuffer(await panel(10), { userId: designer.id, filename: "q.jpg", source: { kind: "upload" } });
    const d = await db();
    // Sabotage: point the job at an item whose derivative does not exist.
    await d.query(`UPDATE ingest_jobs SET payload = $1 WHERE dedupe_key = $2`, [JSON.stringify({ itemId: "00000000-0000-0000-0000-000000000000" }), `tag:${itemId}`]);
    await d.query(`UPDATE items SET id = id WHERE id = $1`, [itemId]);
    for (let i = 0; i < 3; i++) await runTagQueue(50);
    const job = await d.one<{ state: string; attempts: number }>(`SELECT state::text AS state, attempts FROM ingest_jobs WHERE dedupe_key = $1`, [`tag:${itemId}`]);
    expect(job).toMatchObject({ state: "quarantined", attempts: 3 });

    // Repoint so the quarantine view can join it back to its owner.
    await d.query(`UPDATE ingest_jobs SET payload = $1 WHERE dedupe_key = $2`, [JSON.stringify({ itemId }), `tag:${itemId}`]);
    expect((await quarantined(designer.id)).map((q) => q.id)).toContain(itemId);
    expect((await quarantined(trevor.id)).map((q) => q.id)).not.toContain(itemId);
    expect((await stats(designer.id)).myQuarantined).toBe(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyTags, createOpenTerm } from "@/ai/apply-tags";
import { buildTagSchema, loadTaxonomy, type TagResult } from "@/ai/tag-schema";
import { getBoard, listBoards } from "@/boards/boards";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { upsertUser } from "@/lib/users";
import { search } from "@/search/query";

/**
 * FR-24: words printed in an image are searchable. FR-46: every haus has a
 * board that keeps itself current.
 */
const img = (seed: number) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="300"><rect width="100%" height="100%" fill="hsl(${seed * 70},50%,55%)"/><rect x="${seed * 40}" y="${seed * 50}" width="120" height="70" fill="#210"/><circle cx="${280 - seed * 60}" cy="${60 + seed * 50}" r="35" fill="#fff" opacity=".8"/></svg>`)).jpeg().toBuffer();

let user: { id: string };

beforeAll(async () => {
  await migrate({ quiet: true });
  const d = await db();
  await d.query(`INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged) VALUES ('project','Haus',true,true,false) ON CONFLICT (key) DO NOTHING`);
  const f = await d.one<{ id: string }>(`INSERT INTO taxonomy_facets (key, label) VALUES ('space','Space') ON CONFLICT (key) DO UPDATE SET label = excluded.label RETURNING id`);
  await d.query(`INSERT INTO taxonomy_terms (facet_id, slug, label) VALUES ($1, 'kitchen', 'Kitchen') ON CONFLICT (facet_id, slug) DO NOTHING`, [f!.id]);
  user = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
});

afterAll(async () => { await (await db()).close(); });

describe("text read off an image (FR-24)", () => {
  it("is part of what the model is asked for", async () => {
    const schema = buildTagSchema(await loadTaxonomy());
    expect(schema.safeParse({ caption: "c", visible_text: "HC-154 Hale Navy", space: [], unmatched_suggestions: [] }).success).toBe(true);
    expect(schema.safeParse({ caption: "c", space: [], unmatched_suggestions: [] }).success).toBe(false);
  });

  it("makes the item findable by those words, and a blind re-tag does not erase them", async () => {
    const { itemId } = await ingestBuffer(await img(1), { userId: user.id, filename: "swatch.jpg", source: { kind: "upload" } });
    const read: TagResult = { caption: "A paint swatch card.", visibleText: "Benjamin Moore | HC-154 Hale Navy", facets: {}, unmatched: [] };
    await applyTags(itemId, read, "m1");

    const hit = await search({ q: "hale navy" });
    expect(hit.items.map((i) => i.id)).toContain(itemId);

    await applyTags(itemId, { caption: "A card.", facets: {}, unmatched: [] }, "heuristic-v1");
    const still = await search({ q: "HC-154" });
    expect(still.items.map((i) => i.id)).toContain(itemId);
  });
});

describe("a board per haus (FR-46)", () => {
  it("appears when the haus is named, once, and fills itself", async () => {
    const { termId, created } = await createOpenTerm("project", "Antoon", user.id);
    expect(created).toBe(true);
    await createOpenTerm("project", "antoon", user.id);

    const boards = (await listBoards(user.id)).filter((b) => b.name === "Antoon haus");
    expect(boards).toHaveLength(1);
    expect(boards[0].isSmart).toBe(true);

    const { itemId } = await ingestBuffer(await img(2), { userId: user.id, filename: "antoon.jpg", source: { kind: "upload" }, termIds: [termId] });
    const board = await getBoard(boards[0].id, user.id);
    expect(board?.items.map((i) => i.id)).toEqual([itemId]);

    // And the boards list tells the truth about it: a count and a cover.
    const listed = (await listBoards(user.id)).find((b) => b.id === boards[0].id)!;
    expect(listed.count).toBe(1);
    expect(listed.coverSha).toBeTruthy();
  });

  it("does not double the word when the label already says haus", async () => {
    await createOpenTerm("project", "The Hurst Haus", user.id);
    const names = (await listBoards(user.id)).map((b) => b.name);
    expect(names).toContain("The Hurst Haus");
    expect(names).not.toContain("The Hurst Haus haus");
  });
});

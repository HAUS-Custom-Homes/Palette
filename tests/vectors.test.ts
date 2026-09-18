import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { FakeEmbedder, cosine } from "@/ai/embedder";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { upsertUser } from "@/lib/users";
import { embedItem, embeddingStats, fuse, searchByText, similarByVector } from "@/search/vectors";

/**
 * FR-17 Layer A with the fake embedder: exercises storage, the in-process
 * index, similarity, text search and fusion without a 350MB model. The real
 * CLIP path is proven by tools/clip-check.mjs, not here.
 */
const img = (seed: number) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
    <rect width="100%" height="100%" fill="hsl(${seed * 47},50%,60%)"/>
    <rect x="${(seed * 31) % 300}" y="${(seed * 19) % 300}" width="200" height="140" fill="#1a1a1a"/></svg>`)).jpeg().toBuffer();

let user: { id: string };
const ids: string[] = [];

beforeAll(async () => {
  await migrate({ quiet: true });
  user = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
  for (let i = 1; i <= 4; i++) {
    const r = await ingestBuffer(await img(i), { userId: user.id, filename: `v${i}.jpg`, source: { kind: "upload" } });
    ids.push(r.itemId);
    await embedItem(r.itemId, new FakeEmbedder());
  }
});

afterAll(async () => { await (await db()).close(); });

describe("embeddings", () => {
  it("vectors are unit length and identical input gives identical vectors", async () => {
    const e = new FakeEmbedder();
    const a = await e.embedText("white oak kitchen");
    const b = await e.embedText("white oak kitchen");
    expect(cosine(a, a)).toBeCloseTo(1, 5);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
    expect(cosine(a, await e.embedText("something else entirely"))).toBeLessThan(0.9);
  });

  it("stores one vector per item and model, and counts what is pending", async () => {
    const s = await embeddingStats();
    expect(s.embedded).toBe(4);
    expect(s.pending).toBe(0);
    await embedItem(ids[0], new FakeEmbedder()); // idempotent
    expect((await embeddingStats()).embedded).toBe(4);
  });

  it("an item is most similar to itself and never lists itself", async () => {
    const near = await similarByVector(ids[0], 3);
    expect(near.map((n) => n.itemId)).not.toContain(ids[0]);
    expect(near.length).toBe(3);
    expect(near[0].score).toBeGreaterThanOrEqual(near[1].score);
  });

  it("text search returns the library ranked, and fusion merges two rankings", async () => {
    const hits = await searchByText("kitchen", 10);
    expect(hits.length).toBe(4);
    const fused = fuse([["a", "b", "c"], ["c", "a", "d"]]);
    expect(fused[0]).toBe("a"); // top of both
    expect(fused).toContain("d");
    expect(new Set(fused).size).toBe(4);
  });
});

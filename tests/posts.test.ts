import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer, slideExternalId } from "@/ingest/ingest";
import { upsertUser } from "@/lib/users";
import { postFor, search } from "@/search/query";

/**
 * A post is not an image. Every slide of a multi-image post, and every frame
 * taken from a video, is its own item with its own tags, and all of them keep
 * a way back to the post and to each other.
 */
const img = (seed: number) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="340" height="300"><rect width="100%" height="100%" fill="hsl(${seed * 47},55%,${35 + seed * 5}%)"/><rect x="${seed * 31 % 200}" y="${seed * 53 % 180}" width="${60 + seed * 12}" height="${40 + seed * 9}" fill="#1a1a1a"/><circle cx="${300 - seed * 37 % 250}" cy="${40 + seed * 29 % 220}" r="${20 + seed * 4}" fill="#fff" opacity=".85"/></svg>`)).jpeg().toBuffer();

let user: { id: string };

beforeAll(async () => {
  await migrate({ quiet: true });
  user = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
});

afterAll(async () => { await (await db()).close(); });

describe("external ids", () => {
  it("are per slide and per frame, and unchanged when no post is named", () => {
    expect(slideExternalId({ kind: "instagram", postId: "ig:ABC", slideIndex: 3 })).toBe("ig:ABC#3");
    expect(slideExternalId({ kind: "instagram", postId: "ig:ABC", mediaKind: "video_frame", frameTimeS: 14.23 })).toBe("ig:ABC@14.2");
    expect(slideExternalId({ kind: "upload", externalId: "upload:a.jpg:10" })).toBe("upload:a.jpg:10");
  });
});

describe("a multi-image post", () => {
  it("keeps provenance for every slide, which the old one-row-per-post rule lost", async () => {
    const post = { kind: "instagram" as const, postId: "ig:CAROUSEL", sourceUrl: "https://www.instagram.com/p/CAROUSEL/", authorHandle: "studio" };
    const a = await ingestBuffer(await img(1), { userId: user.id, filename: "1.jpg", source: { ...post, slideIndex: 1, slideCount: 8 } });
    const c = await ingestBuffer(await img(3), { userId: user.id, filename: "3.jpg", source: { ...post, slideIndex: 3, slideCount: 8 } });
    expect(a.itemId).not.toBe(c.itemId);

    const info = await postFor(c.itemId);
    expect(info?.slideIndex).toBe(3);
    expect(info?.slideCount).toBe(8);
    expect(info?.authorHandle).toBe("studio");
    expect(info?.siblings.map((s) => s.id)).toEqual([a.itemId, c.itemId]);
  });

  it("saving the same slide twice adds nothing", async () => {
    const before = (await postFor((await search({ limit: 1 })).items[0].id));
    await ingestBuffer(await img(3), { userId: user.id, filename: "3-again.jpg", source: { kind: "instagram", postId: "ig:CAROUSEL", slideIndex: 3, slideCount: 8 } });
    const rows = await (await db()).query(`SELECT 1 FROM sources WHERE post_id = 'ig:CAROUSEL'`);
    expect(rows).toHaveLength(2);
    expect(before).toBeTruthy();
  });

  it("a cover saved by the list scan learns the slide count when a later save knows it", async () => {
    const cover = await ingestBuffer(await img(5), { userId: user.id, filename: "cover.jpg", source: { kind: "instagram", postId: "ig:LATER", slideIndex: 1 } });
    expect((await postFor(cover.itemId))?.slideCount).toBeNull();
    await ingestBuffer(await img(6), { userId: user.id, filename: "two.jpg", source: { kind: "instagram", postId: "ig:LATER", slideIndex: 2, slideCount: 5 } });
    expect((await postFor(cover.itemId))?.slideCount).toBe(5);
  });

  it("tells the grid what to draw: position, how many are saved", async () => {
    const tile = (await search({ limit: 50 })).items.find((i) => i.slideIndex === 3)!;
    expect(tile.slideCount).toBe(8);
    expect(tile.slidesSaved).toBe(2);
    expect(tile.mediaKind).toBe("image");
  });
});

describe("a video post", () => {
  it("holds a cover and any number of frames, in time order, and can be filtered for", async () => {
    const post = { kind: "instagram" as const, postId: "ig:REEL", sourceUrl: "https://www.instagram.com/reel/REEL/" };
    const late = await ingestBuffer(await img(8), { userId: user.id, filename: "f2.jpg", source: { ...post, mediaKind: "video_frame", frameTimeS: 31.5 } });
    const cover = await ingestBuffer(await img(7), { userId: user.id, filename: "cover.jpg", source: { ...post, mediaKind: "video_cover" } });
    const early = await ingestBuffer(await img(9), { userId: user.id, filename: "f1.jpg", source: { ...post, mediaKind: "video_frame", frameTimeS: 14.2 } });

    const info = await postFor(late.itemId);
    expect(info?.mediaKind).toBe("video_frame");
    expect(info?.frameTimeS).toBeCloseTo(31.5);
    expect(info?.siblings.map((s) => s.id)).toEqual([cover.itemId, early.itemId, late.itemId]);

    const videos = await search({ videoOnly: true, limit: 50 });
    expect(videos.items.map((i) => i.id).sort()).toEqual([late.itemId, cover.itemId, early.itemId].sort());
  });
});

describe("near-duplicates inside one post", () => {
  it("are never folded into each other, though the same two images from different posts are", async () => {
    const big = await img(13);
    const small = await sharp(big).resize(200).jpeg().toBuffer();

    const a = await ingestBuffer(big, { userId: user.id, filename: "a.jpg", source: { kind: "instagram", postId: "ig:SAME", slideIndex: 1, slideCount: 2 } });
    const b = await ingestBuffer(small, { userId: user.id, filename: "b.jpg", source: { kind: "instagram", postId: "ig:SAME", slideIndex: 2, slideCount: 2 } });
    expect(a.variantOf).toBeUndefined();
    expect(b.variantOf).toBeUndefined();

    const smaller = await sharp(big).resize(160).jpeg().toBuffer();
    const c = await ingestBuffer(smaller, { userId: user.id, filename: "c.jpg", source: { kind: "instagram", postId: "ig:OTHER", slideIndex: 1 } });
    expect(c.variantOf).toBeTruthy();
  });
});

describe("the same slide arriving again, bigger", () => {
  it("takes over the small copy's place, its haus and its board spot, and hides the small one", async () => {
    const d = await db();
    await d.query(`INSERT INTO taxonomy_facets (key, label, is_multi, is_open, ai_tagged) VALUES ('project','Haus',true,true,false) ON CONFLICT (key) DO NOTHING`);
    const { createOpenTerm } = await import("@/ai/apply-tags");
    const { addToBoard, createBoard, getBoard } = await import("@/boards/boards");
    const { termId } = await createOpenTerm("project", "Upgrade", user.id);

    const full = await img(15);
    const cover = await sharp(full).resize(170).jpeg().toBuffer();
    const post = { kind: "instagram" as const, postId: "ig:UPGRADE", slideIndex: 1 };

    const small = await ingestBuffer(cover, { userId: user.id, filename: "cover.jpg", source: post, termIds: [termId] });
    const board = await createBoard(user.id, "Upgrade board");
    await addToBoard(board, small.itemId, user.id);

    const big = await ingestBuffer(full, { userId: user.id, filename: "full.jpg", source: { ...post, slideCount: 4 } });
    expect(big.itemId).not.toBe(small.itemId);

    const visible = (await search({ limit: 100 })).items.map((i) => i.id);
    expect(visible).toContain(big.itemId);
    expect(visible).not.toContain(small.itemId);

    expect((await postFor(big.itemId))?.siblings.map((s) => s.id)).toEqual([big.itemId]);
    const human = await d.query(`SELECT 1 FROM item_terms WHERE item_id = $1 AND term_id = $2 AND source = 'human'`, [big.itemId, termId]);
    expect(human).toHaveLength(1);
    expect((await getBoard(board, user.id))?.items.map((i) => i.id)).toEqual([big.itemId]);
  });
});

describe("an old database", () => {
  it("treats a pre-existing external id as the post id", async () => {
    const d = await db();
    const legacy = await ingestBuffer(await img(11), { userId: user.id, filename: "old.jpg", source: { kind: "pinterest", externalId: "pin:12345" } });
    // New saves get it at write time.
    expect((await postFor(legacy.itemId))?.postId).toBe("pin:12345");

    // Rows written before the column existed get it from the statement the
    // migration runs on every boot. Same SQL, run here against a blanked row.
    await d.query(`UPDATE sources SET post_id = NULL WHERE external_id = 'pin:12345'`);
    expect(await postFor(legacy.itemId)).toBeNull();
    await d.query(`UPDATE sources SET post_id = external_id WHERE post_id IS NULL AND external_id IS NOT NULL AND kind IN ('instagram', 'pinterest')`);
    expect((await postFor(legacy.itemId))?.postId).toBe("pin:12345");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  addToBoard, boardsForItem, createBoard, feedbackForBoard, getBoard, getSharedBoard, listBoards, moveOnBoard,
  recordFeedback, removeFromBoard, setBoardCover, setBoardPrivacy, shareBoard, tokenCoversAsset, unshareBoard,
} from "@/boards/boards";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { upsertUser } from "@/lib/users";

/** REF-01 FR-34. Boards are team-visible by default and private on request. */

const img = (seed: number) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="100%" height="100%" fill="hsl(${seed * 53},50%,60%)"/>
    <rect x="${seed * 17}" y="${seed * 29}" width="180" height="120" fill="#222"/></svg>`)).jpeg().toBuffer();

let trevor: { id: string };
let designer: { id: string };
let itemA: string;
let itemB: string;

beforeAll(async () => {
  await migrate({ quiet: true });
  trevor = await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" });
  designer = await upsertUser({ email: "designer@hauscustomhomes.com", name: "Designer" });
  itemA = (await ingestBuffer(await img(1), { userId: trevor.id, filename: "a.jpg", source: { kind: "upload" } })).itemId;
  itemB = (await ingestBuffer(await img(2), { userId: designer.id, filename: "b.jpg", source: { kind: "upload" } })).itemId;
});

afterAll(async () => { await (await db()).close(); });

describe("boards", () => {
  it("a board holds items in order, and the item page knows where it is", async () => {
    const id = await createBoard(trevor.id, "Hurst primary bath", "Thursday");
    await addToBoard(id, itemA, trevor.id);
    await addToBoard(id, itemB, trevor.id);
    await addToBoard(id, itemA, trevor.id); // twice is once

    const b = await getBoard(id, trevor.id);
    expect(b!.items.map((i) => i.id)).toEqual([itemA, itemB]);
    expect((await boardsForItem(itemA, designer.id)).on.map((x) => x.id)).toContain(id);

    await removeFromBoard(id, itemA, trevor.id);
    expect((await getBoard(id, trevor.id))!.items.map((i) => i.id)).toEqual([itemB]);
  });

  it("is visible to the team unless private, and only its owner can flip that", async () => {
    const id = await createBoard(designer.id, "Designer's scratch");
    expect((await listBoards(trevor.id)).some((b) => b.id === id)).toBe(true);

    await setBoardPrivacy(id, trevor.id, true); // not the owner: no effect
    expect((await listBoards(trevor.id)).some((b) => b.id === id)).toBe(true);

    await setBoardPrivacy(id, designer.id, true);
    expect((await listBoards(trevor.id)).some((b) => b.id === id)).toBe(false);
    expect((await listBoards(designer.id)).some((b) => b.id === id)).toBe(true);
    expect(await getBoard(id, trevor.id)).toBeNull();
  });

  it("reorders by nudging and picks a cover only from its own items", async () => {
    const id = await createBoard(trevor.id, "Ordered");
    await addToBoard(id, itemA, trevor.id);
    await addToBoard(id, itemB, trevor.id);
    await moveOnBoard(id, itemB, "up");
    expect((await getBoard(id, trevor.id))!.items.map((i) => i.id)).toEqual([itemB, itemA]);
    await moveOnBoard(id, itemB, "up"); // already first: no-op
    expect((await getBoard(id, trevor.id))!.items.map((i) => i.id)).toEqual([itemB, itemA]);

    await setBoardCover(id, itemA, trevor.id);
    expect((await listBoards(trevor.id)).find((b) => b.id === id)!.coverSha).toBeTruthy();
    await setBoardCover(id, itemA, designer.id); // not the owner: ignored, no throw
  });

  it("FR-35 a share link is read-only, scoped to its board's images, records likes, and dies on expiry", async () => {
    const id = await createBoard(trevor.id, "Client review");
    await addToBoard(id, itemA, trevor.id);
    const token = (await shareBoard(id, trevor.id, 30))!;
    expect(token.length).toBeGreaterThan(16);
    expect(await shareBoard(id, designer.id, 30)).toBeNull(); // not the owner

    const shared = await getSharedBoard(token);
    expect(shared!.items.map((i) => i.id)).toEqual([itemA]);
    expect(await getSharedBoard("not-a-real-token-at-all")).toBeNull();

    const d = await db();
    const shaA = (await d.one<{ sha256: string }>(`SELECT a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = $1`, [itemA]))!.sha256;
    const shaB = (await d.one<{ sha256: string }>(`SELECT a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = $1`, [itemB]))!.sha256;
    expect(await tokenCoversAsset(token, shaA)).toBe(true);
    expect(await tokenCoversAsset(token, shaB)).toBe(false); // not on this board

    expect(await recordFeedback(token, itemA, "Sarah", "like")).toBe(true);
    expect(await recordFeedback(token, itemB, "Sarah", "like")).toBe(false); // not on this board
    expect(await recordFeedback(token, itemA, "Sarah", "like")).toBe(true); // idempotent per viewer
    expect((await feedbackForBoard(id)).filter((f) => f.sentiment === "like").length).toBe(1);
    expect((await getSharedBoard(token))!.items[0].likes).toBe(1);

    await d.query(`UPDATE boards SET share_expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect(await getSharedBoard(token)).toBeNull();
    expect(await tokenCoversAsset(token, shaA)).toBe(false);

    await unshareBoard(id, trevor.id);
    expect((await getBoard(id, trevor.id))!.shareToken).toBeNull();
  });

  it("refuses a nonsense name", async () => {
    await expect(createBoard(trevor.id, " ")).rejects.toThrow(/at least 2/);
  });
});

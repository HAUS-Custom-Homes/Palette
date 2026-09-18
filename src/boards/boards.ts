import { db } from "@/db/client";

/**
 * REF-01 FR-34. Boards are curated sets: "Hurst, primary bath, eight options
 * for Thursday". An item can be on many. A board is visible to the whole
 * team unless its owner marks it private, because the library is a company
 * asset and a board is usually the thing you are about to show someone.
 */

export type BoardRow = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isPrivate: boolean;
  count: number;
  coverSha: string | null;
  createdAt: string;
};

export async function listBoards(userId: string): Promise<BoardRow[]> {
  const d = await db();
  return d.query<BoardRow>(
    `SELECT b.id, b.name, b.description, b.owner_id AS "ownerId", u.name AS "ownerName",
            b.is_private AS "isPrivate", b.created_at::text AS "createdAt",
            (SELECT count(*)::int FROM board_items bi JOIN items i ON i.id = bi.item_id
              WHERE bi.board_id = b.id AND i.deleted_at IS NULL) AS count,
            (SELECT a.sha256 FROM board_items bi
               JOIN items i ON i.id = bi.item_id JOIN assets a ON a.id = i.asset_id
              WHERE bi.board_id = b.id AND i.deleted_at IS NULL
              ORDER BY (i.id = b.cover_item_id) DESC, bi.position, bi.item_id LIMIT 1) AS "coverSha"
       FROM boards b LEFT JOIN users u ON u.id = b.owner_id
      WHERE b.is_private = false OR b.owner_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
}

export async function createBoard(userId: string, name: string, description?: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean.length < 2) throw new Error("board name must be at least 2 characters");
  const d = await db();
  const row = await d.one<{ id: string }>(
    `INSERT INTO boards (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id`,
    [clean, description?.trim() || null, userId],
  );
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'board', $2, 'created')`, [userId, row!.id]);
  return row!.id;
}

export async function getBoard(id: string, userId: string) {
  const d = await db();
  const board = await d.one<BoardRow & { canEdit: boolean }>(
    `SELECT b.id, b.name, b.description, b.owner_id AS "ownerId", u.name AS "ownerName",
            b.is_private AS "isPrivate", b.created_at::text AS "createdAt", 0 AS count, NULL AS "coverSha",
            (b.owner_id = $2 OR b.owner_id IS NULL) AS "canEdit"
       FROM boards b LEFT JOIN users u ON u.id = b.owner_id
      WHERE b.id = $1 AND (b.is_private = false OR b.owner_id = $2)`,
    [id, userId],
  );
  if (!board) return null;

  const items = await d.query<{ id: string; sha256: string; width: number | null; height: number | null; captionAi: string | null; title: string | null; position: number }>(
    `SELECT i.id, a.sha256, a.width, a.height, i.caption_ai AS "captionAi", i.title, bi.position
       FROM board_items bi JOIN items i ON i.id = bi.item_id JOIN assets a ON a.id = i.asset_id
      WHERE bi.board_id = $1 AND i.deleted_at IS NULL
      ORDER BY bi.position, bi.item_id`,
    [id],
  );
  return { ...board, count: items.length, items };
}

export async function addToBoard(boardId: string, itemId: string, userId: string): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO board_items (board_id, item_id, position)
     VALUES ($1, $2, coalesce((SELECT max(position) + 1 FROM board_items WHERE board_id = $1), 0))
     ON CONFLICT DO NOTHING`,
    [boardId, itemId],
  );
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'board', $2, 'item_added', $3)`, [userId, boardId, JSON.stringify({ itemId })]);
}

export async function removeFromBoard(boardId: string, itemId: string, userId: string): Promise<void> {
  const d = await db();
  await d.query(`DELETE FROM board_items WHERE board_id = $1 AND item_id = $2`, [boardId, itemId]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'board', $2, 'item_removed', $3)`, [userId, boardId, JSON.stringify({ itemId })]);
}

/** Nudge one item earlier or later. Positions are renumbered so gaps never accumulate. */
export async function moveOnBoard(boardId: string, itemId: string, direction: "up" | "down"): Promise<void> {
  const d = await db();
  await d.transaction(async (tx) => {
    const rows = await tx.query<{ item_id: string }>(
      `SELECT item_id FROM board_items WHERE board_id = $1 ORDER BY position, item_id FOR UPDATE`,
      [boardId],
    );
    const order = rows.map((r) => r.item_id);
    const i = order.indexOf(itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < order.length; k++) {
      await tx.query(`UPDATE board_items SET position = $1 WHERE board_id = $2 AND item_id = $3`, [k, boardId, order[k]]);
    }
  });
}

export async function setBoardCover(boardId: string, itemId: string, userId: string): Promise<void> {
  const d = await db();
  await d.query(
    `UPDATE boards SET cover_item_id = $1 WHERE id = $2 AND (owner_id = $3 OR owner_id IS NULL)
        AND EXISTS (SELECT 1 FROM board_items WHERE board_id = $2 AND item_id = $1)`,
    [itemId, boardId, userId],
  );
}

export async function setBoardPrivacy(boardId: string, userId: string, isPrivate: boolean): Promise<void> {
  const d = await db();
  await d.query(`UPDATE boards SET is_private = $1 WHERE id = $2 AND owner_id = $3`, [isPrivate, boardId, userId]);
}

/** The boards an item is on, plus the ones it could be added to. For the item page. */
export async function boardsForItem(itemId: string, userId: string) {
  const all = await listBoards(userId);
  const d = await db();
  const on = new Set(
    (await d.query<{ board_id: string }>(`SELECT board_id FROM board_items WHERE item_id = $1`, [itemId])).map((r) => r.board_id),
  );
  return { on: all.filter((b) => on.has(b.id)), available: all.filter((b) => !on.has(b.id)) };
}

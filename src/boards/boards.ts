import crypto from "node:crypto";
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
  isSmart: boolean;
  count: number;
  coverSha: string | null;
  createdAt: string;
};

export async function listBoards(userId: string): Promise<BoardRow[]> {
  const d = await db();
  const rows = await d.query<BoardRow & { filter: Record<string, unknown> | null }>(
    `SELECT b.id, b.name, b.description, b.owner_id AS "ownerId", u.name AS "ownerName",
            b.is_private AS "isPrivate", b.is_smart AS "isSmart", b.created_at::text AS "createdAt",
            b.filter_json AS filter,
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

  // A smart board holds a filter, not items, so its count and cover come from
  // running the filter. A team has tens of boards, not thousands.
  const smart = rows.filter((r) => r.isSmart && r.filter);
  if (smart.length) {
    const { search } = await import("@/search/query");
    await Promise.all(
      smart.map(async (r) => {
        const res = await search({ ...(r.filter as object), limit: 1 });
        r.count = res.total;
        r.coverSha = res.items[0]?.sha256 ?? null;
      }),
    );
  }
  return rows.map(({ filter: _filter, ...r }) => r);
}

export async function createBoard(userId: string, name: string, description?: string, filter?: Record<string, unknown>): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean.length < 2) throw new Error("a lookbook name needs at least 2 characters");
  const d = await db();
  // FR-33. A smart board is a saved search: it holds a filter, not items, and
  // is always as current as the library.
  const row = await d.one<{ id: string }>(
    `INSERT INTO boards (name, description, owner_id, is_smart, filter_json) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [clean, description?.trim() || null, userId, !!filter, filter ? JSON.stringify(filter) : null],
  );
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'board', $2, 'created')`, [userId, row!.id]);
  return row!.id;
}

export async function getBoard(id: string, userId: string) {
  const d = await db();
  const board = await d.one<BoardRow & { canEdit: boolean; shareToken: string | null; shareExpiresAt: string | null; isSmart: boolean; filter: Record<string, unknown> | null }>(
    `SELECT b.id, b.name, b.description, b.owner_id AS "ownerId", u.name AS "ownerName",
            b.is_private AS "isPrivate", b.created_at::text AS "createdAt", 0 AS count, NULL AS "coverSha",
            b.is_smart AS "isSmart", b.filter_json AS filter,
            (b.owner_id = $2 OR b.owner_id IS NULL) AS "canEdit",
            b.share_token AS "shareToken",
            CASE WHEN b.share_expires_at > now() THEN b.share_expires_at::text ELSE NULL END AS "shareExpiresAt"
       FROM boards b LEFT JOIN users u ON u.id = b.owner_id
      WHERE b.id = $1 AND (b.is_private = false OR b.owner_id = $2)`,
    [id, userId],
  );
  if (!board) return null;

  if (board.isSmart && board.filter) {
    // Resolved live from the filter. Imported lazily to avoid a cycle with search.
    const { search } = await import("@/search/query");
    const res = await search({ ...(board.filter as object), limit: 200 });
    const items = res.items.map((i, position) => ({ id: i.id, sha256: i.sha256, width: i.width, height: i.height, captionAi: i.captionAi, title: i.title, position }));
    return { ...board, count: res.total, items };
  }

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

// ---------------------------------------------------------------------------
// FR-35 client share links. Unguessable, expiring, read-only, and the only
// way anyone without a HAUS account ever sees an image (REF-01 R-6).

export async function shareBoard(boardId: string, userId: string, days = 30): Promise<string | null> {
  const d = await db();
  const token = crypto.randomBytes(18).toString("base64url");
  const row = await d.one<{ share_token: string }>(
    `UPDATE boards SET share_token = $1, share_expires_at = now() + ($2 || ' days')::interval
      WHERE id = $3 AND (owner_id = $4 OR owner_id IS NULL) RETURNING share_token`,
    [token, String(Math.max(1, Math.min(365, days))), boardId, userId],
  );
  return row?.share_token ?? null;
}

export async function unshareBoard(boardId: string, userId: string): Promise<void> {
  const d = await db();
  await d.query(`UPDATE boards SET share_token = NULL, share_expires_at = NULL WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)`, [boardId, userId]);
}

/** The public view. Null when the token is unknown or expired. */
export async function getSharedBoard(token: string) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  const d = await db();
  const board = await d.one<{ id: string; name: string; description: string | null; expires: string }>(
    `SELECT id, name, description, share_expires_at::text AS expires FROM boards
      WHERE share_token = $1 AND share_expires_at > now()`,
    [token],
  );
  if (!board) return null;
  const items = await d.query<{ id: string; sha256: string; width: number | null; height: number | null; captionAi: string | null; likes: number }>(
    `SELECT i.id, a.sha256, a.width, a.height, i.caption_ai AS "captionAi",
            (SELECT count(*)::int FROM board_feedback f WHERE f.board_id = $1 AND f.item_id = i.id AND f.sentiment = 'like') AS likes
       FROM board_items bi JOIN items i ON i.id = bi.item_id JOIN assets a ON a.id = i.asset_id
      WHERE bi.board_id = $1 AND i.deleted_at IS NULL
      ORDER BY bi.position, bi.item_id`,
    [board.id],
  );
  return { ...board, items };
}

/** True when this token currently grants access to an image with this hash. Used by the asset route. */
export async function tokenCoversAsset(token: string, sha256: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return false;
  const d = await db();
  const row = await d.one(
    `SELECT 1 AS ok FROM boards b
       JOIN board_items bi ON bi.board_id = b.id
       JOIN items i ON i.id = bi.item_id
       JOIN assets a ON a.id = i.asset_id
      WHERE b.share_token = $1 AND b.share_expires_at > now() AND a.sha256 = $2 AND i.deleted_at IS NULL
      LIMIT 1`,
    [token, sha256],
  );
  return !!row;
}

export async function recordFeedback(token: string, itemId: string, viewer: string, sentiment: "like" | "no", note?: string): Promise<boolean> {
  const board = await getSharedBoard(token);
  if (!board || !board.items.some((i) => i.id === itemId)) return false;
  const d = await db();
  await d.query(
    `INSERT INTO board_feedback (board_id, item_id, viewer, sentiment, note) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (board_id, item_id, viewer) DO UPDATE SET sentiment = excluded.sentiment, note = excluded.note, created_at = now()`,
    [board.id, itemId, viewer.trim().slice(0, 60), sentiment, note?.trim().slice(0, 500) || null],
  );
  return true;
}

export async function feedbackForBoard(boardId: string) {
  const d = await db();
  return d.query<{ itemId: string; viewer: string; sentiment: string; note: string | null; at: string }>(
    `SELECT item_id AS "itemId", viewer, sentiment, note, created_at::text AS at
       FROM board_feedback WHERE board_id = $1 ORDER BY created_at DESC`,
    [boardId],
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

/**
 * FR-46, the useful half. Every haus gets a smart board the moment it is
 * named, so "everything we have saved for the Hurst haus" is one tap from the
 * boards page and never has to be built by hand. It is a saved filter, so it is
 * always current. Idempotent: one board per haus slug, whoever creates it.
 */
export async function ensureHausBoard(userId: string, slug: string, label: string): Promise<string> {
  const d = await db();
  const existing = await d.one<{ id: string }>(
    `SELECT id FROM boards WHERE is_smart AND filter_json::jsonb -> 'facets' -> 'project' = $1::jsonb LIMIT 1`,
    [JSON.stringify([slug])],
  );
  if (existing) return existing.id;
  const name = /haus$/i.test(label) ? label : `${label} haus`;
  return createBoard(userId, name, "Everything saved for this haus. Updates itself.", { facets: { project: [slug] } });
}

import crypto from "node:crypto";
import { SYSTEM_USER_EMAIL } from "@/config";
import { db } from "@/db/client";

/**
 * People and their phones.
 *
 * Roles: the first real person to sign in is the owner. Everyone after is an
 * editor, which is the working role: capture, tag, correct, make boards.
 * Viewer exists for the day a client or a trade needs read-only access.
 */

export type User = { id: string; email: string; name: string | null; role: "owner" | "editor" | "viewer" };

export async function upsertUser(input: { email: string; name?: string | null; image?: string | null }): Promise<User> {
  const d = await db();
  const email = input.email.toLowerCase();

  const people = await d.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM users WHERE email <> $1`,
    [SYSTEM_USER_EMAIL],
  );
  const firstPerson = Number(people?.n ?? 0) === 0;

  const row = await d.one<User>(
    `INSERT INTO users (email, name, image, role, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO UPDATE SET
       name = coalesce(excluded.name, users.name),
       image = coalesce(excluded.image, users.image),
       last_seen_at = now()
     RETURNING id, email, name, role::text AS role`,
    [email, input.name ?? null, input.image ?? null, firstPerson ? "owner" : "editor"],
  );
  return row!;
}

export async function userById(id: string): Promise<User | null> {
  const d = await db();
  return d.one<User>(`SELECT id, email, name, role::text AS role FROM users WHERE id = $1`, [id]);
}

export async function systemUser(): Promise<User> {
  const d = await db();
  const u = await d.one<User>(`SELECT id, email, name, role::text AS role FROM users WHERE email = $1`, [SYSTEM_USER_EMAIL]);
  if (!u) throw new Error("system user missing; run migrate");
  return u;
}

export async function userByEmail(email: string): Promise<User | null> {
  const d = await db();
  return d.one<User>(`SELECT id, email, name, role::text AS role FROM users WHERE email = $1`, [email.toLowerCase()]);
}

// ---------------------------------------------------------------------------
// FR-7 device tokens. One per phone, shown once, stored hashed, revocable.

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createDeviceToken(userId: string, label: string): Promise<{ id: string; token: string }> {
  const d = await db();
  const token = "plt_" + crypto.randomBytes(24).toString("base64url");
  const row = await d.one<{ id: string }>(
    `INSERT INTO device_tokens (user_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id`,
    [userId, hash(token), label.trim().slice(0, 60) || "phone"],
  );
  return { id: row!.id, token };
}

export async function resolveDeviceToken(raw: string): Promise<User | null> {
  // A key is pasted by hand into a phone. It arrives with a trailing space or
  // newline, with "Bearer" typed twice or not at all, inside quotes, or with
  // the phone's autocorrect having had a go at the prefix. None of that is a
  // reason to turn someone away: the key is the run of characters starting at
  // plt_, and the rest is packaging. The secret part is still matched exactly.
  const token = /plt_[A-Za-z0-9_-]{20,}/i.exec(raw)?.[0]?.replace(/^plt_/i, "plt_");
  if (!token) return null;
  const d = await db();
  const row = await d.one<User & { token_id: string }>(
    `SELECT u.id, u.email, u.name, u.role::text AS role, t.id AS token_id
       FROM device_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
    [hash(token)],
  );
  if (!row) return null;
  await d.query(`UPDATE device_tokens SET last_used_at = now() WHERE id = $1`, [row.token_id]);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function listDeviceTokens(userId: string) {
  const d = await db();
  return d.query<{ id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>(
    `SELECT id, label, created_at::text, last_used_at::text, revoked_at::text
       FROM device_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeDeviceToken(id: string, userId: string) {
  const d = await db();
  await d.query(`UPDATE device_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2`, [id, userId]);
}

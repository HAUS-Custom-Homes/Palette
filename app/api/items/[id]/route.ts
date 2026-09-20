import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";
import { getItem } from "@/search/query";

/**
 * Undo, and "remove from library". Takes the whole post. A soft delete: the
 * originals stay until a confirmed purge (FR-43), so an Undo of the Undo is
 * just saving the link again. Yours to remove, or an owner's.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const d = await db();
  const row = await d.one<{ lead: string; created_by: string | null }>(
    `SELECT COALESCE(group_id, id) AS lead, created_by FROM items WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.created_by !== user.id && user.role !== "owner") return NextResponse.json({ error: "not yours to remove" }, { status: 403 });

  const gone = await d.query<{ id: string }>(
    `UPDATE items SET deleted_at = now() WHERE (id = $1 OR group_id = $1) AND deleted_at IS NULL RETURNING id`, [row.lead]);
  await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'item', $2, 'soft_deleted')`, [user.id, row.lead]);
  return NextResponse.json({ removed: gone.length });
}

/** One item with its tags and provenance, for the HausBuch bridge (FR-38). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const data = await getItem(id);
  if (!data || data.item.deleted_at) return NextResponse.json({ error: "not found" }, { status: 404 });

  const it = data.item as Record<string, unknown>;
  return NextResponse.json({
    id, sha256: it.sha256, caption: it.caption_ai, title: it.title, note: it.note, rating: it.rating,
    width: it.width, height: it.height, savedBy: it.ownerName, capturedAt: it.captured_at,
    tags: (data.tags as Array<Record<string, unknown>>).filter((t) => !t.rejected).map((t) => ({
      facet: t.facetKey, term: t.slug, label: t.label, source: t.source, confidence: t.confidence, suggested: t.suggested,
    })),
    sources: data.sources,
    thumb: `/api/asset/${it.sha256}/thumb`, grid: `/api/asset/${it.sha256}/grid`, detail: `/api/asset/${it.sha256}/detail`,
    original: `/api/asset/${it.sha256}/original`, page: `/item/${id}`,
  });
}

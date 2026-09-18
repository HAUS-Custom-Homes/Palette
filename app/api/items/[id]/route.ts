import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";
import { getItem } from "@/search/query";

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

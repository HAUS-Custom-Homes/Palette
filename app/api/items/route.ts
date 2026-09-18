import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";
import { search } from "@/search/query";

/**
 * REF-01 FR-38, FR-39: the Palette side of the HausBuch bridge, and a JSON
 * search for anything else on the team's side of the wall. Same hybrid search
 * as the library page. Session or device token.
 *
 *   GET /api/items?q=white+oak+hood&project=hurst&space=kitchen&limit=24
 */
export async function GET(req: NextRequest) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const facets: Record<string, string[]> = {};
  for (const key of ["project", "image_type", "space", "element", "material", "style", "color", "attribute"]) {
    const v = sp.get(key);
    if (v) facets[key] = v.split(",").filter(Boolean);
  }
  const res = await search({
    q: sp.get("q") ?? undefined,
    facets,
    nearColor: sp.get("near") ?? undefined,
    limit: Math.min(Number(sp.get("limit") ?? 24) || 24, 100),
    offset: Number(sp.get("offset") ?? 0) || 0,
  });
  return NextResponse.json({
    total: res.total,
    items: res.items.map((i) => ({
      id: i.id, sha256: i.sha256, caption: i.captionAi, title: i.title, width: i.width, height: i.height,
      savedBy: i.ownerName, capturedAt: i.capturedAt,
      // These need a session or a share token to fetch; the bridge passes its token.
      thumb: `/api/asset/${i.sha256}/thumb`, grid: `/api/asset/${i.sha256}/grid`, detail: `/api/asset/${i.sha256}/detail`,
      page: `/item/${i.id}`,
    })),
  });
}

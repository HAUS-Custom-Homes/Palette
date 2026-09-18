import { NextRequest, NextResponse } from "next/server";
import { createOpenTerm, setHumanTag } from "@/ai/apply-tags";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";

/**
 * An editor adds a term to an open facet (a new haus), optionally tagging an
 * item with it in the same request. Closed facets refuse: they grow through
 * proposals only (FR-23).
 */
export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const body = (await req.json()) as { facet?: string; label?: string; itemId?: string };
  if (!body.facet || !body.label) return NextResponse.json({ error: "facet and label required" }, { status: 400 });

  try {
    const { termId, created } = await createOpenTerm(body.facet, body.label, user.id);
    if (body.itemId) await setHumanTag(body.itemId, termId, "add", user.id);
    return NextResponse.json({ termId, created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

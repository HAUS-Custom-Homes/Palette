import { NextRequest, NextResponse } from "next/server";
import { resolveOpenTermIds, setHumanTag } from "@/ai/apply-tags";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";

/** FR-36 bulk haus. A human tag on every item, by the person who did it. */
export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { itemIds, haus } = (await req.json()) as { itemIds?: string[]; haus?: string };
  const [termId] = await resolveOpenTermIds("project", haus ? [haus] : []);
  if (!termId) return NextResponse.json({ error: "unknown haus" }, { status: 422 });
  const ids = (itemIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  for (const itemId of ids) await setHumanTag(itemId, termId, "add", user.id);
  return NextResponse.json({ count: ids.length });
}

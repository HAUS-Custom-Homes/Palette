import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { addToBoard, getBoard } from "@/boards/boards";
import { boot } from "@/lib/boot";

/** FR-36 bulk add. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await getBoard(id, user.id))) return NextResponse.json({ error: "no such lookbook" }, { status: 404 });
  const { itemIds } = (await req.json()) as { itemIds?: string[] };
  const ids = (itemIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  for (const itemId of ids) await addToBoard(id, itemId, user.id);
  return NextResponse.json({ count: ids.length });
}

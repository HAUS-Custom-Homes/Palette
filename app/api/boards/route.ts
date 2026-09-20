import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { addToBoard, createBoard } from "@/boards/boards";
import { boot } from "@/lib/boot";

/**
 * Make a board and put things on it in one step. This is what "New board..."
 * in any picker calls, so nobody has to leave what they are looking at to go
 * and make somewhere to put it.
 */
export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; itemIds?: string[] };
  const ids = (body.itemIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  try {
    const id = await createBoard(user.id, String(body.name ?? ""));
    for (const itemId of ids) await addToBoard(id, itemId, user.id);
    return NextResponse.json({ id, name: String(body.name ?? "").trim(), count: ids.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}

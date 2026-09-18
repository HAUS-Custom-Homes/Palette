import { NextRequest, NextResponse } from "next/server";
import { recordFeedback } from "@/boards/boards";
import { boot } from "@/lib/boot";

/** FR-35. The only unauthenticated write in the system, scoped to one expiring token and one board. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  await boot();
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { itemId?: string; viewer?: string; sentiment?: string; note?: string };
  if (!body.itemId || !body.viewer?.trim()) return NextResponse.json({ error: "itemId and viewer required" }, { status: 400 });
  const sentiment = body.sentiment === "no" ? "no" : "like";
  const ok = await recordFeedback(token, body.itemId, body.viewer, sentiment, body.note);
  if (!ok) return NextResponse.json({ error: "not found or expired" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

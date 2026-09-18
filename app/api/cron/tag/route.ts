import { NextRequest, NextResponse } from "next/server";
import { config } from "@/config";
import { boot } from "@/lib/boot";
import { queueDepth, runTagQueue } from "@/ingest/tag-worker";

/**
 * The safety net behind after(): Vercel Cron calls this on a schedule
 * (vercel.json) so a queue that after() did not drain, or a quarantine retry,
 * still gets picked up. Authenticated with the CRON_SECRET Vercel sends.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await boot();
  const summary = await runTagQueue(25);
  return NextResponse.json({ ...summary, queue: await queueDepth() });
}

import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";

/**
 * Liveness for the host's health check. No authentication and no data: it
 * says only that the process is up and the database accepted the schema and
 * its enforcement triggers. /api/health is the detailed, authenticated one.
 */
export async function GET() {
  try {
    await boot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}

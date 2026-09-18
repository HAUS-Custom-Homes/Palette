import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { derivedKey, store } from "@/storage/object-store";

/**
 * REF-01 NFR-7. Every byte is reached through the application and a session,
 * never from a public bucket. On R2 this hands back a short-lived signed URL;
 * locally it streams. The app only ever references this path.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ sha: string; variant: string }> }) {
  const { sha, variant } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(sha)) return new Response("bad hash", { status: 400 });

  await boot();
  if (!(await currentUser())) return new Response("sign in", { status: 401 });

  const d = await db();
  const asset = await d.one<{ storage_key: string; mime_type: string }>(
    `SELECT storage_key, mime_type FROM assets WHERE sha256 = $1`,
    [sha],
  );
  if (!asset) return new Response("not found", { status: 404 });

  const original = variant === "original";
  const key = original ? asset.storage_key : derivedKey(sha, variant);

  const signed = await store().url(key);
  if (signed) return NextResponse.redirect(signed, 302);

  try {
    const bytes = await store().get(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": original ? asset.mime_type : "image/webp",
        // Content-addressed, so the bytes behind this URL can never change.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

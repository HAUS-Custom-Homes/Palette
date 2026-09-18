import { NextRequest, NextResponse, after } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { ingestBuffer, ingestUrl } from "@/ingest/ingest";
import { runTagQueue } from "@/ingest/tag-worker";

/**
 * The Android share target (see app/manifest.ts). A share is a navigation
 * that POSTs a form, so the session cookie comes along and the person lands
 * on the saved item afterwards. Not in the middleware matcher on purpose: a
 * redirect to sign-in would lose the POST body, so the check happens here.
 */
export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/api/auth/signin", req.url), 303);

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const text = String(form.get("text") ?? "");
  const urlField = String(form.get("url") ?? "");
  // Instagram and others put the link in `text`, not `url`.
  const url = urlField || (text.match(/https?:\/\/\S+/)?.[0] ?? "");
  const title = String(form.get("title") ?? "").trim() || undefined;

  let itemId: string | null = null;
  try {
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const r = await ingestBuffer(buf, {
        userId: user.id, filename: file.name, mime: file.type || undefined, title,
        source: { kind: "share", externalId: `share:${file.name}:${buf.byteLength}` },
      });
      itemId = r.itemId;
    }
    if (!files.length && url) {
      const r = await ingestUrl(url, user.id, { kind: "share" }, { note: title });
      itemId = r.itemId;
    }
  } catch (err) {
    const msg = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/?shared=failed&why=${msg}`, req.url), 303);
  }

  after(() => runTagQueue(5).catch(() => {}));
  return NextResponse.redirect(new URL(itemId ? `/item/${itemId}?shared=1` : "/?shared=empty", req.url), 303);
}

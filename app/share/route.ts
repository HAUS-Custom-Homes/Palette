import { NextRequest, NextResponse, after } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { ingestBuffer, ingestLink } from "@/ingest/ingest";
import { runTagQueue } from "@/ingest/tag-worker";

/**
 * The share sheet's way in, on Android and on a Windows PC (see app/manifest.ts):
 * once Palette is installed as an app, the system lists it next to Messages
 * and Mail. A share is a navigation that POSTs a form, so the session cookie
 * comes along and the person lands on what they saved. Not in the middleware
 * matcher on purpose: a redirect to sign-in would lose the POST body, so the
 * check happens here.
 */

/** Where the person really is. Behind a proxy, req.url is the container's own address. */
function here(req: NextRequest, path: string): URL {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = process.env.AUTH_URL ?? (host ? `${proto}://${host}` : req.url);
  return new URL(path, base);
}

export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user) return NextResponse.redirect(here(req, "/api/auth/signin"), 303);

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  // Instagram and most apps put the link in `text`, often after a sentence; a few use `url` or `title`.
  const haystack = [form.get("url"), form.get("text"), form.get("title")].map((v) => String(v ?? "")).join(" ");
  const url = haystack.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? "";

  let itemId: string | null = null;
  try {
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const r = await ingestBuffer(buf, {
        userId: user.id, filename: file.name, mime: file.type || undefined,
        source: { kind: "share", externalId: `share:${file.name}:${buf.byteLength}` },
      });
      itemId ??= r.itemId;
    }
    if (!files.length && url) {
      // A link to a post brings the whole post: every picture, and the video when it can be had.
      // The first picture before the redirect, the rest after it, so the phone is not left waiting.
      const all = await ingestLink(url, user.id, { kind: "share" }, {
        defer: (work) => after(() => work().then(() => runTagQueue(10)).catch(() => {})),
      });
      itemId = all[0]?.itemId ?? null;
    }
  } catch (err) {
    const msg = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(here(req, `/?shared=failed&why=${msg}`), 303);
  }

  after(() => runTagQueue(5).catch(() => {}));
  return NextResponse.redirect(here(req, itemId ? `/item/${itemId}?shared=1` : "/?shared=empty"), 303);
}

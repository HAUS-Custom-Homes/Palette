import { NextRequest, NextResponse, after } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken, type User } from "@/lib/users";
import { ingestBuffer, ingestUrl } from "@/ingest/ingest";
import { runTagQueue } from "@/ingest/tag-worker";

/**
 * REF-01 FR-3, FR-4, FR-5, FR-7.
 *
 * The single ingest endpoint. The upload zone, the browser extension, the
 * Android share target and the iOS Shortcut all land here. It answers as soon
 * as the bytes are durable and never waits on the model.
 *
 * Two ways in: a session cookie (the web app) or a device token in the
 * Authorization header (a phone). Nothing else.
 */
async function whoIs(req: NextRequest): Promise<User | null> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) return resolveDeviceToken(bearer);
  return currentUser();
}

export async function POST(req: NextRequest) {
  await boot();
  const user = await whoIs(req);
  if (!user) return NextResponse.json({ error: "sign in, or send a device token" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "viewers cannot add" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";

  // ---- clip: a URL, from the extension or a share sheet ------------------
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as { url?: string; source?: string; note?: string; haus?: string[] };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
    try {
      const res = await ingestUrl(body.url, user.id, { kind: (body.source as "web") ?? "web" }, { note: body.note, termIds: body.haus });
      after(() => runTagQueue(10).catch(() => {}));
      return NextResponse.json(res);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 422 });
    }
  }

  // ---- upload: one or many files, plus an optional url field ------------
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const url = String(form.get("url") ?? "").trim();
  const note = String(form.get("note") ?? "").trim() || undefined;
  const haus = form.getAll("haus").map(String).filter(Boolean);

  let saved = 0, duplicates = 0, variants = 0, failed = 0;
  let lastItemId: string | null = null;
  const errors: string[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const res = await ingestBuffer(buf, {
        userId: user.id,
        filename: file.name,
        mime: file.type || undefined,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        note,
        termIds: haus,
        source: { kind: "upload", externalId: `upload:${file.name}:${buf.byteLength}` },
      });
      lastItemId = res.itemId;
      if (res.duplicate) duplicates++; else if (res.variantOf) variants++; else saved++;
    } catch (err) {
      failed++;
      errors.push(`${file.name}: ${(err as Error).message}`);
    }
  }

  if (url && /^https?:\/\//.test(url)) {
    try {
      const res = await ingestUrl(url, user.id, { kind: "share" }, { note, termIds: haus });
      lastItemId = res.itemId;
      if (res.duplicate) duplicates++; else if (res.variantOf) variants++; else saved++;
    } catch (err) {
      failed++;
      errors.push(`${url}: ${(err as Error).message}`);
    }
  }

  if (!files.length && !url) return NextResponse.json({ error: "nothing to save" }, { status: 400 });

  // Post-response work that survives the response ending (Vercel-safe).
  after(() => runTagQueue(10).catch(() => {}));

  return NextResponse.json({ saved, duplicates, variants, failed, errors, itemId: lastItemId });
}

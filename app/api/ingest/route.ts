import { NextRequest, NextResponse, after } from "next/server";
import { resolveOpenTermIds } from "@/ai/apply-tags";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken, type User } from "@/lib/users";
import { ingestBuffer, ingestLink, ingestUrl, type SourceInfo } from "@/ingest/ingest";
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

const MEDIA = new Set(["image", "video_cover", "video_frame"]);
const intField = (v: string | undefined, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const numField = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) && n >= 0 && n < 86_400 ? n : undefined;
};

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
      const termIds = await resolveOpenTermIds("project", body.haus ?? []);
      const res = await ingestUrl(body.url, user.id, { kind: (body.source as "web") ?? "web" }, { note: body.note, termIds });
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
  // "hurst" from a dropdown or the extension, or an id from inside the app.
  const haus = await resolveOpenTermIds("project", form.getAll("haus").map(String));

  // Provenance, sent by the browser extension (FR-4). A clip that arrives
  // without it is treated as a plain upload.
  const field = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const KINDS = new Set(["instagram", "pinterest", "web", "upload", "email", "watch_folder", "api", "share"]);
  const kindField = field("source_kind");
  const provenance = {
    kind: (kindField && KINDS.has(kindField) ? kindField : undefined) as SourceInfo["kind"] | undefined,
    sourceUrl: field("source_url"),
    externalId: field("external_id"),
    authorHandle: field("author_handle"),
    authorUrl: field("author_url"),
    captionText: field("caption_text")?.slice(0, 2000),
    boardName: field("board_name"),
    pageTitle: field("page_title")?.slice(0, 300),
    // A post is not an image: which post, which slide of how many, and whether
    // this is a still taken from a video.
    postId: field("post_id")?.slice(0, 200),
    slideIndex: intField(field("slide_index"), 1, 50),
    slideCount: intField(field("slide_count"), 1, 50),
    mediaKind: (MEDIA.has(field("media_kind") ?? "") ? field("media_kind") : undefined) as SourceInfo["mediaKind"],
    frameTimeS: numField(field("frame_time_s")),
  };

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
        title: provenance.pageTitle ?? file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        note,
        termIds: haus,
        source: {
          ...provenance,
          kind: provenance.kind ?? "upload",
          externalId: provenance.externalId ?? `upload:${file.name}:${buf.byteLength}`,
        },
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
      // A link to a post can be several images. Land the person on the first.
      const all = await ingestLink(url, user.id, { ...provenance, kind: provenance.kind ?? "share" }, { note, termIds: haus });
      lastItemId = all[0]?.itemId ?? lastItemId;
      for (const res of all) {
        if (res.duplicate) duplicates++; else if (res.variantOf) variants++; else saved++;
      }
    } catch (err) {
      failed++;
      errors.push((err as Error).message);
    }
  }

  if (!files.length && !url) return NextResponse.json({ error: "nothing to save" }, { status: 400 });

  // Post-response work that survives the response ending (Vercel-safe).
  after(() => runTagQueue(10).catch(() => {}));

  return NextResponse.json({ saved, duplicates, variants, failed, errors, itemId: lastItemId });
}

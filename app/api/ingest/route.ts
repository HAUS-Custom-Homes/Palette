import { NextRequest, NextResponse, after } from "next/server";
import { resolveOpenTermIds } from "@/ai/apply-tags";
import { currentUser } from "@/auth";
import { db } from "@/db/client";
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
/** The key, wherever a person managed to put it: the right header, or one whose name they misspelled. */
function keyIn(req: NextRequest): string | null {
  const proper = req.headers.get("authorization");
  if (proper && /plt_/i.test(proper)) return proper;
  for (const [, value] of req.headers) if (/plt_[A-Za-z0-9_-]{20,}/i.test(value)) return value;
  return proper;
}

async function whoIs(req: NextRequest): Promise<User | null> {
  const key = keyIn(req);
  if (key) return resolveDeviceToken(key);
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
  let user = await whoIs(req);

  // The Headers section is the fiddliest corner of the iPhone Shortcut editor,
  // and the first real attempt arrived with no header at all. So the key may
  // also come as an ordinary form field, which is the part of that screen
  // people get right. Any text field will do; `key` is what the guide says.
  let early: FormData | null = null;
  let fieldKey: string | null = null;
  if (!user && /multipart\/form-data|x-www-form-urlencoded/i.test(req.headers.get("content-type") ?? "")) {
    early = await req.formData().catch(() => null);
    for (const [, v] of early ?? []) {
      if (typeof v === "string" && /plt_[A-Za-z0-9_-]{20,}/i.test(v)) { fieldKey = v; break; }
    }
    if (fieldKey) user = await resolveDeviceToken(fieldKey);
  }

  // `message` is what a phone's notification shows, so every answer carries one.
  if (!user) {
    // Say which of the two it is, in few enough words to fit a notification.
    const key = fieldKey ?? keyIn(req);
    const message = !key
      ? "No key arrived. Add a form field named key and paste your Palette key as its value."
      : !/plt_[A-Za-z0-9_-]{20,}/i.test(key)
        ? "The key looks cut off. Copy it again from Palette and paste the whole thing."
        : "That key is not active. Make a new one in Palette and paste it in.";
    return NextResponse.json({ error: "sign in, or send a device token", message }, { status: 401 });
  }
  if (user.role === "viewer") {
    return NextResponse.json({ error: "viewers cannot add", message: "Your Palette account can look but not save. Ask Trevor to change your role." }, { status: 403 });
  }

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
  const form = early ?? (await req.formData());
  const allFiles = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  // iOS Shortcuts sends a shared link as a tiny text file when the field is a
  // File. That is a link, not a picture that failed.
  const isTextFile = (f: File) => /^text\//.test(f.type) || /\.(txt|url|webloc)$/i.test(f.name);
  const files = allFiles.filter((f) => !isTextFile(f));
  const fileText = (await Promise.all(allFiles.filter((f) => isTextFile(f) && f.size < 20_000).map((f) => f.text()))).join(" ");
  // A phone's share sheet hands over whatever the app felt like: a bare link, a
  // sentence with a link in it, or the link in a "text" field. Find the link.
  const shared = [form.get("url"), form.get("text"), fileText].map((v) => (typeof v === "string" ? v : "")).join(" ");
  const url = shared.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? "";
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

  if (!files.length && !url) {
    return NextResponse.json(
      { error: "nothing to save", message: "Palette found no picture or link in what was shared. Try sharing the post's link, or a screenshot." },
      { status: 400 },
    );
  }

  // Post-response work that survives the response ending (Vercel-safe).
  after(() => runTagQueue(10).catch(() => {}));

  // What the confirmation shows: the post as the person will see it in the library.
  let post: { id: string; sha256: string; title: string | null; count: number } | null = null;
  if (lastItemId) {
    const d = await db();
    post = await d.one(
      `SELECT l.id, a.sha256, l.title,
              (SELECT count(*)::int FROM items m WHERE (m.id = l.id OR m.group_id = l.id) AND m.deleted_at IS NULL AND m.variant_of IS NULL) AS count
         FROM items i JOIN items l ON l.id = COALESCE(i.group_id, i.id) JOIN assets a ON a.id = l.asset_id
        WHERE i.id = $1`,
      [lastItemId],
    );
  }

  // One sentence for whatever is on the other end to show: the iPhone Shortcut's
  // notification, the extension's toast.
  const n = post?.count ?? saved;
  const message = !post
    ? `Palette could not save that${errors[0] ? `: ${errors[0]}` : "."}`
    : saved === 0 && variants === 0
      ? "Already in Palette"
      : `Saved to Palette${n > 1 ? ` · ${n} items` : ""}`;

  return NextResponse.json({ saved, duplicates, variants, failed, errors, itemId: post?.id ?? lastItemId, post, message });
}

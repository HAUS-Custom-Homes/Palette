import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { userByEmail } from "@/lib/users";

/**
 * REF-01 FR-2. Meta's "Download your information" archive, unzipped, holds
 * your_instagram_activity/saved/saved_posts.json (and saved_collections.json).
 * Each entry is a post you once saved. This turns them into a worklist at
 * /backfill; an entry is done the moment the extension (or you) has clipped
 * that post, because the external id matches. Nothing is fetched here.
 *
 *   npm run backfill:instagram -- ./instagram-export --as trevor@hauscustomhomes.com
 */
type Entry = { title?: string; string_map_data?: Record<string, { href?: string; value?: string; timestamp?: number }> };

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/^saved_(posts|collections).*\.json$/i.test(e.name)) yield full;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--as") + 1]);
  const asIdx = args.indexOf("--as");
  if (!dir || asIdx < 0) { console.error("usage: npm run backfill:instagram -- <export-folder> --as email"); process.exit(1); }

  await migrate({ quiet: true });
  const user = await userByEmail(args[asIdx + 1]);
  if (!user) { console.error("unknown user; they must sign in once first"); process.exit(1); }
  const d = await db();

  let found = 0, added = 0;
  for await (const file of walk(path.resolve(dir))) {
    const json = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, Entry[]>;
    const collection = /collections/i.test(file) ? undefined : undefined;
    for (const list of Object.values(json)) {
      if (!Array.isArray(list)) continue;
      for (const e of list) {
        const m = e.string_map_data ?? {};
        const href = Object.values(m).find((v) => v?.href)?.href ?? "";
        const id = href.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)?.[1];
        if (!id) continue;
        found++;
        const ts = Object.values(m).find((v) => v?.timestamp)?.timestamp;
        const coll = e.title && !/^\s*$/.test(e.title) && !href.includes(e.title) ? e.title : collection;
        const rows = await d.query(
          `INSERT INTO backfill (user_id, kind, external_id, url, collection, saved_at)
           VALUES ($1, 'instagram', $2, $3, $4, $5) ON CONFLICT (user_id, kind, external_id) DO NOTHING RETURNING id`,
          [user.id, `ig:${id}`, `https://www.instagram.com/p/${id}/`, coll ?? null, ts ? new Date(ts * 1000).toISOString() : null],
        );
        if (rows.length) added++;
      }
    }
    console.log(`  ${path.basename(file)}`);
  }
  const done = await d.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM backfill b WHERE b.user_id = $1 AND EXISTS (SELECT 1 FROM sources s WHERE s.kind = 'instagram' AND s.external_id = b.external_id)`,
    [user.id],
  );
  console.log(`[backfill] ${found} saved posts in the export, ${added} new on the worklist, ${done?.n} already in the library. Open /backfill.`);
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

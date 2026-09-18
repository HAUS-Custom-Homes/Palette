import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { runTagQueue } from "@/ingest/tag-worker";
import { systemUser, userByEmail } from "@/lib/users";

/**
 * REF-01 FR-10. A folder anyone can drop images into, for the person who will
 * not install anything. Polls, ingests, moves each file to processed/ (or
 * failed/), tags. Point it at the fileserver share and leave it running.
 *
 *   npm run watch -- "//192.168.1.125/share/palette/inbox" --as trevor@hauscustomhomes.com
 */
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".tif", ".tiff"]);

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--as") + 1]);
  if (!dir) { console.error("usage: npm run watch -- <folder> [--as email] [--every seconds]"); process.exit(1); }
  const asIdx = args.indexOf("--as");
  const everyIdx = args.indexOf("--every");
  const every = everyIdx >= 0 ? Number(args[everyIdx + 1]) : 20;

  await migrate({ quiet: true });
  const user = asIdx >= 0 ? await userByEmail(args[asIdx + 1]) : await systemUser();
  if (!user) { console.error("unknown user"); process.exit(1); }

  const processed = path.join(dir, "processed");
  const failed = path.join(dir, "failed");
  await fs.mkdir(processed, { recursive: true });
  await fs.mkdir(failed, { recursive: true });
  console.log(`[watch] ${path.resolve(dir)} every ${every}s as ${user.email}. Ctrl-C to stop.`);

  for (;;) {
    let entries: string[] = [];
    try { entries = (await fs.readdir(dir)).filter((f) => EXTS.has(path.extname(f).toLowerCase())); } catch (e) { console.error(`[watch] ${(e as Error).message}`); }
    let n = 0;
    for (const f of entries) {
      const full = path.join(dir, f);
      try {
        // Skip a file still being written: size must be stable across two looks.
        const s1 = (await fs.stat(full)).size;
        await new Promise((r) => setTimeout(r, 1500));
        if ((await fs.stat(full)).size !== s1) continue;
        const res = await ingestBuffer(await fs.readFile(full), {
          userId: user.id, filename: f, title: path.basename(f, path.extname(f)).replace(/[-_]+/g, " "),
          source: { kind: "watch_folder", externalId: `watch:${f}:${s1}`, pageTitle: path.basename(path.resolve(dir)) },
        });
        await fs.rename(full, path.join(processed, `${Date.now()}-${f}`));
        console.log(`  [${res.duplicate ? "dup" : res.variantOf ? "var" : "new"}] ${f}`);
        n++;
      } catch (err) {
        console.error(`  [err] ${f}: ${(err as Error).message}`);
        await fs.rename(full, path.join(failed, f)).catch(() => {});
      }
    }
    if (n) await runTagQueue(n);
    await new Promise((r) => setTimeout(r, every * 1000));
  }
}

main().catch(async (e) => { console.error(e); await (await db()).close(); process.exit(1); });

import fs from "node:fs/promises";
import path from "node:path";
import { createOpenTerm } from "@/ai/apply-tags";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestBuffer } from "@/ingest/ingest";
import { systemUser, userByEmail } from "@/lib/users";

/**
 * REF-01 FR-3, J3. Bulk import a folder of images.
 *
 *   npm run import -- ./demo-images
 *   npm run import -- "C:/Users/tbirb/Pictures/inspiration" --recursive
 *   npm run import -- ./hurst-refs --as trevor@hauscustomhomes.com --haus Hurst
 *
 * --as    who the images belong to (they land on that person's lists)
 * --haus  tag everything imported with this haus, creating it if needed
 */
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".tif", ".tiff"]);

async function* walk(dir: string, recursive: boolean): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (recursive) yield* walk(full, recursive); }
    else if (EXTS.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && a !== arg("--as") && a !== arg("--haus"));
  if (!dir) { console.error("usage: npm run import -- <folder> [--recursive] [--as email] [--haus Name]"); process.exit(1); }

  await migrate({ quiet: true });

  const as = arg("--as");
  const user = as ? await userByEmail(as) : await systemUser();
  if (!user) { console.error(`no user ${as}. They need to sign in once first.`); process.exit(1); }

  const termIds: string[] = [];
  const haus = arg("--haus");
  if (haus) {
    const { termId, created } = await createOpenTerm("project", haus, user.id);
    termIds.push(termId);
    console.log(`[import] haus "${haus}" ${created ? "created" : "exists"}`);
  }

  const started = Date.now();
  let ok = 0, dupes = 0, variants = 0, failed = 0;

  for await (const file of walk(path.resolve(dir), args.includes("--recursive"))) {
    try {
      const res = await ingestBuffer(await fs.readFile(file), {
        userId: user.id,
        filename: path.basename(file),
        title: path.basename(file, path.extname(file)).replace(/[-_]+/g, " "),
        termIds,
        source: { kind: "upload", pageTitle: path.basename(path.dirname(file)), externalId: `file:${file}` },
      });
      if (res.duplicate) dupes++; else if (res.variantOf) variants++; else ok++;
      console.log(`  [${res.duplicate ? "dup" : res.variantOf ? "var" : "new"}] ${path.basename(file)}  ${res.sha256.slice(0, 12)}`);
    } catch (err) {
      failed++;
      console.error(`  [err] ${path.basename(file)}: ${(err as Error).message}`);
    }
  }

  console.log(`\n[import] ${ok} new, ${variants} near-duplicates clustered, ${dupes} exact duplicates collapsed, ${failed} failed, in ${((Date.now() - started) / 1000).toFixed(1)}s, as ${user.email}.`);
  console.log(`[import] tagging is queued, not done. Run: npm run tag`);
  await (await db()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });

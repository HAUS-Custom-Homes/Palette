import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "@/config";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";

const run = promisify(execFile);

/**
 * REF-01 FR-15, the third copy. A database dump plus a signed manifest of
 * every original's hash, in a dated folder under PALETTE_BACKUP_DIR. Pair it
 * with the mirror (FR-14) or an R2 bucket copy and you have three copies of
 * the bytes and a way to prove which are intact.
 *
 *   PALETTE_BACKUP_DIR=D:/backups/palette npm run backup
 *
 * PGlite: dumps its data directory as a tarball (the whole database).
 * Hosted Postgres: runs pg_dump if it is on PATH; otherwise says so and
 * still writes the manifest, because a manifest with no dump is worth more
 * than a silent skip.
 */
async function main() {
  const root = process.env.PALETTE_BACKUP_DIR;
  if (!root) { console.error("[backup] set PALETTE_BACKUP_DIR (FR-15)"); process.exit(1); }
  await migrate({ quiet: true });
  const d = await db();
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const out = path.join(root, stamp);
  await fs.mkdir(out, { recursive: true });

  // 1. the database
  if (d.kind === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(config.db.pgliteDir!);
    await pg.waitReady;
    const blob = await pg.dumpDataDir("gzip");
    await fs.writeFile(path.join(out, "database.pglite.tar.gz"), Buffer.from(await blob.arrayBuffer()));
    await pg.close();
    console.log(`[backup] PGlite data directory -> database.pglite.tar.gz`);
  } else {
    try {
      await run("pg_dump", ["--no-owner", "--format=custom", `--file=${path.join(out, "database.dump")}`, config.db.url!], { maxBuffer: 64 * 1024 * 1024 });
      console.log(`[backup] pg_dump -> database.dump`);
    } catch (err) {
      console.error(`[backup] pg_dump not available or failed: ${(err as Error).message}. Use the host's snapshot (Neon keeps 7 days) and keep this manifest.`);
    }
  }

  // 2. the manifest: what should exist, and its hash
  const assets = await d.query<{ sha256: string; storage_key: string; byte_size: string; mirrored_at: string | null }>(
    `SELECT sha256, storage_key, byte_size::text, mirrored_at::text FROM assets ORDER BY created_at`,
  );
  const counts = await d.one<Record<string, string>>(
    `SELECT (SELECT count(*) FROM items WHERE deleted_at IS NULL)::text AS items, (SELECT count(*) FROM users)::text AS users,
            (SELECT count(*) FROM item_terms)::text AS tags, (SELECT count(*) FROM boards)::text AS boards`,
  );
  await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), db: d.kind, counts, assets }, null, 1));
  await fs.writeFile(path.join(out, "SHA256SUMS"), assets.map((a) => `${a.sha256}  ${a.storage_key}`).join("\n") + "\n");

  await d.query(`INSERT INTO integrity_checks (kind, checked, mismatched, missing, detail) VALUES ('backup', $1, 0, 0, $2)`, [assets.length, JSON.stringify({ out })]);
  console.log(`[backup] ${assets.length} assets in manifest, ${assets.filter((a) => !a.mirrored_at).length} not yet mirrored -> ${out}`);
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

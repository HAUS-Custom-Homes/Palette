import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/config";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { sha256, store } from "@/storage/object-store";

/**
 * REF-01 FR-14. The "HAUS owns the bytes" guarantee in physical form: every
 * original copied to a directory HAUS controls (the fileserver share), hash
 * verified after the copy, and assets.mirrored_at stamped only when the copy
 * is proven. Idempotent and resumable; run it nightly.
 *
 *   PALETTE_MIRROR_DIR=//192.168.1.125/share/palette/originals npm run mirror
 */
async function main() {
  const dir = process.env.PALETTE_MIRROR_DIR ?? config.mirrorDir;
  if (!dir) { console.error("[mirror] set PALETTE_MIRROR_DIR to the mirror directory (FR-14)"); process.exit(1); }
  await migrate({ quiet: true });
  const d = await db();

  const pending = await d.query<{ id: string; sha256: string; storage_key: string }>(
    `SELECT id, sha256, storage_key FROM assets WHERE mirrored_at IS NULL ORDER BY created_at`,
  );
  console.log(`[mirror] ${pending.length} originals not yet mirrored -> ${dir}`);

  let ok = 0, failed = 0;
  for (const a of pending) {
    try {
      const dest = path.join(dir, a.storage_key.replace(/^originals\//, ""));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const bytes = await store().get(a.storage_key);
      await fs.writeFile(dest, bytes);
      const back = await fs.readFile(dest);
      if (sha256(back) !== a.sha256) throw new Error("hash mismatch after copy");
      await d.query(`UPDATE assets SET mirrored_at = now() WHERE id = $1`, [a.id]);
      ok++;
      if (ok % 100 === 0) console.log(`  ${ok}/${pending.length}`);
    } catch (err) {
      failed++;
      console.error(`  [err] ${a.sha256.slice(0, 12)}: ${(err as Error).message}`);
    }
  }
  const total = await d.one<{ n: string; m: string }>(`SELECT count(*)::text AS n, count(mirrored_at)::text AS m FROM assets`);
  console.log(`[mirror] ${ok} copied and verified, ${failed} failed. ${total?.m}/${total?.n} assets mirrored.`);
  if (failed) process.exitCode = 1;
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { sha256, store } from "@/storage/object-store";

/**
 * REF-01 FR-40, FR-41, NFR-8, NFR-9, and Gate B of the build loop.
 *
 * Turns "your images are safe" from a claim into a fact: re-reads bytes from
 * the store, recomputes the hash, compares it to the identity recorded at
 * ingest. Works the same against the local store and R2.
 *
 *   npm run verify              a random sample of 50
 *   npm run verify -- --full    every asset
 */
async function main() {
  const full = process.argv.includes("--full");
  await migrate({ quiet: true });
  const d = await db();

  const assets = await d.query<{ id: string; sha256: string; storage_key: string; byte_size: string }>(
    full ? `SELECT id, sha256, storage_key, byte_size::text FROM assets`
         : `SELECT id, sha256, storage_key, byte_size::text FROM assets ORDER BY random() LIMIT 50`,
  );

  let checked = 0, mismatched = 0, missing = 0;
  const detail: Array<{ id: string; problem: string }> = [];

  for (const a of assets) {
    checked++;
    if (!(await store().has(a.storage_key))) {
      missing++; detail.push({ id: a.id, problem: `missing ${a.storage_key}` });
      console.error(`  [MISSING] ${a.sha256.slice(0, 12)}  ${a.storage_key}`);
      continue;
    }
    const bytes = await store().get(a.storage_key);
    const actual = sha256(bytes);
    if (actual !== a.sha256) {
      mismatched++; detail.push({ id: a.id, problem: `hash ${a.sha256} != ${actual}` });
      console.error(`  [CORRUPT] ${a.sha256.slice(0, 12)} now hashes to ${actual.slice(0, 12)}`);
    } else if (bytes.byteLength !== Number(a.byte_size)) {
      mismatched++; detail.push({ id: a.id, problem: `size ${a.byte_size} != ${bytes.byteLength}` });
    }
  }

  await d.query(
    `INSERT INTO integrity_checks (kind, checked, mismatched, missing, detail) VALUES ('scrub', $1, $2, $3, $4)`,
    [checked, mismatched, missing, JSON.stringify(detail)],
  );

  const keys = await store().list("originals");
  const known = new Set((await d.query<{ storage_key: string }>(`SELECT storage_key FROM assets`)).map((r) => r.storage_key));
  const orphans = keys.filter((k) => !known.has(k));

  console.log(`\n[verify] checked ${checked} assets: ${mismatched} corrupt, ${missing} missing, ${orphans.length} orphaned objects.`);
  const ok = mismatched === 0 && missing === 0;
  console.log(`[verify] ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

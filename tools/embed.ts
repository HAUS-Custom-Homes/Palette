import { embedder, embeddingsEnabled } from "@/ai/embedder";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { embedItem, embeddingStats } from "@/search/vectors";

/**
 * FR-17 Layer A backfill. Embeds every item that has no vector under the
 * current model. First run downloads the CLIP weights (~350MB) into
 * data/models; after that it is ~200ms an image on CPU.
 *
 *   npm run embed
 *   npm run embed -- --limit 500
 */
async function main() {
  await migrate({ quiet: true });
  if (!embeddingsEnabled()) { console.log("[embed] PALETTE_EMBEDDINGS=off; nothing to do"); return; }

  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 100000;

  const e = embedder();
  const d = await db();
  const before = await embeddingStats();
  console.log(`[embed] model ${e.model}: ${before.embedded} embedded, ${before.pending} pending`);

  const pending = await d.query<{ id: string }>(
    `SELECT i.id FROM items i
      WHERE i.deleted_at IS NULL AND i.variant_of IS NULL
        AND NOT EXISTS (SELECT 1 FROM embeddings x WHERE x.item_id = i.id AND x.model = $1)
      ORDER BY i.captured_at DESC LIMIT $2`,
    [e.model, limit],
  );

  const started = Date.now();
  let ok = 0, failed = 0;
  for (const { id } of pending) {
    try { await embedItem(id, e); ok++; }
    catch (err) { failed++; console.error(`  [err] ${id}: ${(err as Error).message}`); }
    if (ok % 25 === 0 && ok > 0) console.log(`  ${ok}/${pending.length}`);
  }
  const after = await embeddingStats();
  console.log(`[embed] ${ok} embedded, ${failed} failed, in ${((Date.now() - started) / 1000).toFixed(1)}s. Now ${after.embedded} embedded, ${after.pending} pending.`);
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

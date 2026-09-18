import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { queueDepth, requeue, runTagQueue } from "@/ingest/tag-worker";

/**
 * REF-01 FR-17, FR-20, NFR-12.
 *
 *   npm run tag                  process the queue
 *   npm run tag -- --all         re-queue every item, then process (FR-20)
 *   npm run tag -- --limit 200
 *
 * The re-tag path exists to be run in 2027 against a better model, and FR-19
 * is what makes running it safe.
 */
async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 50;

  await migrate({ quiet: true });

  if (args.includes("--all")) {
    const n = await requeue("all");
    console.log(`[tag] re-queued ${n} items. Human tags and rejections are untouched by this (FR-19).`);
  }

  console.log(`[tag] queue before:`, await queueDepth());
  const s = await runTagQueue(limit);
  console.log(`[tag] mode=${s.mode} processed=${s.processed} failed=${s.failed} quarantined=${s.quarantined} cost=$${s.costUsd.toFixed(4)}`);
  if (s.mode === "heuristic") {
    console.log(`[tag] No ANTHROPIC_API_KEY set, so the heuristic tagger ran. Set the key and run "npm run tag -- --all".`);
  }
  console.log(`[tag] queue after:`, await queueDepth());
  await (await db()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });

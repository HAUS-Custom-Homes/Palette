import { db } from "@/db/client";
import { migrate } from "@/db/migrate";

/**
 * First use of the process: apply the schema and its enforcement gates, seed
 * the vocabulary if the database has none, and on an always-on host start the
 * tag worker. Idempotent and memoised. migrate() throws if a trigger is
 * missing, so a database that reaches a request handler has already proven it
 * can enforce FR-11 and FR-19.
 *
 * The point of doing this here rather than in a deploy step: a fresh
 * deployment needs no command run against it. Set the variables, open the
 * URL, sign in.
 */
let booted: Promise<void> | null = null;

export function boot(): Promise<void> {
  if (!booted) booted = run().catch((e) => ((booted = null), Promise.reject(e)));
  return booted;
}

async function run() {
  await migrate({ quiet: true });

  const d = await db();
  const facets = await d.one<{ n: string }>(`SELECT count(*)::text AS n FROM taxonomy_facets`);
  if (Number(facets?.n ?? 0) === 0) {
    const { seedTaxonomy } = await import("@/taxonomy/seed");
    const r = await seedTaxonomy();
    console.log(`[boot] empty database: seeded ${r.facets} facets, ${r.terms} terms`);
  }

  // Serverless hosts cannot keep a timer alive, so they rely on after() and a
  // cron. An always-on container sets PALETTE_WORKER=1 and drains the queue
  // itself: retries, quarantine recovery and embedding all just happen.
  if (process.env.PALETTE_WORKER === "1") startWorker();
}

let worker: NodeJS.Timeout | null = null;
function startWorker() {
  if (worker) return;
  let running = false;
  worker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { runTagQueue } = await import("@/ingest/tag-worker");
      const s = await runTagQueue(10);
      if (s.processed || s.failed || s.quarantined) {
        console.log(`[worker] tagged ${s.processed}, failed ${s.failed}, quarantined ${s.quarantined}, $${s.costUsd.toFixed(4)}`);
      }
    } catch (e) {
      console.warn(`[worker] ${(e as Error).message}`);
    } finally {
      running = false;
    }
  }, 60_000);
  worker.unref?.();
  console.log("[boot] tag worker started (every 60s)");
}

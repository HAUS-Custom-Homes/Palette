import { config } from "@/config";
import { db } from "@/db/client";
import { applyTags } from "@/ai/apply-tags";
import { embeddingsEnabled } from "@/ai/embedder";
import { tagger, taggerMode } from "@/ai/tagger";
import { embedItem } from "@/search/vectors";
import { derivedKey, store } from "@/storage/object-store";

/**
 * REF-01 FR-5, FR-17, NFR-11, NFR-12.
 *
 * The asynchronous half of ingest. Capture acknowledges in under a second and
 * this catches up afterwards. Runs from three places: after() in the ingest
 * route, the Vercel cron, and `npm run tag`. The queue is in the database, so
 * any of them may pick up work the others left.
 *
 * A job that fails maxTagAttempts times is quarantined, not retried forever,
 * and shows up on its owner's "needs your attention" list. The bytes were
 * safe before tagging began, which is the entire point of tagging being a
 * separate job.
 */

export type TagRunSummary = { processed: number; failed: number; quarantined: number; costUsd: number; mode: "claude" | "heuristic" };

export async function runTagQueue(limit = 25): Promise<TagRunSummary> {
  const d = await db();
  const t = tagger();
  const mode = taggerMode();

  // Claim atomically so two workers (cron + after()) never tag the same item.
  const jobs = await d.query<{ id: string; payload: { itemId: string } }>(
    `UPDATE ingest_jobs SET state = 'running', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM ingest_jobs
         WHERE kind = 'tag' AND state IN ('queued','failed') AND attempts < $1
         ORDER BY created_at LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, payload`,
    [config.maxTagAttempts, limit],
  );

  let processed = 0, failed = 0, quarantined = 0, costUsd = 0;

  for (const job of jobs) {
    const itemId = job.payload.itemId;
    try {
      const row = await d.one<{ sha256: string; title: string | null; note: string | null; caption: string | null; board: string | null; url: string | null }>(
        `SELECT a.sha256, i.title, i.note,
                (SELECT caption_text FROM sources s WHERE s.item_id = i.id LIMIT 1) AS caption,
                (SELECT board_name FROM sources s WHERE s.item_id = i.id LIMIT 1) AS board,
                (SELECT source_url FROM sources s WHERE s.item_id = i.id LIMIT 1) AS url
           FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = $1`,
        [itemId],
      );
      if (!row) throw new Error(`item ${itemId} not found`);

      // Tag the 1600px derivative: what the model can see detail in, already
      // a format the API accepts, and never a 12MB original in a request.
      const image = await store().get(derivedKey(row.sha256, "detail"));
      const hint = [row.title, row.caption, row.board, row.url, row.note].filter(Boolean).join(" | ").slice(0, 500);

      const result = await t.tag(image, "image/webp", hint || undefined);
      await applyTags(itemId, result, t.name);
      costUsd += result.costUsd;

      // FR-17 Layer A. A missing vector degrades search, it does not lose an
      // image, so it never fails the tag job. `npm run embed` catches up.
      if (embeddingsEnabled()) {
        await embedItem(itemId).catch((e) => console.warn(`[embed] ${itemId}: ${(e as Error).message}`));
      }

      await d.query(
        `UPDATE ingest_jobs SET state = 'done', finished_at = now(), cost_usd = $1, last_error = NULL WHERE id = $2`,
        [result.costUsd, job.id],
      );
      processed++;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const cur = await d.one<{ attempts: number }>(`SELECT attempts FROM ingest_jobs WHERE id = $1`, [job.id]);
      const give_up = (cur?.attempts ?? 0) >= config.maxTagAttempts;
      await d.query(`UPDATE ingest_jobs SET state = $1, last_error = $2 WHERE id = $3`, [
        give_up ? "quarantined" : "failed", message, job.id,
      ]);
      if (give_up) quarantined++;
      else failed++;
    }
  }

  return { processed, failed, quarantined, costUsd, mode };
}

export async function queueDepth(): Promise<Record<string, number>> {
  const d = await db();
  const rows = await d.query<{ state: string; n: string }>(
    `SELECT state::text AS state, count(*)::text AS n FROM ingest_jobs WHERE kind = 'tag' GROUP BY state`,
  );
  return Object.fromEntries(rows.map((r) => [r.state, Number(r.n)]));
}

/** FR-20. Re-queue everything, a subset, or one item, under the current model. */
export async function requeue(which: "all" | "untagged" | { itemId: string } = "all"): Promise<number> {
  const d = await db();
  const ids =
    typeof which === "object"
      ? [{ id: which.itemId }]
      : await d.query<{ id: string }>(
          which === "untagged"
            ? `SELECT id FROM items WHERE deleted_at IS NULL
                 AND id NOT IN (SELECT DISTINCT item_id FROM item_terms WHERE source = 'ai')`
            : `SELECT id FROM items WHERE deleted_at IS NULL`,
        );

  await d.transaction(async (tx) => {
    for (const { id } of ids) {
      // An update on the stable dedupe key, so a re-tag never fans out into duplicate jobs.
      await tx.query(
        `INSERT INTO ingest_jobs (kind, state, dedupe_key, payload, attempts)
         VALUES ('tag', 'queued', $1, $2, 0)
         ON CONFLICT (dedupe_key) DO UPDATE SET state = 'queued', attempts = 0, last_error = NULL`,
        [`tag:${id}`, JSON.stringify({ itemId: id })],
      );
    }
  });
  return ids.length;
}

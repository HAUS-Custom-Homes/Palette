import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { derivedKey, store } from "@/storage/object-store";

/**
 * REF-01 FR-43. The only place bytes are ever deleted.
 *
 * Soft-deleted items older than the retention window are removed for real,
 * and an asset's objects go only when no remaining item references it. Runs
 * inside the one session flag that lets the FR-19 trigger allow a human tag
 * row to be deleted along with its item. Nothing else in the system sets it.
 *
 *   npm run purge                 dry run, lists what would go
 *   npm run purge -- --confirm    do it
 *   npm run purge -- --days 30    change the 90-day window
 */
async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const daysArg = args.indexOf("--days");
  const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 90;

  await migrate({ quiet: true });
  const d = await db();

  const doomed = await d.query<{ id: string; asset_id: string; sha256: string; storage_key: string; others: string }>(
    `SELECT i.id, i.asset_id, a.sha256, a.storage_key,
            (SELECT count(*) FROM items o WHERE o.asset_id = i.asset_id AND o.id <> i.id AND o.deleted_at IS NULL)::text AS others
       FROM items i JOIN assets a ON a.id = i.asset_id
      WHERE i.deleted_at IS NOT NULL AND i.deleted_at < now() - ($1 || ' days')::interval
      ORDER BY i.deleted_at`,
    [String(days)],
  );

  console.log(`[purge] ${doomed.length} items soft-deleted more than ${days} days ago${confirm ? "" : " (dry run; add --confirm)"}`);
  for (const x of doomed) console.log(`  ${x.id}  ${x.sha256.slice(0, 12)}  ${Number(x.others) ? "asset kept (other items use it)" : "asset and objects will go"}`);
  if (!confirm || !doomed.length) { await d.close(); return; }

  let items = 0, objects = 0;
  for (const x of doomed) {
    await d.transaction(async (tx) => {
      // The one sanctioned hard delete. See drizzle/triggers.sql.
      await tx.query(`SELECT set_config('palette.hard_delete', '1', true)`);
      await tx.query(`DELETE FROM items WHERE id = $1`, [x.id]);
      if (!Number(x.others)) await tx.query(`DELETE FROM assets WHERE id = $1`, [x.asset_id]);
      await tx.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, before) VALUES ('purge', 'item', $1, 'hard_deleted', $2)`, [x.id, JSON.stringify({ sha256: x.sha256 })]);
    });
    items++;
    if (!Number(x.others)) {
      await store().delete(x.storage_key);
      for (const v of ["thumb", "grid", "detail"]) await store().delete(derivedKey(x.sha256, v));
      objects++;
    }
  }
  console.log(`[purge] removed ${items} items and ${objects} assets' objects.`);
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

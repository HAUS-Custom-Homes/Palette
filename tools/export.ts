import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { store } from "@/storage/object-store";

/**
 * REF-01 FR-42. Everything, in a form that needs no Palette to read.
 *
 *   npm run export -- ./export-2026-09
 *
 * Produces originals/<sha>.<ext> for every asset, manifest.json (assets, items,
 * sources, tags, boards) and items.csv for a spreadsheet. Anti lock-in: if
 * Palette were retired tomorrow, this folder is the library.
 */
async function main() {
  const out = path.resolve(process.argv[2] ?? `./export-${new Date().toISOString().slice(0, 10)}`);
  await migrate({ quiet: true });
  const d = await db();
  await fs.mkdir(path.join(out, "originals"), { recursive: true });

  const assets = await d.query<{ id: string; sha256: string; storage_key: string; mime_type: string; byte_size: string; width: number | null; height: number | null }>(
    `SELECT id, sha256, storage_key, mime_type, byte_size::text, width, height FROM assets ORDER BY created_at`,
  );
  let copied = 0;
  for (const a of assets) {
    const ext = path.extname(a.storage_key) || ".bin";
    const dest = path.join(out, "originals", `${a.sha256}${ext}`);
    try { await fs.access(dest); continue; } catch { /* copy */ }
    await fs.writeFile(dest, await store().get(a.storage_key));
    copied++;
    if (copied % 100 === 0) console.log(`  ${copied}/${assets.length}`);
  }

  const items = await d.query(
    `SELECT i.id, a.sha256, i.title, i.note, i.caption_ai, i.captured_at::text AS captured_at, u.email AS saved_by,
            i.variant_of, i.deleted_at::text AS deleted_at
       FROM items i JOIN assets a ON a.id = i.asset_id LEFT JOIN users u ON u.id = i.created_by ORDER BY i.captured_at`,
  );
  const sources = await d.query(`SELECT item_id, kind::text AS kind, source_url, external_id, author_handle, caption_text, board_name, page_title, fetched_at::text AS fetched_at FROM sources`);
  const tags = await d.query(
    `SELECT it.item_id, f.key AS facet, t.slug, t.label, it.source::text AS source, it.confidence::float AS confidence, it.rejected, it.suggested
       FROM item_terms it JOIN taxonomy_terms t ON t.id = it.term_id JOIN taxonomy_facets f ON f.id = t.facet_id`,
  );
  const boards = await d.query(`SELECT b.id, b.name, b.description, b.is_private, array_agg(bi.item_id ORDER BY bi.position) AS item_ids FROM boards b LEFT JOIN board_items bi ON bi.board_id = b.id GROUP BY b.id`);
  const taxonomy = await d.query(`SELECT f.key AS facet, f.label AS facet_label, t.slug, t.label, t.synonyms, t.status::text AS status FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id ORDER BY f.sort_order, t.sort_order`);

  await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify({ exported_at: new Date().toISOString(), assets, items, sources, tags, boards, taxonomy }, null, 1));

  const byItem = new Map<string, string[]>();
  for (const t of tags as Array<{ item_id: string; facet: string; label: string; rejected: boolean; suggested: boolean }>) {
    if (t.rejected || t.suggested) continue;
    byItem.set(t.item_id, [...(byItem.get(t.item_id) ?? []), `${t.facet}:${t.label}`]);
  }
  const csv = ["id,sha256,file,title,caption,saved_by,captured_at,tags"];
  for (const i of items as Array<Record<string, string | null>>) {
    const a = assets.find((x) => x.sha256 === i.sha256)!;
    const q = (s: string | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    csv.push([i.id, i.sha256, `originals/${i.sha256}${path.extname(a.storage_key)}`, q(i.title), q(i.caption_ai), i.saved_by, i.captured_at, q((byItem.get(i.id!) ?? []).join("|"))].join(","));
  }
  await fs.writeFile(path.join(out, "items.csv"), csv.join("\n") + "\n");

  console.log(`[export] ${assets.length} originals (${copied} newly copied), ${items.length} items, ${tags.length} tags, ${boards.length} boards -> ${out}`);
  await d.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

import { db } from "@/db/client";

/**
 * REF-01 FR-26, lexical half.
 *
 * items.search_tsv is a generated column over the item's own text plus
 * search_extra. This function rebuilds search_extra for one item: tag labels,
 * their synonyms, and provenance text, so "master bath" finds primary-bath and
 * a board name finds every pin from that board. Called by every write path.
 */
export async function reindexItem(itemId: string): Promise<void> {
  const d = await db();

  const tags = await d.query<{ label: string; synonyms: string[] }>(
    `SELECT t.label, t.synonyms
       FROM item_terms it JOIN taxonomy_terms t ON t.id = it.term_id
      WHERE it.item_id = $1 AND it.rejected = false`,
    [itemId],
  );

  const src = await d.query<Record<string, string | null>>(
    `SELECT caption_text, board_name, section_name, page_title, author_handle
       FROM sources WHERE item_id = $1`,
    [itemId],
  );

  const extra = [
    ...tags.flatMap((t) => [t.label, ...(t.synonyms ?? [])]),
    ...src.flatMap((s) => Object.values(s).filter(Boolean) as string[]),
  ].join(" ");

  await d.query(`UPDATE items SET search_extra = $1 WHERE id = $2`, [extra, itemId]);
}

export async function reindexAll(): Promise<number> {
  const d = await db();
  const ids = await d.query<{ id: string }>(`SELECT id FROM items WHERE deleted_at IS NULL`);
  for (const { id } of ids) await reindexItem(id);
  return ids.length;
}

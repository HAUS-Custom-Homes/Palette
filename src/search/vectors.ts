import { db } from "@/db/client";
import { EMBED_MODEL, cosine, embedder, embeddingsEnabled, type Embedder } from "@/ai/embedder";
import { derivedKey, store } from "@/storage/object-store";

/**
 * REF-01 FR-17 Layer A, FR-26, FR-31.
 *
 * Vectors live in Postgres as real[] (portable to PGlite and hosted Postgres
 * alike) and are searched from an in-process index: a Float32Array matrix
 * loaded once and refreshed when a vector is written. Brute-force cosine over
 * 20,000 vectors of 512 floats is a few milliseconds; the library will be
 * years old before that is the slow part. When it is, the upgrade is pgvector
 * with an HNSW index on the same column, which docs/DEPLOY.md describes.
 */

type Entry = { itemId: string; v: Float32Array };

class VectorIndex {
  private entries: Entry[] = [];
  private model: string | null = null;
  private loaded: Promise<void> | null = null;

  private async load(model: string) {
    if (this.model === model && this.loaded) return this.loaded;
    this.model = model;
    this.loaded = (async () => {
      const d = await db();
      const rows = await d.query<{ item_id: string; vector: number[] }>(
        `SELECT e.item_id, e.vector FROM embeddings e
           JOIN items i ON i.id = e.item_id
          WHERE e.model = $1 AND i.deleted_at IS NULL AND i.variant_of IS NULL`,
        [model],
      );
      this.entries = rows.map((r) => ({ itemId: r.item_id, v: Float32Array.from(r.vector) }));
    })();
    return this.loaded;
  }

  async upsert(model: string, itemId: string, v: Float32Array) {
    await this.load(model);
    const i = this.entries.findIndex((e) => e.itemId === itemId);
    if (i >= 0) this.entries[i] = { itemId, v };
    else this.entries.push({ itemId, v });
  }

  async remove(itemId: string) {
    this.entries = this.entries.filter((e) => e.itemId !== itemId);
  }

  async nearest(model: string, q: Float32Array, limit: number, exclude?: string): Promise<Array<{ itemId: string; score: number }>> {
    await this.load(model);
    const scored: Array<{ itemId: string; score: number }> = [];
    for (const e of this.entries) {
      if (e.itemId === exclude) continue;
      scored.push({ itemId: e.itemId, score: cosine(q, e.v) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async size(model: string) {
    await this.load(model);
    return this.entries.length;
  }
}

const index = new VectorIndex();

/** Embed one item's detail derivative and store it. Idempotent per (item, model). */
export async function embedItem(itemId: string, e: Embedder = embedder()): Promise<void> {
  const d = await db();
  const row = await d.one<{ sha256: string }>(
    `SELECT a.sha256 FROM items i JOIN assets a ON a.id = i.asset_id WHERE i.id = $1`,
    [itemId],
  );
  if (!row) throw new Error(`item ${itemId} not found`);
  const bytes = await store().get(derivedKey(row.sha256, "detail"));
  const v = await e.embedImage(bytes);
  await d.query(
    `INSERT INTO embeddings (item_id, model, dim, vector) VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id, model) DO UPDATE SET vector = excluded.vector, dim = excluded.dim, created_at = now()`,
    [itemId, e.model, e.dim, Array.from(v)],
  );
  await index.upsert(e.model, itemId, v);
}

/** Items that look like this one. */
export async function similarByVector(itemId: string, limit = 12): Promise<Array<{ itemId: string; score: number }>> {
  // Needs only stored vectors, never the model, so it works even where the
  // model cannot run (PALETTE_EMBEDDINGS=off with vectors written elsewhere).
  const e = embedder();
  const d = await db();
  const row = await d.one<{ vector: number[] }>(
    `SELECT vector FROM embeddings WHERE item_id = $1 AND model = $2`,
    [itemId, e.model],
  );
  if (!row) return [];
  return index.nearest(e.model, Float32Array.from(row.vector), limit, itemId);
}

/**
 * Items that look like this sentence. The semantic half of hybrid search.
 *
 * CLIP text-to-image cosines sit in a narrow band: a true match is roughly
 * 0.25 to 0.35, an unrelated picture roughly 0.15 to 0.20. Without a floor
 * every query returns the whole library ranked, and "car on a road" matching
 * sixteen kitchens is not a search result, it is noise. The fake embedder has
 * no such band, so it gets no floor.
 */
const CLIP_FLOOR = 0.21;

export async function searchByText(query: string, limit = 60): Promise<Array<{ itemId: string; score: number }>> {
  if (!embeddingsEnabled() || !query.trim()) return [];
  const e = embedder();
  if ((await index.size(e.model)) === 0) return [];
  const floor = e.model === EMBED_MODEL ? CLIP_FLOOR : -Infinity;
  return (await index.nearest(e.model, await e.embedText(query), limit)).filter((r) => r.score >= floor);
}

/**
 * Reciprocal rank fusion. Two ranked lists in, one out. k = 60 is the usual
 * constant; it keeps a single top rank from dominating.
 */
export function fuse(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export async function embeddingStats(): Promise<{ model: string; embedded: number; pending: number }> {
  const d = await db();
  const e = embedder();
  const row = await d.one<{ embedded: string; pending: string }>(
    `SELECT (SELECT count(*) FROM embeddings WHERE model = $1)::text AS embedded,
            (SELECT count(*) FROM items i WHERE i.deleted_at IS NULL AND i.variant_of IS NULL
               AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.item_id = i.id AND e.model = $1))::text AS pending`,
    [e.model],
  );
  return { model: e.model, embedded: Number(row?.embedded ?? 0), pending: Number(row?.pending ?? 0) };
}

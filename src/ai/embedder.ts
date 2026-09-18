import { config } from "@/config";

/**
 * REF-01 FR-17 Layer A. Image and text embeddings in one space, so a
 * sentence can find a picture and a picture can find its neighbours.
 *
 * One interface, two implementations:
 *   ClipEmbedder   CLIP ViT-B/32 via transformers.js, in-process, CPU. The
 *                  weights (~350MB) download from Hugging Face on first use
 *                  into data/models. No Python, no GPU, no API cost.
 *   FakeEmbedder   deterministic vectors from a hash of the input. For tests
 *                  and for machines that cannot reach the model. It preserves
 *                  the one property the pipeline depends on: identical input,
 *                  identical vector.
 *
 * Vectors are L2-normalised, so cosine similarity is a dot product.
 */
export interface Embedder {
  readonly model: string;
  readonly dim: number;
  embedImage(bytes: Buffer): Promise<Float32Array>;
  embedText(text: string): Promise<Float32Array>;
}

export const EMBED_MODEL = "Xenova/clip-vit-base-patch32";
export const EMBED_DIM = 512;

function normalise(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

class ClipEmbedder implements Embedder {
  readonly model = EMBED_MODEL;
  readonly dim = EMBED_DIM;
  private ready: Promise<{
    processor: (img: unknown) => Promise<unknown>;
    tokenizer: (t: string[], o: Record<string, unknown>) => unknown;
    vision: (x: unknown) => Promise<{ image_embeds: { data: Float32Array } }>;
    text: (x: unknown) => Promise<{ text_embeds: { data: Float32Array } }>;
    RawImage: { fromBlob(b: Blob): Promise<unknown> };
  }> | null = null;

  private load() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      // Dynamic import keeps the 200MB dependency out of every request that
      // does not embed anything, and out of the Edge bundle entirely.
      const tf = await import("@huggingface/transformers");
      tf.env.cacheDir = config.ai.modelDir;
      const [processor, tokenizer, vision, text] = await Promise.all([
        tf.AutoProcessor.from_pretrained(EMBED_MODEL),
        tf.AutoTokenizer.from_pretrained(EMBED_MODEL),
        tf.CLIPVisionModelWithProjection.from_pretrained(EMBED_MODEL, { dtype: "fp32" }),
        tf.CLIPTextModelWithProjection.from_pretrained(EMBED_MODEL, { dtype: "fp32" }),
      ]);
      return {
        processor: processor as unknown as (img: unknown) => Promise<unknown>,
        tokenizer: tokenizer as unknown as (t: string[], o: Record<string, unknown>) => unknown,
        vision: vision as unknown as (x: unknown) => Promise<{ image_embeds: { data: Float32Array } }>,
        text: text as unknown as (x: unknown) => Promise<{ text_embeds: { data: Float32Array } }>,
        RawImage: tf.RawImage as unknown as { fromBlob(b: Blob): Promise<unknown> },
      };
    })();
    return this.ready;
  }

  async embedImage(bytes: Buffer): Promise<Float32Array> {
    const m = await this.load();
    const img = await m.RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
    const out = await m.vision(await m.processor(img));
    return normalise(out.image_embeds.data);
  }

  async embedText(text: string): Promise<Float32Array> {
    const m = await this.load();
    const out = await m.text(m.tokenizer([text], { padding: true, truncation: true }));
    return normalise(out.text_embeds.data);
  }
}

/** Deterministic, cheap, and honest about being fake. */
export class FakeEmbedder implements Embedder {
  readonly model = "fake-v1";
  readonly dim = EMBED_DIM;
  private vec(seed: string): Float32Array {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out = new Float32Array(this.dim);
    for (let i = 0; i < this.dim; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out[i] = ((h >>> 0) % 2000) / 1000 - 1; }
    return normalise(out);
  }
  async embedImage(bytes: Buffer) { return this.vec("img:" + bytes.subarray(0, 4096).toString("base64")); }
  async embedText(text: string) { return this.vec("txt:" + text.trim().toLowerCase()); }
}

let _embedder: Embedder | null = null;

export function embedder(): Embedder {
  if (_embedder) return _embedder;
  _embedder = config.ai.embeddings === "fake" ? new FakeEmbedder() : new ClipEmbedder();
  return _embedder;
}

export function embeddingsEnabled(): boolean {
  return config.ai.embeddings !== "off";
}

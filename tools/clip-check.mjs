// Proves CLIP runs on this machine and warms the model cache. Downloads the
// weights (~350MB) into data/models on first run. `node tools/clip-check.mjs`
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from "@huggingface/transformers";

env.cacheDir = process.env.PALETTE_MODEL_DIR ?? "./data/models";
const id = "Xenova/clip-vit-base-patch32";
const t0 = Date.now();
const [processor, tokenizer, vision, text] = await Promise.all([
  AutoProcessor.from_pretrained(id),
  AutoTokenizer.from_pretrained(id),
  CLIPVisionModelWithProjection.from_pretrained(id, { dtype: "fp32" }),
  CLIPTextModelWithProjection.from_pretrained(id, { dtype: "fp32" }),
]);
console.log(`[clip] models ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const file = process.argv[2] ?? "demo-images/kitchen-white-oak-island-real-photo.jpg";
const img = await RawImage.read(file);
const t1 = Date.now();
const iv = norm(Array.from((await vision(await processor(img))).image_embeds.data));
console.log(`[clip] image embedded in ${Date.now() - t1}ms, dim ${iv.length}`);
const emb = async (s) => norm(Array.from((await text(tokenizer([s], { padding: true, truncation: true }))).text_embeds.data));
for (const q of ["a kitchen with a wood island", "a bathroom shower", "a car on a road"]) {
  console.log(`  ${q.padEnd(30)} ${dot(iv, await emb(q)).toFixed(3)}`);
}

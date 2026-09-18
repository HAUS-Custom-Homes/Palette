import fs from "node:fs/promises";
import path from "node:path";
import { PROMPT_VERSION, TAXONOMY_VERSION } from "@/config";
import { GATE_THRESHOLDS } from "@/ai/gates";
import { loadTaxonomy, modelFacets } from "@/ai/tag-schema";
import { tagger } from "@/ai/tagger";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { slugify } from "@/taxonomy/seed-data";

/**
 * REF-01 FR-18, Gate A of the build loop. The acceptance test for the AI.
 *
 * A golden set lives in evals/golden/: images plus labels.csv with one row
 * per image per facet. The designer labels it; nobody else's opinion counts.
 * This runs the current tagger over it, scores precision and recall per
 * facet, compares to GATE_THRESHOLDS, and records the verdict in facet_gates,
 * which is what decides whether that facet's tags are applied or suggested.
 *
 *   npm run eval                    score and record
 *   npm run eval -- --dry           score only, record nothing
 *   npm run eval -- --limit 50
 *
 * labels.csv columns: file,facet,terms   (terms pipe-separated slugs or labels)
 *   kitchen-01.jpg,image_type,real photo
 *   kitchen-01.jpg,space,kitchen
 *   kitchen-01.jpg,material,white oak|marble|brass
 */
type Label = { file: string; facet: string; terms: Set<string> };

async function readLabels(dir: string): Promise<Map<string, Label[]>> {
  const text = await fs.readFile(path.join(dir, "labels.csv"), "utf8");
  const byFile = new Map<string, Label[]>();
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || i === 0) continue;
    const [file, facet, terms] = line.split(",").map((s) => s.trim());
    if (!file || !facet) continue;
    const set = new Set((terms ?? "").split("|").map((t) => slugify(t)).filter(Boolean));
    byFile.set(file, [...(byFile.get(file) ?? []), { file, facet, terms: set }]);
  }
  return byFile;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
  const dir = path.resolve(process.env.PALETTE_GOLDEN_DIR ?? "evals/golden");

  await migrate({ quiet: true });
  const labels = await readLabels(dir).catch(() => null);
  if (!labels || labels.size === 0) {
    console.error(`[eval] no golden set at ${dir}/labels.csv. See evals/README.md.`);
    process.exit(1);
  }

  const t = tagger();
  const facets = modelFacets(await loadTaxonomy());
  const files = [...labels.keys()].slice(0, limit);
  console.log(`[eval] ${files.length} labelled images, tagger ${t.name}, prompt ${PROMPT_VERSION}, taxonomy v${TAXONOMY_VERSION}`);

  // Per facet: true positives, predicted, labelled.
  const acc = new Map<string, { tp: number; pred: number; gold: number; n: number }>();
  for (const f of facets) acc.set(f.key, { tp: 0, pred: 0, gold: 0, n: 0 });
  let cost = 0;

  for (const [i, file] of files.entries()) {
    const bytes = await fs.readFile(path.join(dir, file));
    const mime = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
    const res = await t.tag(bytes, mime);
    cost += res.costUsd;
    for (const l of labels.get(file)!) {
      const a = acc.get(l.facet);
      if (!a) continue;
      const pred = new Set((res.facets[l.facet] ?? []).map((x) => x.term));
      a.n++;
      a.gold += l.terms.size;
      a.pred += pred.size;
      for (const p of pred) if (l.terms.has(p)) a.tp++;
    }
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${files.length}`);
  }

  const scores: Record<string, { precision: number; recall: number; threshold: number; passed: boolean; samples: number }> = {};
  console.log("\n  facet          precision  recall  threshold  verdict   n");
  for (const [facet, a] of acc) {
    if (a.n === 0) continue;
    const precision = a.pred ? a.tp / a.pred : 0;
    const recall = a.gold ? a.tp / a.gold : 0;
    const threshold = GATE_THRESHOLDS[facet] ?? 0.8;
    // Precision is the gate. A wrong tag misleads a filter; a missing one is
    // just a tag a human can add. Recall is reported so nobody hides behind
    // a cautious model that tags nothing.
    const passed = precision >= threshold && a.n >= 20;
    scores[facet] = { precision, recall, threshold, passed, samples: a.n };
    console.log(`  ${facet.padEnd(14)} ${precision.toFixed(3).padStart(9)}  ${recall.toFixed(3).padStart(6)}  ${threshold.toFixed(2).padStart(9)}  ${(passed ? "PASS" : a.n < 20 ? "too few" : "FAIL").padEnd(8)}  ${a.n}`);
  }
  console.log(`\n[eval] cost $${cost.toFixed(4)}${dry ? " (dry run, nothing recorded)" : ""}`);

  if (!dry) {
    const d = await db();
    await d.query(
      `INSERT INTO eval_runs (model, prompt_version, taxonomy_version, samples, scores, cost_usd) VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.name, PROMPT_VERSION, TAXONOMY_VERSION, files.length, JSON.stringify(scores), cost],
    );
    for (const [facet, s] of Object.entries(scores)) {
      await d.query(
        `INSERT INTO facet_gates (facet_key, model, passed, precision_, recall, threshold, samples, ran_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (facet_key, model) DO UPDATE SET passed = excluded.passed, precision_ = excluded.precision_,
           recall = excluded.recall, threshold = excluded.threshold, samples = excluded.samples, ran_at = now()`,
        [facet, t.name, s.passed, s.precision, s.recall, s.threshold, s.samples],
      );
    }
    await fs.mkdir("docs/evals", { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const md = [
      `# Eval ${stamp}`, "", `Model ${t.name}, prompt ${PROMPT_VERSION}, taxonomy v${TAXONOMY_VERSION}, ${files.length} images, cost $${cost.toFixed(4)}.`, "",
      "| facet | precision | recall | threshold | verdict | n |", "|---|---|---|---|---|---|",
      ...Object.entries(scores).map(([f, s]) => `| ${f} | ${s.precision.toFixed(3)} | ${s.recall.toFixed(3)} | ${s.threshold} | ${s.passed ? "PASS" : "FAIL"} | ${s.samples} |`),
    ].join("\n");
    await fs.writeFile(`docs/evals/RUN-${stamp}-${t.name.replace(/[^a-z0-9]+/gi, "-")}.md`, md + "\n");
    console.log(`[eval] recorded to facet_gates and docs/evals/RUN-${stamp}-*.md`);
    await d.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

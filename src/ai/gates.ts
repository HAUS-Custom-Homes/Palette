import { config } from "@/config";
import { db } from "@/db/client";

/**
 * REF-01 FR-18. Whether a model may *apply* tags on a facet, or only suggest.
 *
 * The PRD's rule: auto-tagging is not trusted until the gate passes. So with
 * no eval run at all, every facet is suggested. That is strict on purpose: a
 * tagging pass that is 70% right teaches people not to trust the filters,
 * which is worse than no tagging. PALETTE_TRUST_UNGATED=1 overrides it for a
 * library that has decided to live with that, and says so in the UI.
 */
export const GATE_THRESHOLDS: Record<string, number> = {
  image_type: 0.9,
  space: 0.85,
  element: 0.85,
  material: 0.8,
  style: 0.8,
  color: 0.75,
  attribute: 0.75,
};

export async function passedFacets(model: string): Promise<Set<string>> {
  if (config.ai.trustUngated) return new Set(["*"]);
  const d = await db();
  const rows = await d.query<{ facet_key: string }>(
    `SELECT facet_key FROM facet_gates WHERE model = $1 AND passed = true`,
    [model],
  );
  return new Set(rows.map((r) => r.facet_key));
}

export async function gateSummary(model: string) {
  const d = await db();
  const rows = await d.query<{ facet_key: string; passed: boolean; precision_: string | null; recall: string | null; threshold: string | null; samples: number; ran_at: string }>(
    `SELECT facet_key, passed, precision_::text, recall::text, threshold::text, samples, ran_at::text FROM facet_gates WHERE model = $1 ORDER BY facet_key`,
    [model],
  );
  return rows.map((r) => ({
    facet: r.facet_key, passed: r.passed, precision: r.precision_ ? Number(r.precision_) : null,
    recall: r.recall ? Number(r.recall) : null, threshold: r.threshold ? Number(r.threshold) : null, samples: r.samples, ranAt: r.ran_at,
  }));
}

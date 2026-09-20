import { z } from "zod";
import { db } from "@/db/client";

/**
 * REF-01 FR-17.
 *
 * The central claim of the tagging design: the model is never asked for free
 * text. A schema is generated from the live taxonomy, so the only tags it can
 * return are tags that already exist in the vocabulary. Anything it wants to
 * say beyond that goes into unmatched_suggestions, which is the single,
 * auditable channel by which the vocabulary is allowed to grow (FR-23).
 *
 * Facets with ai_tagged = false (the Haus facet) are never shown to the model
 * at all. Only a person knows which haus an image was saved for.
 */

export type LiveFacet = {
  key: string;
  label: string;
  isMulti: boolean;
  isOpen: boolean;
  aiTagged: boolean;
  guidance: string;
  terms: Array<{ slug: string; label: string; synonyms: string[] }>;
};

export async function loadTaxonomy(): Promise<LiveFacet[]> {
  const d = await db();
  const facets = await d.query<{
    id: string; key: string; label: string; is_multi: boolean; is_open: boolean;
    ai_tagged: boolean; guidance: string;
  }>(`SELECT id, key, label, is_multi, is_open, ai_tagged, guidance
        FROM taxonomy_facets ORDER BY sort_order`);

  const terms = await d.query<{ facet_id: string; slug: string; label: string; synonyms: string[] }>(
    `SELECT facet_id, slug, label, synonyms FROM taxonomy_terms
      WHERE status = 'active' ORDER BY slug`,
  );

  return facets.map((f) => ({
    key: f.key,
    label: f.label,
    isMulti: f.is_multi,
    isOpen: f.is_open,
    aiTagged: f.ai_tagged,
    guidance: f.guidance,
    terms: terms
      .filter((t) => t.facet_id === f.id)
      .map((t) => ({ slug: t.slug, label: t.label, synonyms: t.synonyms ?? [] })),
  }));
}

/** Only the facets the model is allowed to answer. */
export const modelFacets = (facets: LiveFacet[]) =>
  facets.filter((f) => f.aiTagged && f.terms.length > 0);

const tagEntry = <T extends [string, ...string[]]>(slugs: T) =>
  z.object({
    term: z.enum(slugs),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("How sure you are. Be honest: a low number is useful, a wrong high number is not."),
  });

/**
 * Every facet is modelled as an array even when its cardinality is one.
 * Cardinality is enforced in applyTags(), which is a better place for it: a
 * schema that forbids the model from expressing uncertainty just pushes the
 * guess somewhere we cannot see it.
 */
export function buildTagSchema(all: LiveFacet[]) {
  const facets = modelFacets(all);
  const shape: Record<string, z.ZodTypeAny> = {
    caption: z.string().describe("One plain sentence describing the image as a builder would say it."),
    // FR-24. The model is already looking at the image, so reading the words in
    // it costs a few output tokens rather than an OCR dependency. This is what
    // makes a screenshot of a paint name or a product label findable.
    visible_text: z
      .string()
      .describe(
        "Words legibly printed or written in the image, verbatim: product and colour names, brand, " +
          "model numbers, dimensions, sign or label text. Separate distinct pieces with ' | '. " +
          "Empty string when there is none. Never describe; only transcribe.",
      ),
  };

  for (const f of facets) {
    shape[f.key] = z
      .array(tagEntry(f.terms.map((t) => t.slug) as [string, ...string[]]))
      .describe(
        f.isMulti
          ? `${f.label}. Zero or more. Omit rather than guess.`
          : `${f.label}. Return exactly one, the single best answer.`,
      );
  }

  shape.unmatched_suggestions = z
    .array(
      z.object({
        facet: z.enum(facets.map((f) => f.key) as [string, ...string[]]),
        label: z.string().describe("The concept in plain words, lowercase."),
      }),
    )
    .describe(
      "Concepts clearly present in the image that the vocabulary above has no term for. " +
        "This is how the taxonomy grows, so use it when you mean it and leave it empty otherwise.",
    );

  return z.object(shape);
}

export type TagResult = {
  caption: string;
  /** Text read off the image (FR-24). Optional so other taggers need not supply it. */
  visibleText?: string;
  facets: Record<string, Array<{ term: string; confidence: number }>>;
  unmatched: Array<{ facet: string; label: string }>;
};

/**
 * The vocabulary block handed to the model. Deliberately the first thing in the
 * prompt and byte-identical on every call, so it sits in front of the cache
 * breakpoint and is read from cache rather than re-billed per image (FR-17).
 */
export function renderTaxonomyPrompt(all: LiveFacet[]): string {
  const lines: string[] = [
    "You are tagging a design reference image for a custom home builder's private library.",
    "",
    "Rules that matter more than coverage:",
    "  1. Only use terms from the vocabulary below. Never invent a term.",
    "  2. Omitting a facet is a valid and often correct answer. Do not fill every facet.",
    "  3. Confidence is a real number you mean, not a formality.",
    "  4. If you can see a concept clearly and no term fits, put it in unmatched_suggestions.",
    "",
    "VOCABULARY",
  ];
  for (const f of modelFacets(all)) {
    lines.push("", `## ${f.key} (${f.isMulti ? "zero or more" : "exactly one"})`);
    lines.push(f.terms.map((t) => t.slug).join(", "));
  }
  return lines.join("\n");
}

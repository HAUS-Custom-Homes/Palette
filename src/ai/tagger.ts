import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/config";
import {
  buildTagSchema,
  loadTaxonomy,
  modelFacets,
  renderTaxonomyPrompt,
  type LiveFacet,
  type TagResult,
} from "./tag-schema";

/**
 * REF-01 FR-17. One interface, two implementations.
 *
 * The interface is the point. Today it is Claude; tomorrow it could be a local
 * VLM, and the eval harness (FR-18) is what decides, not a preference.
 */
export interface Tagger {
  readonly name: string;
  tag(image: Buffer, mime: string, hint?: string): Promise<TagResult & { costUsd: number }>;
}

/** Per-million-token rates, Anthropic first-party API. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export class ClaudeTagger implements Tagger {
  readonly name: string;
  private client: Anthropic;
  private facetsCache: LiveFacet[] | null = null;

  constructor(private model: string = config.ai.model) {
    this.client = new Anthropic({ apiKey: config.ai.apiKey ?? undefined });
    this.name = model;
  }

  private async facets() {
    // Read once per process. A term added in the admin UI takes effect on the
    // next run, which is the right granularity for a batch job.
    if (!this.facetsCache) this.facetsCache = await loadTaxonomy();
    return this.facetsCache;
  }

  async tag(image: Buffer, mime: string, hint?: string) {
    const all = await this.facets();
    const schema = buildTagSchema(all);

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      // Classification against a fixed vocabulary. Low effort is the right
      // setting and the cheap one; raise it only if the eval says to.
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system: [
        {
          type: "text",
          text: renderTaxonomyPrompt(all),
          // Identical on every call and ahead of the per-image content, so it
          // is read from cache rather than re-billed. If
          // usage.cache_read_input_tokens stays 0, something upstream varies.
          cache_control: { type: "ephemeral" },
        },
        ...modelFacets(all)
          .filter((f) => f.guidance)
          .map((f) => ({ type: "text" as const, text: `${f.key}: ${f.guidance}` })),
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: normaliseMime(mime), data: image.toString("base64") } },
            { type: "text", text: hint ? `Tag this image. Context that may or may not be reliable: ${hint}` : "Tag this image." },
          ],
        },
      ],
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new Error("tagger returned no parseable output");

    const price = PRICES[this.model] ?? PRICES["claude-opus-5"];
    const u = response.usage;
    const cacheRead = (u as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
    const costUsd =
      ((u.input_tokens ?? 0) * price.input + (u.output_tokens ?? 0) * price.output + cacheRead * price.cacheRead) /
      1_000_000;

    return { ...shape(parsed, all), costUsd };
  }
}

function normaliseMime(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mime === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime)) return mime as "image/jpeg";
  return "image/webp"; // anything else was transcoded to webp before it got here
}

function shape(parsed: Record<string, unknown>, all: LiveFacet[]): TagResult {
  const out: TagResult = {
    caption: String(parsed.caption ?? ""),
    facets: {},
    unmatched: (parsed.unmatched_suggestions as TagResult["unmatched"]) ?? [],
  };
  for (const f of modelFacets(all)) {
    out.facets[f.key] = (parsed[f.key] as Array<{ term: string; confidence: number }>) ?? [];
  }
  return out;
}

/**
 * The no-key path. Scaffolding, not a fallback.
 *
 * Exists so the whole pipeline, the review queue, search and the UI are
 * exercisable without an API key. It reads filenames and hints, and it is
 * deliberately unashamed about being weak: every tag it emits carries low
 * confidence, which routes it straight into the review queue where a guess
 * belongs.
 */
export class HeuristicTagger implements Tagger {
  readonly name = "heuristic-v1";

  async tag(_image: Buffer, _mime: string, hint?: string) {
    const all = await loadTaxonomy();
    const text = (hint ?? "").toLowerCase();
    const out: TagResult["facets"] = {};

    for (const f of modelFacets(all)) {
      const hits: Array<{ term: string; confidence: number }> = [];
      for (const term of f.terms) {
        const needles = [term.slug.replace(/-/g, " "), term.label.toLowerCase(), ...term.synonyms];
        if (needles.some((n) => n.length > 2 && text.includes(n))) hits.push({ term: term.slug, confidence: 0.4 });
      }
      if (hits.length) out[f.key] = f.isMulti ? hits.slice(0, 6) : [hits[0]];
    }
    if (!out.image_type) out.image_type = [{ term: "real-photo", confidence: 0.3 }];

    return { caption: hint ? `Untagged reference (${hint.slice(0, 80)})` : "Untagged reference", facets: out, unmatched: [], costUsd: 0 };
  }
}

export function tagger(): Tagger {
  return config.ai.apiKey ? new ClaudeTagger() : new HeuristicTagger();
}

export function taggerMode(): "claude" | "heuristic" {
  return config.ai.apiKey ? "claude" : "heuristic";
}

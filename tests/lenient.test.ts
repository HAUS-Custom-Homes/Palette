import { describe, expect, it } from "vitest";
import { lenient } from "@/ai/tagger";
import type { LiveFacet } from "@/ai/tag-schema";

/**
 * 2026-09-21: six of Trevor's first 49 pictures were quarantined because the
 * model named one material that is not in the vocabulary, and the strict parser
 * threw the whole answer away. One stray word must never cost a picture its tags.
 */
const facet = (key: string, slugs: string[], over: Partial<LiveFacet> = {}): LiveFacet => ({
  key, label: key, isMulti: true, isOpen: false, aiTagged: true, guidance: "",
  terms: slugs.map((slug) => ({ slug, label: slug, synonyms: [] })), ...over,
});
const all = [
  facet("material", ["marble", "brick"]),
  facet("space", ["kitchen"], { isMulti: false }),
  facet("project", ["hurst"], { isOpen: true, aiTagged: false }),
];

describe("the tagger's answer, held to the vocabulary", () => {
  it("keeps what is in the list and turns a stray term into a suggestion", () => {
    const out = lenient(JSON.stringify({
      caption: "A kitchen.",
      material: [{ term: "marble", confidence: 0.9 }, { term: "board-formed-concrete", confidence: 0.8 }],
      space: [{ term: "kitchen", confidence: 1.4 }],
      unmatched_suggestions: [{ facet: "material", label: "terrazzo" }],
    }), all)!;
    expect(out.material).toEqual([{ term: "marble", confidence: 0.9 }]);
    expect(out.space).toEqual([{ term: "kitchen", confidence: 1 }]);
    expect(out.unmatched_suggestions).toEqual([
      { facet: "material", label: "terrazzo" },
      { facet: "material", label: "board formed concrete" },
    ]);
    expect(out.caption).toBe("A kitchen.");
  });

  it("accepts a single answer that did not come as a list, and never suggests for the haus facet", () => {
    const out = lenient(JSON.stringify({
      space: { term: "kitchen", confidence: 0.7 },
      unmatched_suggestions: [{ facet: "project", label: "somebody's house" }],
    }), all)!;
    expect(out.space).toEqual([{ term: "kitchen", confidence: 0.7 }]);
    expect(out.material).toEqual([]);
    expect(out.unmatched_suggestions).toEqual([]);
  });

  it("is null for anything that is not a JSON object", () => {
    expect(lenient("Sorry, I cannot help with that.", all)).toBeNull();
    expect(lenient("[]", all)).toBeNull();
  });
});

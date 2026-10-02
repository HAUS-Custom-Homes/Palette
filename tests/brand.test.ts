import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { A_W, LOOKS, lockupSvg, markBody, setCaps, tileSvg, wordmark } from "../src/brand/mark";

describe("the Palette mark", () => {
  it("is the HAUS A: 100 tall, legs leaning 23.4 degrees", () => {
    expect(A_W).toBeCloseTo(2 * 100 * Math.tan((23.4 * Math.PI) / 180) + 22.65, 0);
  });

  it("cuts, seam and rivet are masks, so every variant sits on any ground", () => {
    for (const v of Object.keys(LOOKS) as (keyof typeof LOOKS)[]) {
      const body = markBody(v);
      expect(body).toContain(`clip-path="url(#pm-${v}-l)"`);
      expect(body).toContain(`clip-path="url(#pm-${v}-r)"`);
      expect(body).not.toMatch(/fill="#0a0a09"/);
    }
  });

  it("drops the swatch cuts and rivet below 48 px", () => {
    expect(markBody("simple")).not.toContain("<circle");
    expect(markBody("full")).toContain("<circle");
    expect(tileSvg("tiny", { size: 16 })).toContain('width="16"');
  });

  it("sets PALETTE with the roof A and refuses letters it has no outline for", () => {
    expect(wordmark().w).toBeGreaterThan(600);
    expect(() => setCaps("PALETTEX", 83, 200)).toThrow(/no outline/);
  });

  it("places the official HAUS lockup untouched, never the old wordmark files", () => {
    const svg = lockupSvg("dark", "/brand/haus-lockup-cream.png");
    expect(svg).toContain('href="/brand/haus-lockup-cream.png"');
    expect(svg).toContain('width="1957" height="796"');
    for (const f of fs.readdirSync("public/brand")) expect(f).not.toMatch(/haus_wordmark/);
  });
});

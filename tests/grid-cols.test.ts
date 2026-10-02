import { describe, expect, it } from "vitest";
import { colsForWidth, initialCols } from "../app/ui/grid-cols";

describe("library grid columns before the page's script runs", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

  it("draws what this browser measured last time", () => {
    expect(initialCols("3", desktop, null)).toBe(3);
    expect(initialCols("2", desktop, null)).toBe(2);
  });

  it("guesses 2 on a phone with no cookie, 4 elsewhere", () => {
    expect(initialCols(undefined, iphone, null)).toBe(2);
    expect(initialCols(undefined, desktop, "?1")).toBe(2);
    expect(initialCols(undefined, desktop, "?0")).toBe(4);
  });

  it("ignores a cookie it did not write", () => {
    expect(initialCols("40", iphone, null)).toBe(2);
    expect(initialCols("abc", desktop, null)).toBe(4);
  });

  it("matches what the browser measures", () => {
    expect(colsForWidth(366)).toBe(2);
    expect(colsForWidth(1000)).toBe(4);
    expect(colsForWidth(2400)).toBe(6);
  });
});

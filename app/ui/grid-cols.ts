/**
 * How many masonry columns the library grid has. The server cannot measure
 * the screen, and drawing 4 columns that the phone then redraws as 2 showed
 * four 84px slivers until the page's script ran, which on a slow phone is
 * seconds (2026-10-02). So the browser remembers the count it measured in a
 * cookie, and the server draws that count from the start. Before there is a
 * cookie, a phone's user agent means 2.
 */
export const COLS_COOKIE = "palette.cols";

export function colsForWidth(w: number): number {
  return w < 520 ? 2 : Math.max(2, Math.min(6, Math.floor(w / 250)));
}

export function initialCols(cookie: string | undefined, userAgent: string, mobileHint: string | null): number {
  const n = Number(cookie);
  if (Number.isInteger(n) && n >= 2 && n <= 6) return n;
  return mobileHint === "?1" || /Mobi|Android|iPhone|iPod/i.test(userAgent) ? 2 : 4;
}

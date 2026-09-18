/** Host and device token live in extension storage, never in a page. */
export type Settings = { host: string; token: string };

export async function getSettings(): Promise<Settings> {
  const s = (await browser.storage.local.get(["host", "token"])) as Partial<Settings>;
  return { host: (s.host ?? "").replace(/\/+$/, ""), token: s.token ?? "" };
}

export async function setSettings(s: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await browser.storage.local.set({ ...cur, ...s, host: (s.host ?? cur.host).replace(/\/+$/, "") });
}

export function configured(s: Settings): boolean {
  return /^https?:\/\//.test(s.host) && s.token.startsWith("plt_");
}

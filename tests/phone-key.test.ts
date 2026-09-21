import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { createDeviceToken, resolveDeviceToken, upsertUser } from "@/lib/users";

/**
 * A key is pasted by hand into an iPhone Shortcut. The first real attempt
 * (2026-09-20) was turned away, so the server now accepts the key however it
 * was wrapped, and still refuses anything that is not the key.
 */
let userId: string;
let token: string;

beforeAll(async () => {
  await migrate({ quiet: true });
  userId = (await upsertUser({ email: "trevor@hauscustomhomes.com", name: "Trevor" })).id;
  token = (await createDeviceToken(userId, "iPhone")).token;
});

afterAll(async () => { await (await db()).close(); });

describe("a phone's key", () => {
  it("is accepted however it was pasted", async () => {
    for (const pasted of [
      token,
      `Bearer ${token}`,
      `bearer ${token}`,
      `Bearer Bearer ${token}`,
      `Bearer ${token}\n`,
      `  Bearer  ${token}  `,
      `"Bearer ${token}"`,
      `Bearer ${token.replace(/^plt_/, "Plt_")}`,
    ]) {
      expect((await resolveDeviceToken(pasted))?.id, JSON.stringify(pasted)).toBe(userId);
    }
  });

  it("is still refused when it is wrong, cut short, or revoked", async () => {
    expect(await resolveDeviceToken(`Bearer ${token.slice(0, -3)}xyz`)).toBeNull();
    expect(await resolveDeviceToken(`Bearer ${token.slice(0, 12)}`)).toBeNull();
    expect(await resolveDeviceToken("Bearer")).toBeNull();
    expect(await resolveDeviceToken("")).toBeNull();
    const d = await db();
    await d.query(`UPDATE device_tokens SET revoked_at = now() WHERE user_id = $1`, [userId]);
    expect(await resolveDeviceToken(`Bearer ${token}`)).toBeNull();
  });
});

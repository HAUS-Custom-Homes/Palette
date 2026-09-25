// The dev server an agent uses to look at the app: the same as `npm run dev`,
// but on ./data-test so it can never touch the ./data a person works with
// (CLAUDE.md). A first start on an empty ./data-test migrates and seeds by
// itself through boot(). Dev sign-in is on so the agent can get in.
//
// It also turns on what production has switched on, so an agent sees the
// pages people see: the one-tap iPhone Shortcut button only renders when
// PALETTE_SHORTCUT_URL is set, and on 2026-09-24 it shipped overlapping its
// text because no agent had ever looked at it.
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  PALETTE_DATA_DIR: "./data-test",
  PALETTE_DEV_AUTH: "1",
  PALETTE_SHORTCUT_URL: process.env.PALETTE_SHORTCUT_URL ?? "https://www.icloud.com/shortcuts/1a835b2674c8426f9be38ebdcd0f00be",
};
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3200"], { env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
next.on("exit", (code) => process.exit(code ?? 0));

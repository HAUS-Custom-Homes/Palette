// The dev server an agent uses to look at the app: the same as `npm run dev`,
// but on ./data-test so it can never touch the ./data a person works with
// (CLAUDE.md). A first start on an empty ./data-test migrates and seeds by
// itself through boot(). Dev sign-in is on so the agent can get in.
import { spawn } from "node:child_process";

const env = { ...process.env, PALETTE_DATA_DIR: "./data-test", PALETTE_DEV_AUTH: "1" };
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3200"], { env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
next.on("exit", (code) => process.exit(code ?? 0));

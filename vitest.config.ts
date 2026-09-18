import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    // Real Postgres (PGlite) in memory, and a throwaway object store.
    // Agents and tests never touch ./data. Carried straight from the Palette rule.
    env: { QUARRY_PGLITE: "memory", QUARRY_DATA_DIR: "./data-test", QUARRY_STORE_DRIVER: "local" },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

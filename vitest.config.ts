import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    // Real Postgres (PGlite) in memory, and a throwaway object store.
    // Agents and tests never touch ./data. Carried straight from the The HausBuch rule.
    env: { PALETTE_PGLITE: "memory", PALETTE_DATA_DIR: "./data-test", PALETTE_STORE_DRIVER: "local" },
    // The extension has its own runner and its own node_modules.
    exclude: ["extension/**", "node_modules/**", ".next/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

import path from "node:path";

/**
 * REF-01 NFR-13: every external dependency sits behind an interface and is
 * selected here. Production and development differ only in this file's inputs.
 *
 *   database   DATABASE_URL set   -> hosted Postgres (Neon, Vercel Postgres, ...)
 *              unset              -> PGlite, real Postgres in-process, on disk
 *   storage    PALETTE_STORE_DRIVER=r2 -> Cloudflare R2 (S3 API)
 *              local              -> filesystem under PALETTE_DATA_DIR
 *   sign-in    AUTH_GOOGLE_ID set -> Google, restricted to PALETTE_ALLOWED_DOMAIN
 *              unset + dev        -> a dev sign-in, refused in production
 */

const dataDir = path.resolve(process.env.PALETTE_DATA_DIR ?? "./data");
const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  dataDir,
  storeDir: path.join(dataDir, "store"),

  db: {
    url: process.env.DATABASE_URL || null,
    /** PGlite data directory. `memory` keeps it in RAM (tests). */
    pgliteDir: process.env.PALETTE_PGLITE === "memory" ? null : path.join(dataDir, "pg"),
  },

  storeDriver: (process.env.PALETTE_STORE_DRIVER ?? "local") as "local" | "r2",
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "palette",
    /** Seconds a signed asset URL stays valid (NFR-7). */
    signedUrlTtl: 600,
  },

  auth: {
    googleId: process.env.AUTH_GOOGLE_ID || null,
    googleSecret: process.env.AUTH_GOOGLE_SECRET || null,
    /** Only accounts on this Workspace domain may sign in. */
    allowedDomain: process.env.PALETTE_ALLOWED_DOMAIN || "hauscustomhomes.com",
    /** The first person to sign in becomes owner. Everyone after is editor. */
    devAuth: !isProd && process.env.PALETTE_DEV_AUTH === "1",
    secret:
      process.env.AUTH_SECRET ||
      (isProd ? null : "palette-development-secret-never-use-in-production"),
  },

  /** Shared secret Vercel Cron sends; see vercel.json. */
  cronSecret: process.env.CRON_SECRET || null,

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || null,
    /** REF-01 default. Do not downgrade without passing the FR-18 eval gate. */
    model: process.env.PALETTE_TAG_MODEL ?? "claude-opus-5",
    /**
     * FR-17 Layer A. clip: CLIP in-process via transformers.js (downloads
     * weights on first use). fake: deterministic vectors for tests. off: no
     * embeddings, search is lexical only.
     */
    embeddings: (process.env.PALETTE_EMBEDDINGS ?? "clip") as "clip" | "fake" | "off",
    modelDir: process.env.PALETTE_MODEL_DIR ?? path.join(dataDir, "models"),
  },

  /** FR-12 derivative sizes. */
  derivatives: { thumb: 256, grid: 640, detail: 1600 },

  /** FR-22 near-duplicate threshold, Hamming distance over 64-bit hashes. */
  nearDuplicateDistance: 10,

  /** FR-23 review queue threshold. Tags below this confidence need a human. */
  reviewConfidenceThreshold: 0.65,

  /** FR-5. Attempts before a tag job is quarantined and its owner is asked. */
  maxTagAttempts: 3,
} as const;

export const TAXONOMY_VERSION = 2;
export const PROMPT_VERSION = "tag-v1";

/** The user tools run as when nobody is signed in (imports, clips, cron). */
export const SYSTEM_USER_EMAIL = "system@palette.local";

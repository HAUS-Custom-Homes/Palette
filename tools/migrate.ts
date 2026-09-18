import { db } from "@/db/client";
import { migrate } from "@/db/migrate";

/**
 * Apply the schema and the enforcement triggers to whatever DATABASE_URL
 * points at. Run once against a new production database, and safe to run
 * again any time.
 *
 *   DATABASE_URL=postgres://... npm run migrate
 */
migrate()
  .then(async () => { console.log("[migrate] done"); await (await db()).close(); })
  .catch((e) => { console.error(e); process.exit(1); });

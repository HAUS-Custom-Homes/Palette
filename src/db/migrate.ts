import fs from "node:fs";
import path from "node:path";
import { SYSTEM_USER_EMAIL } from "@/config";
import { db } from "./client";

/**
 * Applies the schema and then the triggers, in that order and always both.
 *
 * The HausBuch learned this the hard way: triggers applied outside the migration
 * journal are easy to forget, and a database missing them looks fine until the
 * day something writes past a gate that was supposed to exist. So this runs on
 * every boot, it is idempotent, and it refuses to continue if a gate is absent.
 */
let migrated: Promise<void> | null = null;

export function migrate(opts: { quiet?: boolean } = {}): Promise<void> {
  if (!migrated) migrated = run(opts).catch((e) => ((migrated = null), Promise.reject(e)));
  return migrated;
}

async function run(opts: { quiet?: boolean }) {
  const d = await db();
  const root = path.resolve(process.cwd(), "drizzle");

  for (const f of ["0000_init.sql", "triggers.sql"]) {
    await d.exec(fs.readFileSync(path.join(root, f), "utf8"));
    if (!opts.quiet) console.log(`[migrate] applied ${f} (${d.kind})`);
  }

  const gates = await d.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_trigger
      WHERE tgname IN ('item_terms_protect_human_update',
                       'item_terms_protect_human_delete',
                       'assets_immutable',
                       'terms_require_author')
        AND NOT tgisinternal`,
  );

  if (Number(gates?.n) !== 4) {
    throw new Error(
      `[migrate] expected 4 enforcement triggers, found ${gates?.n}. ` +
        `Without them FR-11 and FR-19 are unenforced. Refusing to continue.`,
    );
  }

  // The user that tools and cron act as. Never signs in, has no role above
  // editor, and exists so created_by is never null.
  await d.query(
    `INSERT INTO users (email, name, role) VALUES ($1, 'Palette tools', 'editor')
     ON CONFLICT (email) DO NOTHING`,
    [SYSTEM_USER_EMAIL],
  );

  if (!opts.quiet) console.log(`[migrate] 4/4 enforcement gates present`);
}

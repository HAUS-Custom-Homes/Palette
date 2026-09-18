import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/config";
import * as schema from "./schema";

/**
 * One Postgres, two ways to reach it.
 *
 *   DATABASE_URL set   -> postgres-js against hosted Postgres (production)
 *   unset              -> PGlite, real Postgres compiled to WASM, in-process,
 *                         persisted under data/pg (development), or in
 *                         memory (tests)
 *
 * Everything above this file speaks one small interface: query(), exec(),
 * transaction(). The two drivers differ in how they take parameters and
 * return rows, and that difference is contained here and nowhere else.
 */

export type Row = Record<string, unknown>;

export interface Query {
  /** Parameterised query, $1 $2 ... placeholders. Returns rows. */
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** One row or null. */
  one<T extends Row = Row>(text: string, params?: unknown[]): Promise<T | null>;
  /** Multi-statement DDL. No parameters. */
  exec(text: string): Promise<void>;
}

export interface Db extends Query {
  transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T>;
  /** Drizzle, for typed selects. Same connection. */
  orm: ReturnType<typeof drizzlePglite<typeof schema>> | ReturnType<typeof drizzlePostgres<typeof schema>>;
  close(): Promise<void>;
  readonly kind: "pglite" | "postgres";
}

let _db: Db | null = null;
let _init: Promise<Db> | null = null;

export function db(): Promise<Db> {
  if (_db) return Promise.resolve(_db);
  if (!_init) _init = open().then((d) => (_db = d));
  return _init;
}

async function open(): Promise<Db> {
  if (config.db.url) return openPostgres(config.db.url);
  return openPglite();
}

// ---------------------------------------------------------------------------

async function openPglite(): Promise<Db> {
  if (config.db.pgliteDir) fs.mkdirSync(config.db.pgliteDir, { recursive: true });
  const pg = config.db.pgliteDir ? new PGlite(config.db.pgliteDir) : new PGlite();
  await pg.waitReady;

  const wrap = (q: { query: PGlite["query"]; exec: PGlite["exec"] }): Query => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const r = await q.query<T>(text, params);
      return r.rows;
    },
    async one<T extends Row>(text: string, params: unknown[] = []): Promise<T | null> {
      const r = await q.query<T>(text, params);
      return (r.rows[0] as T | undefined) ?? null;
    },
    async exec(text: string) {
      await q.exec(text);
    },
  });

  const base = wrap(pg);
  return {
    ...base,
    kind: "pglite",
    orm: drizzlePglite(pg, { schema }),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

async function openPostgres(url: string): Promise<Db> {
  const sql = postgres(url, {
    max: config.isProd ? 5 : 2,
    // Serverless: connections are short-lived and idle ones should go away.
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  type Sql = typeof sql;
  const wrap = (s: Sql): Query => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      return (await s.unsafe(text, params as never)) as unknown as T[];
    },
    async one<T extends Row>(text: string, params: unknown[] = []): Promise<T | null> {
      const rows = (await s.unsafe(text, params as never)) as unknown as T[];
      return (rows[0] as T | undefined) ?? null;
    },
    async exec(text: string) {
      await s.unsafe(text);
    },
  });

  const base = wrap(sql);
  return {
    ...base,
    kind: "postgres",
    orm: drizzlePostgres(sql, { schema }),
    transaction: (fn) => sql.begin((tx) => fn(wrap(tx as unknown as Sql))) as Promise<never>,
    close: () => sql.end(),
  };
}

export { schema };

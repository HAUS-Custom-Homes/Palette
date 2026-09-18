import { migrate } from "@/db/migrate";

/**
 * The schema and its enforcement gates are applied on first use rather than by
 * a deploy step someone has to remember. migrate() is idempotent, memoised,
 * and throws if a trigger is missing, so a database that reaches a request
 * handler has already proven it can enforce FR-11 and FR-19.
 */
export function boot(): Promise<void> {
  return migrate({ quiet: true });
}

import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { ingestUrl } from "@/ingest/ingest";
import { systemUser, userByEmail } from "@/lib/users";

/**
 * REF-01 FR-4, command-line form of what the extension and the phone do.
 *
 *   npm run clip -- https://example.com/image.jpg
 *   npm run clip -- https://example.com/image.jpg --as trevor@hauscustomhomes.com
 */
async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith("http"));
  if (!url) { console.error("usage: npm run clip -- <image-url> [--as email]"); process.exit(1); }

  await migrate({ quiet: true });
  const asIdx = args.indexOf("--as");
  const user = asIdx >= 0 ? await userByEmail(args[asIdx + 1]) : await systemUser();
  if (!user) { console.error("unknown user"); process.exit(1); }

  const started = Date.now();
  const res = await ingestUrl(url, user.id, { kind: "web" });
  console.log(`[clip] ${res.duplicate ? "already in the library" : "saved"} in ${Date.now() - started}ms as ${user.email}\n       item ${res.itemId}\n       sha256 ${res.sha256}`);
  await (await db()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });

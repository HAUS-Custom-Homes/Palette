import { db } from "@/db/client";
import { migrate } from "@/db/migrate";
import { seedTaxonomy } from "@/taxonomy/seed";

/** `npm run seed`. The logic lives in src/taxonomy/seed.ts so first boot can use it too. */
async function main() {
  await migrate({ quiet: true });
  const r = await seedTaxonomy();
  console.log(`[seed] +${r.facetsAdded} facets, +${r.termsAdded} terms. Vocabulary now: ${r.facets} facets, ${r.terms} active terms.`);
  await (await db()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { taggerMode } from "@/ai/tagger";
import { config } from "@/config";
import { db } from "@/db/client";
import { queueDepth } from "@/ingest/tag-worker";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";
import { stats } from "@/search/query";
import { embeddingStats } from "@/search/vectors";

/**
 * REF-01 NFR-11, NFR-12. One page of truth about the library: counts, the
 * tag queue, embeddings, spend, and when the bytes were last proven intact.
 * The line the archivist reads (J7).
 */
export async function GET(req: NextRequest) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const d = await db();
  const [s, queue, emb, integrity, spend] = await Promise.all([
    stats(user.id),
    queueDepth(),
    embeddingStats().catch(() => null),
    d.one<{ kind: string; checked: number; mismatched: number; missing: number; ran_at: string }>(
      `SELECT kind, checked, mismatched, missing, ran_at::text FROM integrity_checks WHERE kind = 'scrub' ORDER BY ran_at DESC LIMIT 1`,
    ),
    d.one<{ month: string; all: string }>(
      `SELECT coalesce(sum(cost_usd) FILTER (WHERE finished_at > date_trunc('month', now())), 0)::text AS month,
              coalesce(sum(cost_usd), 0)::text AS "all" FROM ingest_jobs`,
    ),
  ]);

  return NextResponse.json({
    ok: true,
    database: d.kind,
    storage: config.storeDriver,
    tagger: taggerMode() === "claude" ? config.ai.model : "heuristic-v1",
    embeddings: emb,
    library: { items: s.items, assets: s.assets, bytes: s.bytes, people: s.people, humanTags: s.humanTags, nearDuplicates: s.variants },
    tagQueue: queue,
    review: { needsReview: s.needsReview, proposedTerms: s.proposed },
    lastIntegrityScrub: integrity,
    aiSpendUsd: { thisMonth: Number(spend?.month ?? 0), allTime: Number(spend?.all ?? 0) },
  });
}

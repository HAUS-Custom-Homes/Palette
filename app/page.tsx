import Link from "next/link";
import { requireUser } from "@/auth";
import { taggerMode } from "@/ai/tagger";
import { redirect } from "next/navigation";
import { createBoard, listBoards } from "@/boards/boards";
import { Grid } from "./ui/grid";
import { boot } from "@/lib/boot";
import { queueDepth } from "@/ingest/tag-worker";
import { facetCounts, search, stats, type SearchParams } from "@/search/query";
import { Nav } from "./ui/nav";
import { UploadZone } from "./ui/upload-zone";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

/** REF-01 FR-27: filter state lives in the URL, so a search is a link. */
function parse(q: Query, facetKeys: string[], userId: string): SearchParams {
  const facets: Record<string, string[]> = {};
  for (const key of facetKeys) {
    const v = q[key];
    const raw = Array.isArray(v) ? v.join(",") : v;
    if (raw) facets[key] = raw.split(",").filter(Boolean);
  }
  return {
    q: typeof q.q === "string" ? q.q : undefined,
    facets,
    reviewOnly: q.review === "1",
    ownerId: q.mine === "1" ? userId : undefined,
    limit: 120,
  };
}

function hrefWith(current: SearchParams, patch: { facetKey?: string; slug?: string; mine?: boolean; review?: boolean }) {
  const next = { ...current.facets };
  if (patch.facetKey && patch.slug) {
    const on = next[patch.facetKey]?.includes(patch.slug);
    next[patch.facetKey] = on
      ? (next[patch.facetKey] ?? []).filter((s) => s !== patch.slug)
      : [...(next[patch.facetKey] ?? []), patch.slug];
  }
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  const review = patch.review ?? current.reviewOnly;
  const mine = patch.mine ?? Boolean(current.ownerId);
  if (review) params.set("review", "1");
  if (mine) params.set("mine", "1");
  for (const [k, v] of Object.entries(next)) if (v.length) params.set(k, v.join(","));
  const s = params.toString();
  return s ? `/?${s}` : "/";
}

async function saveSearch(formData: FormData) {
  "use server";
  const u = await requireUser();
  const filter = JSON.parse(String(formData.get("filter") ?? "{}")) as Record<string, unknown>;
  const id = await createBoard(u.id, String(formData.get("name") ?? "Saved search"), "Smart board: updates as the library grows.", filter);
  redirect(`/boards/${id}`);
}

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  await boot();
  const user = await requireUser();
  const sp = await searchParams;

  const allFacets = await facetCounts({});
  const params = parse(sp, allFacets.map((f) => f.key), user.id);

  const [counts, { items, total }, s, queue, boards] = await Promise.all([
    facetCounts(params), search(params), stats(user.id), queueDepth(), listBoards(user.id),
  ]);
  const mode = taggerMode();
  const pending = (queue.queued ?? 0) + (queue.failed ?? 0) + (queue.running ?? 0);
  const mine = Boolean(params.ownerId);
  const anyFilter = Boolean(params.q || params.reviewOnly || mine || Object.values(params.facets ?? {}).some((v) => v.length));
  const attention = s.myQuarantined + s.myReview;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <h1>Palette</h1>
          <p>HAUS reference library</p>
        </div>

        {counts.map((f) => (
          <div className="facet" key={f.key}>
            <h3>
              {f.label}
              {f.isOpen && <span className="hint"> · yours to grow</span>}
            </h3>
            <div className="chips">
              {f.terms.filter((t) => t.count > 0 || t.selected).slice(0, 16).map((t) => (
                <Link className="chip" key={t.slug} href={hrefWith(params, { facetKey: f.key, slug: t.slug })}
                      data-on={t.selected} data-zero={t.count === 0}>
                  {t.label} <span className="n">{t.count}</span>
                </Link>
              ))}
              {f.terms.every((t) => t.count === 0) && (
                <span className="hint">{f.isOpen ? "add one from any image" : "nothing tagged yet"}</span>
              )}
            </div>
          </div>
        ))}
      </aside>

      <main className="main">
        <Nav user={user} attention={attention} />

        <div className="topbar" style={{ top: 44 }}>
          <form style={{ flex: 1, display: "flex", gap: 10 }}>
            <input className="search" name="q" defaultValue={params.q ?? ""} autoComplete="off"
                   placeholder="Search: white oak kitchen, master bath, hurst..." />
            {Object.entries(params.facets ?? {}).map(([k, v]) => v.length ? <input key={k} type="hidden" name={k} value={v.join(",")} /> : null)}
            {mine && <input type="hidden" name="mine" value="1" />}
          </form>
          <Link className="btn" href={hrefWith(params, { mine: !mine })} data-primary={mine}>Mine</Link>
          <Link className="btn" href={hrefWith(params, { review: !params.reviewOnly })} data-primary={params.reviewOnly}>
            Review{s.needsReview > 0 ? ` (${s.needsReview})` : ""}
          </Link>
          {anyFilter && <Link className="btn" href="/">Clear</Link>}
          {anyFilter && !params.reviewOnly && !mine && (
            <form action={saveSearch}>
              <input type="hidden" name="filter" value={JSON.stringify({ q: params.q, facets: params.facets })} />
              <input type="hidden" name="name" value={[params.q, ...Object.values(params.facets ?? {}).flat()].filter(Boolean).join(", ").slice(0, 80) || "Saved search"} />
              <button className="btn" type="submit" title="A smart board that stays current with this filter">Save search</button>
            </form>
          )}
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <div className="stats">
            <span><b>{s.items}</b> items</span>
            <span><b>{(s.bytes / 1024 / 1024).toFixed(1)}</b> MB owned</span>
            <span><b>{s.people}</b> {s.people === 1 ? "person" : "people"}</span>
            <span><b>{s.humanTags}</b> human {s.humanTags === 1 ? "correction" : "corrections"}</span>
            <span><b>{s.variants}</b> near-{s.variants === 1 ? "duplicate" : "duplicates"} folded in</span>
            {pending > 0 && <span><b>{pending}</b> waiting to tag</span>}
          </div>
        </div>

        {attention > 0 && (
          <p className="notice" data-kind="attention">
            <b>{attention} of your images need you.</b>{" "}
            {s.myQuarantined > 0 && <>{s.myQuarantined} could not be tagged. </>}
            {s.myReview > 0 && <>{s.myReview} have tags the model was unsure about. </>}
            <Link href="/attention">Sort them out</Link>
          </p>
        )}

        {mode === "heuristic" && (
          <p className="notice">
            <b>Heuristic tagger.</b> No <code>ANTHROPIC_API_KEY</code> is set, so tags come from filenames and
            carry low confidence on purpose. Set the key for real vision tagging.
          </p>
        )}

        {sp.shared === "failed" && (
          <p className="notice" data-kind="attention"><b>That share did not save.</b> {String(sp.why ?? "")}</p>
        )}

        <UploadZone hauses={counts.find((f) => f.key === "project")?.terms ?? []} />

        {items.length === 0 ? (
          <div className="empty">
            <p>{anyFilter ? "Nothing matches." : "Nothing here yet."}</p>
            {!anyFilter && <p style={{ fontSize: 12 }}>Drop images above, or share one from your phone.</p>}
          </div>
        ) : (
          <>
            <p className="hint" style={{ padding: "4px 20px 0" }}>
              {total} {total === 1 ? "item" : "items"}{anyFilter ? " matching" : " in the library"}
            </p>
            <Grid items={items} boards={boards.map((b) => ({ id: b.id, name: b.name }))}
                  hauses={counts.find((f) => f.key === "project")?.terms ?? []} />
          </>
        )}
      </main>
    </div>
  );
}

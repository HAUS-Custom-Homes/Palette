import Link from "next/link";
import { requireUser } from "@/auth";
import { taggerMode } from "@/ai/tagger";
import { redirect } from "next/navigation";
import { createBoard, listBoards } from "@/boards/boards";
import { Grid } from "./ui/grid";
import { boot } from "@/lib/boot";
import { queueDepth } from "@/ingest/tag-worker";
import { facetCounts, search, stats, type SearchParams } from "@/search/query";
import { SearchIcon } from "./ui/icons";
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
    sinceDays: q.since === "7" ? 7 : q.since === "30" ? 30 : undefined,
    videoOnly: q.video === "1",
    nearColor: typeof q.near === "string" && /^#?[0-9a-f]{6}$/i.test(q.near) ? q.near : undefined,
    limit: 120,
  };
}

function hrefWith(current: SearchParams, patch: { facetKey?: string; slug?: string; mine?: boolean; review?: boolean; video?: boolean; since?: number | null; color?: string | null }) {
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
  const since = patch.since === undefined ? current.sinceDays : patch.since;
  const color = patch.color === undefined ? current.nearColor : patch.color;
  if (review) params.set("review", "1");
  if (mine) params.set("mine", "1");
  if (patch.video ?? current.videoOnly) params.set("video", "1");
  if (since) params.set("since", String(since));
  if (color) params.set("near", color.replace("#", ""));
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
  const anyFilter = Boolean(params.q || params.reviewOnly || mine || params.videoOnly || params.sinceDays || params.nearColor || Object.values(params.facets ?? {}).some((v) => v.length));
  const attention = s.myQuarantined + s.myReview;
  const hauses = counts.find((f) => f.key === "project")?.terms ?? [];

  return (
    <div>
      <Nav user={user} attention={attention} at="library" />
      <main className="page">
        <div className="hero">
          <h1>Every reference, <span>one place.</span></h1>
          <p>
            <b>{s.items.toLocaleString()}</b> {s.items === 1 ? "image" : "images"} · <b>{hauses.filter((h) => h.count > 0).length}</b> haus {hauses.filter((h) => h.count > 0).length === 1 ? "project" : "projects"} · <b>{s.people}</b> {s.people === 1 ? "person" : "people"}
            {pending > 0 && <> · <b>{pending}</b> waiting to tag</>}
          </p>
        </div>

        <form className="searchbar">
          <SearchIcon />
          <input className="search" name="q" defaultValue={params.q ?? ""} autoComplete="off"
                 placeholder="Search by what it looks like, a material, a paint name..." />
          <kbd>/</kbd>
          {Object.entries(params.facets ?? {}).map(([k, v]) => v.length ? <input key={k} type="hidden" name={k} value={v.join(",")} /> : null)}
          {mine && <input type="hidden" name="mine" value="1" />}
          {params.videoOnly && <input type="hidden" name="video" value="1" />}
          {params.sinceDays && <input type="hidden" name="since" value={String(params.sinceDays)} />}
          {params.nearColor && <input type="hidden" name="near" value={params.nearColor.replace("#", "")} />}
        </form>

        {/* Filter state is the URL (FR-27), so every pill is a link. The haus
            sits first and in full because it is the filter people reach for. */}
        <div className="filters">
          <Link className="chip" href="/" data-on={!anyFilter}>All</Link>
          {hauses.filter((h) => h.count > 0 || h.selected).slice(0, 6).map((h) => (
            <Link className="chip" key={h.slug} href={hrefWith(params, { facetKey: "project", slug: h.slug })} data-on={h.selected}>
              {h.label} <span className="n">{h.count}</span>
            </Link>
          ))}
          <Link className="chip" href={hrefWith(params, { mine: !mine })} data-on={mine}>Mine</Link>
          <Link className="chip" href={hrefWith(params, { since: params.sinceDays === 7 ? null : 7 })} data-on={params.sinceDays === 7}>New this week</Link>
          <Link className="chip" href={hrefWith(params, { video: !params.videoOnly })} data-on={Boolean(params.videoOnly)}>From video</Link>
          <Link className="chip" href={hrefWith(params, { review: !params.reviewOnly })} data-on={params.reviewOnly}>
            Review{s.needsReview > 0 && <span className="n">{s.needsReview}</span>}
          </Link>
          <span className="sep" />
          {counts.filter((f) => f.key !== "project").map((f) => {
            const picked = f.terms.filter((t) => t.selected);
            const live = f.terms.filter((t) => t.count > 0 || t.selected);
            return (
              <details className="fdrop" key={f.key}>
                <summary className="chip" data-on={picked.length > 0}>
                  {f.label}{picked.length > 0 && <span className="n">{picked.length}</span>}
                </summary>
                <div className="sheet">
                  {live.slice(0, 40).map((t) => (
                    <Link className="chip" key={t.slug} href={hrefWith(params, { facetKey: f.key, slug: t.slug })} data-on={t.selected}>
                      {t.label} <span className="n">{t.count}</span>
                    </Link>
                  ))}
                  {live.length === 0 && <span className="hint">Nothing tagged yet.</span>}
                </div>
              </details>
            );
          })}
          <form className="color-pick" title="Images whose main colours come near this one">
            {Object.entries(params.facets ?? {}).map(([k, v]) => v.length ? <input key={k} type="hidden" name={k} value={v.join(",")} /> : null)}
            {params.q && <input type="hidden" name="q" value={params.q} />}
            <input type="color" name="near" defaultValue={params.nearColor ? `#${params.nearColor.replace("#", "")}` : "#d4a868"} />
            <button className="chip" type="submit" data-on={Boolean(params.nearColor)}>Colour</button>
          </form>
          {anyFilter && !params.reviewOnly && !mine && (
            <form action={saveSearch}>
              <input type="hidden" name="filter" value={JSON.stringify({ q: params.q, facets: params.facets })} />
              <input type="hidden" name="name" value={[params.q, ...Object.values(params.facets ?? {}).flat()].filter(Boolean).join(", ").slice(0, 80) || "Saved search"} />
              <button className="chip" type="submit" title="A board that stays current with this filter">Save as board</button>
            </form>
          )}
        </div>

        {/* Only what stops someone using the library belongs above the pictures.
            Review counts live in the nav; a failed tagging is the one thing worth a line. */}
        {s.myQuarantined > 0 && (
          <p className="notice" data-kind="attention">
            <b>{s.myQuarantined} of your images could not be tagged.</b> <Link href="/attention">Have a look</Link>
          </p>
        )}

        {mode === "heuristic" && user.role === "owner" && (
          <p className="notice">
            <b>Smart tagging is off.</b> Images save and search by title, haus and notes. To have Palette describe and
            tag each image by itself, add an Anthropic API key in Railway (variable <code>ANTHROPIC_API_KEY</code>).
            Only you see this.
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
            <p className="hint" style={{ padding: "16px 2px 0", margin: 0 }}>
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

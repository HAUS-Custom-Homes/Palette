import Link from "next/link";
import { requireUser } from "@/auth";
import { taggerMode } from "@/ai/tagger";
import { passedFacets, trustModel } from "@/ai/gates";
import { config } from "@/config";
import { redirect } from "next/navigation";
import { createBoard, listBoards } from "@/boards/boards";
import { Grid } from "./ui/grid";
import { boot } from "@/lib/boot";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { after } from "next/server";
import { postsNeedingFullFetch, upgradePreviews } from "@/ingest/ingest";
import { queueDepth, requeue, runTagQueue } from "@/ingest/tag-worker";
import { facetCounts, search, stats, type SearchParams } from "@/search/query";
import { FilterIcon } from "./ui/icons";
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
  const id = await createBoard(u.id, String(formData.get("name") ?? "Saved search"), "Fills itself as the library grows.", filter);
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

  // Pictures saved before the key was in carry the stand-in tagger's guesses.
  // Asked only for the owner, and only once smart tagging is on.
  const roughlyTagged = mode === "claude" && user.role === "owner"
    ? Number((await (await db()).one<{ n: string }>(
        `SELECT count(DISTINCT it.item_id)::text AS n
           FROM item_terms it JOIN items i ON i.id = it.item_id
          WHERE it.source = 'ai' AND it.model_version LIKE 'heuristic%' AND i.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM ingest_jobs j
                             WHERE j.dedupe_key = 'tag:' || it.item_id::text AND j.state IN ('queued','running'))`,
        [],
      ))?.n ?? 0)
    : 0;

  // FR-18 as the owner sees it: until the model has passed a check on this
  // library's own pictures, its tags are suggestions. The owner may decide to
  // apply them anyway; the decision lives in the gate table (trustModel).
  const trusted = mode === "claude" ? (await passedFacets(config.ai.model)).has("*") : true;

  async function trustTagger() {
    "use server";
    const u = await requireUser();
    if (u.role !== "owner") return;
    await trustModel(config.ai.model, u.id);
    revalidatePath("/");
  }

  // Posts saved from a pasted link before Palette could fetch whole posts:
  // one preview-sized picture each. One button fetches them all, in the
  // background, one after another (about half a minute per post).
  const previews = user.role === "owner" ? await postsNeedingFullFetch() : 0;

  async function fetchPreviews() {
    "use server";
    const u = await requireUser();
    if (u.role !== "owner") return;
    after(() => upgradePreviews().then(() => runTagQueue(10)).catch((e) => console.warn(`[ingest] previews: ${(e as Error).message}`)));
    redirect("/?upgrading=1");
  }

  async function retagAll() {
    "use server";
    const u = await requireUser();
    if (u.role !== "owner") return;
    // FR-20: everything goes back on the queue under the current model. The
    // worker drains it a batch a minute; FR-19 keeps every human tag as it is.
    await requeue("all");
    revalidatePath("/");
  }

  const pending = (queue.queued ?? 0) + (queue.failed ?? 0) + (queue.running ?? 0);
  const mine = Boolean(params.ownerId);
  const anyFilter = Boolean(params.q || params.reviewOnly || mine || params.videoOnly || params.sinceDays || params.nearColor || Object.values(params.facets ?? {}).some((v) => v.length));
  const attention = s.myQuarantined + s.myReview;
  const hauses = counts.find((f) => f.key === "project")?.terms ?? [];
  const picked = Object.entries(params.facets ?? {}).filter(([k]) => k !== "project").reduce((n, [, v]) => n + v.length, 0)
    + (params.nearColor ? 1 : 0) + (params.reviewOnly ? 1 : 0);
  // What a new search must carry along: every filter in force except the words.
  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.facets ?? {})) if (v.length) keep[k] = v.join(",");
  if (mine) keep.mine = "1";
  if (params.videoOnly) keep.video = "1";
  if (params.sinceDays) keep.since = String(params.sinceDays);
  if (params.nearColor) keep.near = params.nearColor.replace("#", "");

  return (
    <div>
      <Nav user={user} attention={attention} at="library"
           search={<UploadZone hauses={hauses} q={params.q ?? ""} keep={keep} />} />
      <main className="page">
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
          <span className="spacer" />
          <span className="hint count">
            {total} {total === 1 ? "post" : "posts"}{anyFilter ? " matching" : ""}{pending > 0 && <> · tagging {pending}</>}
          </span>
          <details className="fpanel">
            <summary className="chip" data-on={picked > 0}><FilterIcon /> Filters{picked > 0 && <span className="n">{picked}</span>}</summary>
            <div className="sheet">
          {counts.filter((f) => f.key !== "project").map((f) => {
            const picked = f.terms.filter((t) => t.selected);
            const live = f.terms.filter((t) => t.count > 0 || t.selected);
            if (live.length === 0) return null;
            return (
              <div className="frow" key={f.key}>
                <span className="flabel">{f.label}</span>
                <div className="fchips">
                  {live.slice(0, picked.length ? 40 : 14).map((t) => (
                    <Link className="chip" key={t.slug} href={hrefWith(params, { facetKey: f.key, slug: t.slug })} data-on={t.selected}>
                      {t.label} <span className="n">{t.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
              <div className="frow">
                <span className="flabel">Colour</span>
                <div className="fchips">
          <form className="color-pick" title="Images whose main colours come near this one">
            {Object.entries(params.facets ?? {}).map(([k, v]) => v.length ? <input key={k} type="hidden" name={k} value={v.join(",")} /> : null)}
            {params.q && <input type="hidden" name="q" value={params.q} />}
            <input type="color" name="near" defaultValue={params.nearColor ? `#${params.nearColor.replace("#", "")}` : "#d4a868"} />
            <button className="chip" type="submit" data-on={Boolean(params.nearColor)}>Near this colour</button>
          </form>
                  {params.nearColor && <Link className="chip" href={hrefWith(params, { color: null })}>Clear</Link>}
                </div>
              </div>
              <div className="frow">
                <span className="flabel">Tags</span>
                <div className="fchips">
                  <Link className="chip" href={hrefWith(params, { review: !params.reviewOnly })} data-on={params.reviewOnly}>
                    Unsure tags{s.needsReview > 0 && <span className="n">{s.needsReview}</span>}
                  </Link>
                </div>
              </div>
            </div>
          </details>
          {anyFilter && !params.reviewOnly && !mine && (
            <form action={saveSearch}>
              <input type="hidden" name="filter" value={JSON.stringify({ q: params.q, facets: params.facets })} />
              <input type="hidden" name="name" value={[params.q, ...Object.values(params.facets ?? {}).flat()].filter(Boolean).join(", ").slice(0, 80) || "Saved search"} />
              <button className="chip" type="submit" title="A lookbook that stays current with this filter">Save as lookbook</button>
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

        {mode === "claude" && user.role === "owner" && roughlyTagged > 0 && (
          <form action={retagAll} className="notice">
            <b>Smart tagging is on.</b> {roughlyTagged} {roughlyTagged === 1 ? "picture was" : "pictures were"} tagged
            before it was, by a rough stand-in. Tags people set are never touched.{" "}
            <button className="btn" type="submit">Re-tag them</button>
          </form>
        )}

        {mode === "claude" && user.role === "owner" && !trusted && (
          <form action={trustTagger} className="notice">
            <b>Tags are shown as suggestions</b> until the model passes a check on your own pictures. Apply them straight
            away instead; anything wrong can be removed on the picture, and a removal is permanent.{" "}
            <button className="btn" type="submit">Apply tags automatically</button>
          </form>
        )}

        {previews > 0 && (
          <form action={fetchPreviews} className="notice">
            {sp.upgrading ? (
              <><b>Fetching {previews} {previews === 1 ? "post" : "posts"} in full.</b> About half a minute each. Reload to see them arrive.</>
            ) : (
              <>
                <b>{previews} {previews === 1 ? "post is" : "posts are"} still at preview size</b>, from before Palette could fetch whole posts.
                Fetch {previews === 1 ? "it" : "them"} again at full size, every picture, in the background.{" "}
                <button className="btn" type="submit">Fetch in full</button>
              </>
            )}
          </form>
        )}

        {sp.shared === "failed" && (
          <p className="notice" data-kind="attention"><b>That share did not save.</b> {String(sp.why ?? "")}</p>
        )}

        {items.length === 0 ? (
          <div className="empty">
            <p>{anyFilter ? "Nothing matches." : "Nothing here yet."}</p>
            {!anyFilter && <p style={{ fontSize: 12 }}>Paste a link in the box at the top, drop pictures anywhere, or <Link href="/install" style={{ color: "var(--accent)" }}>share from your phone</Link>.</p>}
          </div>
        ) : (
          <>
            <Grid items={items} boards={boards.filter((b) => !b.isSmart).map((b) => ({ id: b.id, name: b.name }))}
                  hauses={counts.find((f) => f.key === "project")?.terms ?? []} />
          </>
        )}
      </main>
    </div>
  );
}

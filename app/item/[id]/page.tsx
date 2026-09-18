import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setHumanTag } from "@/ai/apply-tags";
import { requireUser } from "@/auth";
import { addToBoard, boardsForItem, removeFromBoard } from "@/boards/boards";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { requeue, runTagQueue } from "@/ingest/tag-worker";
import { getItem, similar } from "@/search/query";
import { Nav } from "../../ui/nav";
import { AddTag } from "./add-tag";
import { HausPicker } from "./haus-picker";

export const dynamic = "force-dynamic";

type Tag = {
  facetKey: string; facetLabel: string; facetOpen: boolean; termId: string; slug: string; label: string;
  confidence: number | null; source: string; rejected: boolean; suggested: boolean; modelVersion: string | null; setByName: string | null;
};

/**
 * REF-01 FR-29, and the surface where FR-19 stops being an abstraction.
 * Every tag says who put it there. Removing an AI tag leaves a rejection that
 * no future model run can undo, and the page says so in plain words.
 */
export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await boot();
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const data = await getItem(id);
  if (!data) notFound();

  const item = data.item as Record<string, string | number | null>;
  const tags = data.tags as unknown as Tag[];
  const like = await similar(id, 8);

  const active = tags.filter((t) => !t.rejected && t.facetKey !== "project");
  const hausTags = tags.filter((t) => !t.rejected && t.facetKey === "project");
  const rejected = tags.filter((t) => t.rejected);

  const byFacet = new Map<string, Tag[]>();
  for (const t of active) byFacet.set(t.facetLabel, [...(byFacet.get(t.facetLabel) ?? []), t]);

  async function toggle(formData: FormData) {
    "use server";
    const u = await requireUser();
    const itemId = String(formData.get("itemId"));
    await setHumanTag(itemId, String(formData.get("termId")), String(formData.get("action")) as "add" | "remove", u.id);
    revalidatePath(`/item/${itemId}`);
  }

  async function retry(formData: FormData) {
    "use server";
    await requireUser();
    const itemId = String(formData.get("itemId"));
    await requeue({ itemId });
    await runTagQueue(1);
    revalidatePath(`/item/${itemId}`);
  }

  async function board(formData: FormData) {
    "use server";
    const u = await requireUser();
    const itemId = String(formData.get("itemId"));
    const boardId = String(formData.get("boardId"));
    if (!boardId) return;
    if (formData.get("action") === "remove") await removeFromBoard(boardId, itemId, u.id);
    else await addToBoard(boardId, itemId, u.id);
    revalidatePath(`/item/${itemId}`);
    revalidatePath(`/boards/${boardId}`);
  }

  const boards = await boardsForItem(id, user.id);

  const d = await db();
  const allTerms = await d.query<{ id: string; label: string; facetKey: string; facetLabel: string }>(
    `SELECT t.id, t.label, f.key AS "facetKey", f.label AS "facetLabel"
       FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
      WHERE t.status = 'active' AND f.key <> 'project' ORDER BY f.sort_order, t.label`,
  );
  const allHauses = await d.query<{ id: string; label: string }>(
    `SELECT t.id, t.label FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
      WHERE f.key = 'project' AND t.status = 'active' ORDER BY t.label`,
  );

  const bytes = Number(item.byteSize ?? 0);
  const job = data.job;
  const isMine = item.created_by === user.id;

  return (
    <div>
      <Nav user={user} />
      <div className="topbar" style={{ top: 44 }}>
        <Link className="btn" href="/">Back to library</Link>
        <span className="hint">{String(item.caption_ai ?? item.title ?? "untitled")}</span>
        {sp.shared && <span className="pill">saved from your phone</span>}
      </div>

      <div className="detail">
        <div>
          <img src={`/api/asset/${item.sha256}/detail`} alt={String(item.caption_ai ?? "")} />
          {like.length > 0 && (
            <div className="panel" style={{ marginTop: 14 }}>
              <h3>More like this</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {like.map((s) => (
                  <Link key={s.id} href={`/item/${s.id}`}>
                    <img src={`/api/asset/${s.sha256}/thumb`} alt="" className="thumb" />
                  </Link>
                ))}
              </div>
              <p className="hint" style={{ margin: "8px 0 0" }}>
                {like[0]?.how === "vector" ? "By what it looks like (CLIP)." : "By shared tags, until this image is embedded."}
              </p>
            </div>
          )}
        </div>

        <div>
          {job?.state === "quarantined" && (
            <div className="panel" data-kind="attention">
              <h3>Could not be tagged</h3>
              <p className="hint" style={{ marginTop: 0 }}>
                Three attempts failed{job.last_error ? `: ${job.last_error.slice(0, 160)}` : ""}. The image itself is
                safe. {isMine ? "It is yours, so it is on your list until you tag it by hand or retry." : ""}
              </p>
              <form action={retry}>
                <input type="hidden" name="itemId" value={id} />
                <button className="btn" type="submit">Retry tagging</button>
              </form>
            </div>
          )}

          <div className="panel">
            <h3>Boards</h3>
            {boards.on.map((b) => (
              <span className="tag" key={b.id} data-src="human">
                <Link href={`/boards/${b.id}`}>{b.name}</Link>
                <form action={board} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={id} />
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="action" value="remove" />
                  <button type="submit" title="Remove from board">×</button>
                </form>
              </span>
            ))}
            {boards.available.length > 0 ? (
              <form action={board} style={{ display: "flex", gap: 6, marginTop: boards.on.length ? 8 : 0 }}>
                <input type="hidden" name="itemId" value={id} />
                <select name="boardId" className="search" style={{ padding: "6px 8px", fontSize: 12 }} defaultValue="">
                  <option value="" disabled>add to board...</option>
                  {boards.available.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button className="btn" type="submit">add</button>
              </form>
            ) : boards.on.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>No boards yet. <Link href="/boards">Make one.</Link></p>
            ) : null}
          </div>

          <div className="panel">
            <h3>Haus</h3>
            <p className="hint" style={{ marginTop: 0 }}>Which project this is inspiration for. Anyone can add a haus.</p>
            {hausTags.map((t) => (
              <span className="tag" key={t.termId} data-src="human">
                {t.label}
                <span className="conf">{t.setByName ?? "human"}</span>
                <form action={toggle} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={id} />
                  <input type="hidden" name="termId" value={t.termId} />
                  <input type="hidden" name="action" value="remove" />
                  <button type="submit" title="Remove">×</button>
                </form>
              </span>
            ))}
            <HausPicker itemId={id} hauses={allHauses.filter((h) => !hausTags.some((t) => t.termId === h.id))} action={toggle} />
          </div>

          <div className="panel">
            <h3>Tags</h3>
            {active.length === 0 && job?.state !== "quarantined" && (
              <p className="hint" style={{ margin: 0 }}>Not tagged yet. It is in the queue.</p>
            )}
            {[...byFacet.entries()].map(([facet, list]) => (
              <div key={facet} style={{ marginBottom: 10 }}>
                <div className="facet-label">{facet}</div>
                {list.map((t) => (
                  <span className="tag" key={t.termId} data-src={t.source} data-suggested={t.suggested}
                        data-low={t.source === "ai" && (t.confidence ?? 1) < 0.65}
                        title={t.source === "human" ? `Set by ${t.setByName ?? "a person"}. No model run can change this.` : t.suggested ? `Suggested by ${t.modelVersion ?? "ai"}, which has not passed the quality gate for ${t.facetLabel.toLowerCase()}. Not used for filtering until accepted.` : `${t.modelVersion ?? "ai"}, confidence ${(t.confidence ?? 0).toFixed(2)}`}>
                    {t.label}
                    {t.source === "ai" ? <span className="conf">{t.suggested ? "suggested" : (t.confidence ?? 0).toFixed(2)}</span> : <span className="conf">{t.setByName ?? "human"}</span>}
                    {t.suggested && (
                      <form action={toggle} style={{ display: "inline" }}>
                        <input type="hidden" name="itemId" value={id} />
                        <input type="hidden" name="termId" value={t.termId} />
                        <input type="hidden" name="action" value="add" />
                        <button type="submit" title="Accept: makes it yours, permanently">✓</button>
                      </form>
                    )}
                    <form action={toggle} style={{ display: "inline" }}>
                      <input type="hidden" name="itemId" value={id} />
                      <input type="hidden" name="termId" value={t.termId} />
                      <input type="hidden" name="action" value="remove" />
                      <button type="submit" title="Remove, permanently">×</button>
                    </form>
                  </span>
                ))}
              </div>
            ))}
            <AddTag itemId={id} terms={allTerms} action={toggle} />
          </div>

          {rejected.length > 0 && (
            <div className="panel">
              <h3>Rejected by a person</h3>
              <p className="hint" style={{ marginTop: 0 }}>A tagging run can never reinstate these, however confident a newer model is (FR-19).</p>
              {rejected.map((t) => (
                <span className="tag" key={t.termId} style={{ opacity: 0.6 }}>
                  <s>{t.label}</s>
                  <form action={toggle} style={{ display: "inline" }}>
                    <input type="hidden" name="itemId" value={id} />
                    <input type="hidden" name="termId" value={t.termId} />
                    <input type="hidden" name="action" value="add" />
                    <button type="submit" title="Put it back">↩</button>
                  </form>
                </span>
              ))}
            </div>
          )}

          <div className="panel">
            <h3>Provenance</h3>
            <dl className="kv">
              <dt>saved by</dt><dd>{String(item.ownerName ?? item.ownerEmail ?? "")}</dd>
              {(data.sources as Array<Record<string, string | null>>).map((s, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <dt>source</dt><dd>{s.kind}</dd>
                  {s.source_url && <><dt>url</dt><dd><a href={s.source_url} target="_blank" rel="noreferrer noopener">{s.source_url.slice(0, 60)}</a></dd></>}
                  {s.author_handle && <><dt>author</dt><dd>{s.author_handle}</dd></>}
                  {s.board_name && <><dt>board</dt><dd>{s.board_name}</dd></>}
                  {s.page_title && <><dt>context</dt><dd>{s.page_title}</dd></>}
                </div>
              ))}
            </dl>
          </div>

          <div className="panel">
            <h3>The file</h3>
            <dl className="kv">
              <dt>sha256</dt><dd style={{ fontFamily: "monospace", fontSize: 10.5 }}>{String(item.sha256)}</dd>
              <dt>size</dt><dd>{(bytes / 1024).toFixed(0)} KB, {String(item.width)} x {String(item.height)}</dd>
              <dt>type</dt><dd>{String(item.mimeType)}</dd>
              <dt>original</dt><dd><a href={`/api/asset/${item.sha256}/original`} target="_blank" rel="noreferrer">download untouched bytes</a></dd>
            </dl>
            <p className="hint" style={{ margin: "8px 0 0" }}>Immutable and addressed by its own hash. The source can go offline without touching this.</p>
          </div>

          {(data.variants as Array<{ id: string; sha256: string }>).length > 0 && (
            <div className="panel">
              <h3>Near-duplicates folded in</h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(data.variants as Array<{ id: string; sha256: string }>).map((v) => (
                  <img key={v.id} src={`/api/asset/${v.sha256}/thumb`} alt="" className="thumb" style={{ width: 62, height: 62 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

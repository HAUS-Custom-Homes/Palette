import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setHumanTag } from "@/ai/apply-tags";
import { requireUser } from "@/auth";
import { addToBoard, boardsForItem, removeFromBoard } from "@/boards/boards";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { requeue, runTagQueue } from "@/ingest/tag-worker";
import { getItem, postFor, postMedia, similar } from "@/search/query";
import { displayName } from "../../ui/icons";
import { captionOf } from "@/ingest/page-preview";
import { Carousel } from "./carousel";
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

  // REF-02: a picture inside a post is reached through the post. An old link
  // to one slide still works, and opens the post on that slide.
  if (item.group_id && item.group_id !== id) {
    const members = await postMedia(String(item.group_id));
    const at = members.findIndex((m) => m.id === id);
    redirect(`/item/${item.group_id}${at > 0 ? `?slide=${at + 1}` : ""}`);
  }

  const tags = data.tags as unknown as Tag[];
  const like = await similar(id, 8);
  const post = await postFor(id);
  const media = await postMedia(id);
  const startSlide = Math.max(0, Number(sp.slide ?? 1) - 1) || 0;
  const isVideo = media.some((m) => m.videoSha || m.videoMissing);
  const stills = media.filter((m) => m.frameTimeS == null).length;
  const unsaved = post?.slideCount ? Math.max(0, post.slideCount - stills) : 0;

  async function makeCover(formData: FormData) {
    "use server";
    const u = await requireUser();
    if (u.role === "viewer") return;
    const memberId = String(formData.get("memberId"));
    const d2 = await db();
    // Only ever within the member's own post.
    await d2.query(
      `UPDATE items SET is_cover = (id = $1)
        WHERE COALESCE(group_id, id) = (SELECT COALESCE(group_id, id) FROM items WHERE id = $1)`,
      [memberId],
    );
    revalidatePath("/");
    revalidatePath(`/item/${id}`);
  }

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

  // FR-37, FR-43. Notes and rating are anyone's; removal is the owner's (or an owner's).
  async function edit(formData: FormData) {
    "use server";
    const u = await requireUser();
    const itemId = String(formData.get("itemId"));
    const d = await db();
    const what = String(formData.get("what"));
    if (what === "note") {
      const rating = Number(formData.get("rating") || 0) || null;
      await d.query(`UPDATE items SET note = $1, rating = $2, is_hero = $3 WHERE id = $4`, [
        String(formData.get("note") ?? "").trim().slice(0, 2000) || null, rating, formData.get("hero") === "on", itemId,
      ]);
      const { reindexItem } = await import("@/search/index-item");
      await reindexItem(itemId);
      revalidatePath(`/item/${itemId}`);
    } else if (what === "remove") {
      const owner = await d.one<{ created_by: string }>(`SELECT created_by FROM items WHERE id = $1`, [itemId]);
      if (owner && (owner.created_by === u.id || u.role === "owner")) {
        // A post leaves the library whole. Nothing is erased: originals stay until a purge.
        await d.query(`UPDATE items SET deleted_at = now() WHERE (id = $1 OR group_id = $1) AND deleted_at IS NULL`, [itemId]);
        await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action) VALUES ($1, 'item', $2, 'soft_deleted')`, [u.id, itemId]);
        redirect("/");
      }
    }
  }

  return (
    <div>
      <Nav user={user} />
      <div className="page">
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0 14px" }}>
        <Link className="btn" href="/">Back to library</Link>
        {sp.shared && <span className="pill">saved from your phone</span>}
      </div>

      {/* A share from the phone skips the capture form, so the one question
          only a person can answer is asked here, once, and is skippable. */}
      {sp.shared && hausTags.length === 0 && user.role !== "viewer" && (
        <div className="notice" data-kind="attention" style={{ margin: "0 0 16px" }}>
          <b>Saved. Which haus is this for?</b>{" "}
          <span className="hint">Optional. Pick one, type a new one, or just leave.</span>
          <div style={{ marginTop: 8 }}>
            <HausPicker itemId={id} hauses={allHauses} action={toggle} />
          </div>
        </div>
      )}

      <div className="detail">
        <div>
          {/* REF-02: the post, whole. */}
          <Carousel media={media} start={startSlide} alt={displayName(item.caption_ai, item.title)}
                    canEdit={user.role !== "viewer"} makeCover={makeCover} />

          {unsaved > 0 && post?.sourceUrl && (
            <div className="strip">
              <span className="lead" style={{ whiteSpace: "normal" }}>
                {unsaved} more {unsaved === 1 ? "image" : "images"} in this post {unsaved === 1 ? "is" : "are"} not in Palette yet.
              </span>
              <a className="go" href={post.sourceUrl} target="_blank" rel="noreferrer">Open the post</a>
            </div>
          )}

          {/* Saved from a pasted link: all a link can reach is the post's cover, at
              preview size. Say so, and point at the way to the rest. */}
          {post && !isVideo && !post.slideCount && post.siblings.length === 1 && post.sourceUrl && Number(item.width ?? 0) <= 700 && (post.kind === "instagram" || post.kind === "pinterest") && (
            <div className="strip">
              <span className="lead" style={{ whiteSpace: "normal" }}>
                This is the post&apos;s cover, at the size {post.kind === "instagram" ? "Instagram" : "Pinterest"} publishes for previews.
                For full size, or the other images in the post, open it and save with the Palette extension.
              </span>
              <a className="go" href={post.sourceUrl} target="_blank" rel="noreferrer">Open the post</a>
            </div>
          )}

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
          <div className="item-src">
            {post?.sourceUrl && (
              <a href={post.sourceUrl} target="_blank" rel="noreferrer">
                View on {post.kind === "instagram" ? "Instagram" : post.kind === "pinterest" ? "Pinterest" : "the web"}
              </a>
            )}
            <span>Saved by {String(item.ownerName ?? "someone")} · {String(item.captured_at ?? "").slice(0, 10)}</span>
          </div>
          <h2 className="item-title">{displayName(item.caption_ai, item.title)}</h2>
          <p className="item-by">
            {post?.authorHandle ? `@${post.authorHandle.replace(/^@/, "")} · ` : ""}
            {media.length > 1 ? `${media.length} ${isVideo ? "items" : "images"} kept at full size` : isVideo && media[0]?.videoSha ? "video kept in Palette" : "original kept forever"}
          </p>
          {post?.captionText && <p className="item-cap">{captionOf(post.captionText)}</p>}

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

          {item.ocr_text ? (
            <div className="panel">
              <h3>Text in this image</h3>
              <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {String(item.ocr_text).split(" | ").join("\n")}
              </p>
            </div>
          ) : null}

          <div className="panel">
            <h3>Notes</h3>
            <form action={edit}>
              <input type="hidden" name="itemId" value={id} />
              <input type="hidden" name="what" value="note" />
              <textarea name="note" className="search" rows={3} defaultValue={String(item.note ?? "")} placeholder="Why this one. Searchable." style={{ width: "100%", resize: "vertical", fontSize: 12.5 }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <label className="hint">Rating
                  <select name="rating" className="search" defaultValue={String(item.rating ?? "")} style={{ marginLeft: 6, padding: "4px 8px", fontSize: 12 }}>
                    <option value="">none</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                  </select>
                </label>
                <label className="hint"><input type="checkbox" name="hero" defaultChecked={Boolean(item.is_hero)} /> hero image</label>
                <button className="btn" type="submit">Save</button>
              </div>
            </form>
          </div>

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
            {(isMine || user.role === "owner") && (
              <form action={edit} style={{ marginTop: 10 }}>
                <input type="hidden" name="itemId" value={id} />
                <input type="hidden" name="what" value="remove" />
                <button className="btn" type="submit" title="Hidden from the library. The bytes stay for 90 days, then npm run purge.">Remove from library</button>
              </form>
            )}
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
    </div>
  );
}

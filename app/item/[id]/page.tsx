import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setHumanTag } from "@/ai/apply-tags";
import { requireUser } from "@/auth";
import { addToBoard, boardsForItem, removeFromBoard } from "@/boards/boards";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { fetchFullPost } from "@/ingest/ingest";
import { requeue, runTagQueue } from "@/ingest/tag-worker";
import { getItem, memberTags, postFor, postMedia, similar } from "@/search/query";
import { By, displayName, platformOf } from "../../ui/icons";
import { captionOf } from "@/ingest/page-preview";
import { pendingProposals } from "@/taxonomy/terms";
import { ItemBoardPicker } from "./board-picker";
import { Carousel } from "./carousel";
import { SlidePanel } from "./slide-panel";
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
  const perSlide = (await memberTags(id)) as Map<string, Tag[]>;
  const when = item.captured_at ? new Date(String(item.captured_at)) : null;
  const savedOn = when && !Number.isNaN(when.getTime())
    ? when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const startSlide =Math.max(0, Number(sp.slide ?? 1) - 1) || 0;
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

  // The haus is the post's. Tags are each picture's (perSlide).
  const hausTags = tags.filter((t) => !t.rejected && t.facetKey === "project");

  async function toggle(formData: FormData) {
    "use server";
    const u = await requireUser();
    const itemId = String(formData.get("itemId"));
    await setHumanTag(itemId, String(formData.get("termId")), String(formData.get("action")) as "add" | "remove", u.id);
    // The picture may be one slide of a post; the page is the post's, and it
    // comes back on the slide the person was looking at.
    const lead = await (await db()).one<{ lead: string }>(`SELECT COALESCE(group_id, id)::text AS lead FROM items WHERE id = $1`, [itemId]);
    const slide = Number(formData.get("slide") ?? 1);
    revalidatePath(`/item/${lead?.lead ?? itemId}`);
    redirect(`/item/${lead?.lead ?? itemId}${slide > 1 ? `?slide=${slide}` : ""}`);
  }

  // A post saved at preview size is fetched again, whole. The small cover
  // folds into the full-size slide (attachSource), so the page lands on the
  // same post with the same tags, lookbooks and notes.
  async function fetchFull(formData: FormData) {
    "use server";
    const u = await requireUser();
    if (u.role === "viewer") return;
    const itemId = String(formData.get("itemId"));
    let to = `/item/${itemId}?fetched=failed`;
    try {
      const r = await fetchFullPost(itemId);
      to = `/item/${r.leadId}?fetched=${r.got}`;
    } catch (e) {
      console.warn(`[ingest] full post for ${itemId}: ${(e as Error).message}`);
    }
    revalidatePath("/");
    revalidatePath(to.split("?")[0]!);
    redirect(to);
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
  const allTerms = await d.query<{ id: string; label: string; facetKey: string; facetLabel: string; synonyms: string[] }>(
    `SELECT t.id, t.label, f.key AS "facetKey", f.label AS "facetLabel", t.synonyms
       FROM taxonomy_terms t JOIN taxonomy_facets f ON f.id = t.facet_id
      WHERE t.status = 'active' AND f.key <> 'project' ORDER BY f.sort_order, t.label`,
  );
  const closedFacets = await d.query<{ key: string; label: string }>(
    `SELECT key, label FROM taxonomy_facets WHERE key <> 'project' ORDER BY sort_order`,
  );
  const proposals = await pendingProposals();
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

      {sp.fetched && sp.fetched !== "failed" && (
        <p className="notice" style={{ margin: "0 0 16px" }}>
          <b>Fetched in full.</b> {sp.fetched === "1" ? "The picture is now at full size." : `${sp.fetched} pictures, at full size.`}
        </p>
      )}

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
                {sp.fetched === "failed"
                  ? `${post.kind === "instagram" ? "Instagram" : "Pinterest"} would not give Palette this post just now. This is the preview-size cover. Try again later, or open the post and save with the Palette extension.`
                  : `This is the post's cover, at the size ${post.kind === "instagram" ? "Instagram" : "Pinterest"} publishes for previews.`}
              </span>
              {post.kind === "instagram" && user.role !== "viewer" && (
                <form action={fetchFull}>
                  <input type="hidden" name="itemId" value={id} />
                  <button className="go" type="submit">Get the full post</button>
                </form>
              )}
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
                View on {({ instagram: "Instagram", pinterest: "Pinterest", tiktok: "TikTok", youtube: "YouTube", web: "the web", phone: "the web" } as const)[platformOf(post.kind, post.sourceUrl) ?? "web"]}
              </a>
            )}
            {item.ownerName ? <By name={String(item.ownerName)} image={item.ownerImage ? String(item.ownerImage) : null} prefix="Saved by" /> : null}
            <span>{savedOn}</span>
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
            <h3>Lookbooks</h3>
            {boards.on.map((b) => (
              <span className="tag" key={b.id} data-src="human">
                <Link href={`/boards/${b.id}`}>{b.name}</Link>
                <form action={board} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={id} />
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="action" value="remove" />
                  <button type="submit" title="Remove from lookbook">×</button>
                </form>
              </span>
            ))}
            {user.role !== "viewer" && (
              <div style={{ marginTop: boards.on.length ? 8 : 0 }}>
                {/* A board that fills itself from a filter is not somewhere you put things by hand. */}
                <ItemBoardPicker itemId={id} boards={boards.available.filter((b) => !b.isSmart).map((b) => ({ id: b.id, name: b.name }))} />
              </div>
            )}
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

          {/* Tags belong to the picture on screen. The panel follows the carousel. */}
          <SlidePanel start={startSlide}>
            {media.map((m, i) => {
              const mine = perSlide.get(m.id) ?? [];
              const active = mine.filter((t) => !t.rejected);
              const rejected = mine.filter((t) => t.rejected);
              const byFacet = new Map<string, Tag[]>();
              for (const t of active) byFacet.set(t.facetLabel, [...(byFacet.get(t.facetLabel) ?? []), t]);
              const tagged = m.id === id ? job?.state !== "quarantined" : true;
              return (
                <div key={m.id}>
                  <div className="panel">
                    <h3>Tags{media.length > 1 ? <span className="hint" style={{ marginLeft: 8, letterSpacing: 0, textTransform: "none" }}>picture {i + 1} of {media.length}</span> : null}</h3>
                    {active.length === 0 && tagged && (
                      <p className="hint" style={{ margin: 0 }}>Not tagged yet. It is in the queue.</p>
                    )}
                    {[...byFacet.entries()].map(([facet, list]) => (
                      <div key={facet} style={{ marginBottom: 10 }}>
                        <div className="facet-label">{facet}</div>
                        {list.map((t) => (
                          <span className="tag" key={t.termId} data-src={t.source} data-suggested={t.suggested}
                                data-low={t.source === "ai" && (t.confidence ?? 1) < 0.65}
                                title={t.source === "human" ? `Set by ${t.setByName ?? "a person"}. No model run can change this.` : t.suggested ? `Suggested by ${t.modelVersion ?? "ai"}. Not used for filtering until accepted.` : `${t.modelVersion ?? "ai"}, confidence ${(t.confidence ?? 0).toFixed(2)}`}>
                            {t.label}
                            {t.source === "ai" ? <span className="conf">{t.suggested ? "suggested" : (t.confidence ?? 0).toFixed(2)}</span> : <span className="conf">{t.setByName ?? "human"}</span>}
                            {t.suggested && (
                              <form action={toggle} style={{ display: "inline" }}>
                                <input type="hidden" name="itemId" value={m.id} />
                            <input type="hidden" name="slide" value={i + 1} />
                                <input type="hidden" name="termId" value={t.termId} />
                                <input type="hidden" name="action" value="add" />
                                <button type="submit" title="Accept: makes it yours, permanently">✓</button>
                              </form>
                            )}
                            <form action={toggle} style={{ display: "inline" }}>
                              <input type="hidden" name="itemId" value={m.id} />
                            <input type="hidden" name="slide" value={i + 1} />
                              <input type="hidden" name="termId" value={t.termId} />
                              <input type="hidden" name="action" value="remove" />
                              <button type="submit" title="Remove. A tagging run will never put it back.">×</button>
                            </form>
                          </span>
                        ))}
                      </div>
                    ))}
                    {user.role !== "viewer" && <AddTag itemId={m.id} slide={i + 1} terms={allTerms.filter((t) => !active.some((a) => a.termId === t.id))} facets={closedFacets} proposals={proposals} />}
                  </div>

                  {rejected.length > 0 && (
                    <div className="panel">
                      <h3>Removed by a person</h3>
                      <p className="hint" style={{ marginTop: 0 }}>A tagging run can never put these back, however sure a newer model is.</p>
                      {rejected.map((t) => (
                        <span className="tag" key={t.termId} style={{ opacity: 0.6 }}>
                          <s>{t.label}</s>
                          <form action={toggle} style={{ display: "inline" }}>
                            <input type="hidden" name="itemId" value={m.id} />
                            <input type="hidden" name="slide" value={i + 1} />
                            <input type="hidden" name="termId" value={t.termId} />
                            <input type="hidden" name="action" value="add" />
                            <button type="submit" title="Put it back">↩</button>
                          </form>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </SlidePanel>

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

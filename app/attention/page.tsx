import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { requeue, runTagQueue } from "@/ingest/tag-worker";
import { setHumanTag } from "@/ai/apply-tags";
import { quarantined, unsurePosts } from "@/search/query";
import { displayName } from "../ui/icons";
import { Nav } from "../ui/nav";

export const dynamic = "force-dynamic";

/**
 * Each person is responsible for their own images. This is their list:
 * the ones the tagger gave up on, and the ones it was unsure about.
 * Nobody else's images appear here, and nothing here is anyone else's job.
 */
export default async function AttentionPage() {
  await boot();
  const user = await requireUser();

  const [q, review] = await Promise.all([
    quarantined(user.id),
    unsurePosts(user.id),
  ]);

  async function retryAll() {
    "use server";
    const u = await requireUser();
    const d = await db();
    const rows = await d.query<{ item_id: string }>(
      `SELECT (j.payload->>'itemId') AS item_id FROM ingest_jobs j
         JOIN items i ON i.id = (j.payload->>'itemId')::uuid
        WHERE j.state = 'quarantined' AND i.created_by = $1`,
      [u.id],
    );
    for (const r of rows) await requeue({ itemId: r.item_id });
    await runTagQueue(rows.length);
    revalidatePath("/attention");
  }

  // Keep or remove one doubtful tag, on every picture of the post that carries it.
  async function decide(formData: FormData) {
    "use server";
    const u = await requireUser();
    const action = formData.get("action") === "add" ? "add" : "remove";
    const termId = String(formData.get("termId"));
    const d = await db();
    const ids = String(formData.get("itemIds") ?? "").split(",").filter(Boolean);
    for (const itemId of ids) {
      const mine = await d.one(`SELECT 1 AS x FROM items WHERE id = $1 AND created_by = $2`, [itemId, u.id]);
      if (mine) await setHumanTag(itemId, termId, action, u.id);
    }
    revalidatePath("/attention");
  }

  async function remove(formData: FormData) {
    "use server";
    const u = await requireUser();
    const d = await db();
    // FR-43 soft delete, and only your own.
    await d.query(`UPDATE items SET deleted_at = now() WHERE id = $1 AND created_by = $2`, [String(formData.get("itemId")), u.id]);
    await d.query(`UPDATE ingest_jobs SET state = 'done' WHERE dedupe_key = $1`, [`tag:${String(formData.get("itemId"))}`]);
    revalidatePath("/attention");
  }

  return (
    <div>
      <Nav user={user} attention={q.length + review.length} />
      <div style={{ padding: 20, maxWidth: 1100 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Needs me</h2>
        <p className="hint" style={{ marginTop: 0 }}>Your images only. Nobody else sees this list.</p>

        <div className="panel">
          <h3>Could not be tagged ({q.length})</h3>
          {q.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Nothing stuck.</p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                The tagger failed three times on each of these. The images are safe. Retry once the cause is fixed,
                tag them by hand, or remove them if they were mistakes.
              </p>
              <form action={retryAll} style={{ marginBottom: 10 }}>
                <button className="btn" data-primary="true" type="submit">Retry all</button>
              </form>
              <div className="attention-list">
                {q.map((it) => (
                  <div className="attention-row" key={it.id}>
                    <Link href={`/item/${it.id}`}><img src={`/api/asset/${it.sha256}/thumb`} alt="" className="thumb" /></Link>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>{it.title ?? "untitled"}</div>
                      <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.lastError ?? "no error recorded"}
                      </div>
                    </div>
                    <Link className="btn" href={`/item/${it.id}`}>Tag by hand</Link>
                    <form action={remove}>
                      <input type="hidden" name="itemId" value={it.id} />
                      <button className="btn" type="submit">Remove</button>
                    </form>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h3>Tags to check ({review.length})</h3>
          {review.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Nothing to check.</p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                The model was not sure about these. <b>&#10003;</b> keeps a tag, <b>&#10005;</b> removes it for good.
              </p>
              <ul className="unsure">
                {review.map((p) => (
                  <li key={p.id} className="unsure-row">
                    <Link href={`/item/${p.id}`} className="unsure-thumb">
                      <img src={`/api/asset/${p.sha256}/thumb`} alt="" loading="lazy" />
                      {p.pictures > 1 && <span className="unsure-n">{p.pictures}</span>}
                    </Link>
                    <div className="unsure-body">
                      <Link href={`/item/${p.id}`} className="unsure-title">{displayName(p.captionAi, p.title)}</Link>
                      <div className="unsure-tags">
                        {p.tags.map((t) => (
                          <span className="unsure-tag" key={t.termId}>
                            <span className="unsure-label">{t.label}<i>{t.facetLabel.toLowerCase()}</i></span>
                            <form action={decide}>
                              <input type="hidden" name="termId" value={t.termId} />
                              <input type="hidden" name="itemIds" value={t.itemIds.join(",")} />
                              <input type="hidden" name="action" value="add" />
                              <button type="submit" className="keep" aria-label={`Keep ${t.label}`}>&#10003;</button>
                            </form>
                            <form action={decide}>
                              <input type="hidden" name="termId" value={t.termId} />
                              <input type="hidden" name="itemIds" value={t.itemIds.join(",")} />
                              <input type="hidden" name="action" value="remove" />
                              <button type="submit" className="drop" aria-label={`Remove ${t.label}`}>&#10005;</button>
                            </form>
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { requeue, runTagQueue } from "@/ingest/tag-worker";
import { quarantined, search } from "@/search/query";
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
    search({ reviewOnly: true, ownerId: user.id, limit: 60 }),
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
      <Nav user={user} attention={q.length + review.total} />
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
          <h3>Unsure tags ({review.total})</h3>
          {review.items.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Nothing to check.</p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                The model put a low-confidence tag on these. Open each one, keep what is right, cross out what is
                wrong. A cross-out is permanent.
              </p>
              <div className="grid" style={{ padding: 0, columns: "4 160px" }}>
                {review.items.map((it) => (
                  <Link className="card" key={it.id} href={`/item/${it.id}`}>
                    <img src={`/api/asset/${it.sha256}/grid`} alt="" width={it.width ?? 400} height={it.height ?? 300} loading="lazy" />
                    <figcaption>{it.captionAi ?? it.title ?? "untitled"}</figcaption>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

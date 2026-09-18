import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { Nav } from "../ui/nav";

export const dynamic = "force-dynamic";

/**
 * REF-01 FR-2. Your saved posts from the Instagram export, as a checklist.
 * A row is done when an item with the same post id exists, which is what
 * clipping it with the extension produces. Open, clip, come back: done.
 */
export default async function BackfillPage() {
  await boot();
  const user = await requireUser();
  const d = await db();
  const rows = await d.query<{ id: string; url: string; externalId: string; collection: string | null; savedAt: string | null; skipped: boolean; itemId: string | null }>(
    `SELECT b.id, b.url, b.external_id AS "externalId", b.collection, b.saved_at::text AS "savedAt", b.skipped,
            (SELECT s.item_id FROM sources s WHERE s.kind = b.kind AND s.external_id = b.external_id LIMIT 1) AS "itemId"
       FROM backfill b WHERE b.user_id = $1 ORDER BY b.saved_at DESC NULLS LAST, b.created_at DESC`,
    [user.id],
  );
  const done = rows.filter((r) => r.itemId).length;
  const skipped = rows.filter((r) => r.skipped && !r.itemId).length;
  const todo = rows.filter((r) => !r.itemId && !r.skipped);

  async function skip(formData: FormData) {
    "use server";
    const u = await requireUser();
    const d = await db();
    await d.query(`UPDATE backfill SET skipped = NOT skipped WHERE id = $1 AND user_id = $2`, [String(formData.get("id")), u.id]);
    revalidatePath("/backfill");
  }

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: 20, maxWidth: 1000 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Instagram backfill</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          {rows.length === 0
            ? "Nothing here yet. Request your Instagram data export (Settings, Accounts Center, Download your information, JSON), then run npm run backfill:instagram against the unzipped folder."
            : `${rows.length} saved posts in your export: ${done} in the library, ${skipped} skipped, ${todo.length} to go. Open one, clip it with the extension, and it ticks itself.`}
        </p>
        {todo.length > 0 && (
          <table className="table">
            <thead><tr><th>Post</th><th>Collection</th><th>Saved</th><th></th></tr></thead>
            <tbody>
              {todo.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td><a href={r.url} target="_blank" rel="noreferrer noopener">{r.url.replace("https://www.instagram.com", "")}</a></td>
                  <td className="hint">{r.collection ?? ""}</td>
                  <td className="hint">{r.savedAt?.slice(0, 10) ?? ""}</td>
                  <td><form action={skip}><input type="hidden" name="id" value={r.id} /><button className="btn" type="submit">Skip</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {todo.length > 200 && <p className="hint">Showing 200 of {todo.length}. Clip some and come back.</p>}
      </div>
    </div>
  );
}

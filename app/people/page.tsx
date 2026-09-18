import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { SYSTEM_USER_EMAIL } from "@/config";
import { boot } from "@/lib/boot";
import { Nav } from "../ui/nav";

export const dynamic = "force-dynamic";

/**
 * Role admin. Owners only. The one rule: you cannot remove the last owner,
 * including yourself, because a library with no owner has nobody who can
 * fix that.
 */
export default async function PeoplePage() {
  await boot();
  const user = await requireUser();
  const d = await db();
  const people = await d.query<{ id: string; email: string; name: string | null; role: string; lastSeen: string | null; items: number }>(
    `SELECT u.id, u.email, u.name, u.role::text AS role, u.last_seen_at::text AS "lastSeen",
            (SELECT count(*)::int FROM items i WHERE i.created_by = u.id AND i.deleted_at IS NULL) AS items
       FROM users u WHERE u.email <> $1 ORDER BY u.created_at`,
    [SYSTEM_USER_EMAIL],
  );

  async function setRole(formData: FormData) {
    "use server";
    const me = await requireUser();
    if (me.role !== "owner") return;
    const id = String(formData.get("id"));
    const role = String(formData.get("role"));
    if (!["owner", "editor", "viewer"].includes(role)) return;
    const d = await db();
    const owners = await d.one<{ n: string }>(`SELECT count(*)::text AS n FROM users WHERE role = 'owner'`);
    const target = await d.one<{ role: string }>(`SELECT role::text AS role FROM users WHERE id = $1`, [id]);
    if (target?.role === "owner" && role !== "owner" && Number(owners?.n) <= 1) return; // last owner stays
    await d.query(`UPDATE users SET role = $1::user_role WHERE id = $2`, [role, id]);
    await d.query(`INSERT INTO audit_events (actor_id, entity, entity_id, action, after) VALUES ($1, 'user', $2, 'role', $3)`, [me.id, id, JSON.stringify({ role })]);
    revalidatePath("/people");
  }

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: 20, maxWidth: 900 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>People</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Everyone on the Workspace can sign in. Editors capture, tag and make boards. Viewers only look. Owners can change roles.
          {user.role !== "owner" && " You are not an owner, so this page is read-only for you."}
        </p>
        <table className="table">
          <thead><tr><th>Person</th><th>Role</th><th>Images</th><th>Last seen</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.name ?? p.email}<div className="hint">{p.email}</div></td>
                <td>
                  {user.role === "owner" ? (
                    <form action={setRole} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={p.id} />
                      <select name="role" className="search" defaultValue={p.role} style={{ padding: "5px 8px", fontSize: 12, flex: "0 0 110px" }}>
                        <option value="owner">owner</option>
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button className="btn" type="submit">Set</button>
                    </form>
                  ) : p.role}
                </td>
                <td>{p.items}</td>
                <td className="hint">{p.lastSeen ? p.lastSeen.slice(0, 16).replace("T", " ") : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

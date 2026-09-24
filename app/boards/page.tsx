import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { createBoard, listBoards } from "@/boards/boards";
import { boot } from "@/lib/boot";
import { Nav } from "../ui/nav";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  await boot();
  const user = await requireUser();
  const boards = await listBoards(user.id);

  async function create(formData: FormData) {
    "use server";
    const u = await requireUser();
    const id = await createBoard(u.id, String(formData.get("name") ?? ""), String(formData.get("description") ?? ""));
    revalidatePath("/boards");
    redirect(`/boards/${id}`);
  }

  return (
    <div>
      <Nav user={user} />
      <div className="page" style={{ maxWidth: 1100, paddingTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Lookbooks</h2>
        <p className="hint" style={{ marginTop: 0 }}>Curated sets for a haus, a room, a meeting. Everyone sees a lookbook unless its owner makes it private.</p>

        <form action={create} className="panel newboard" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="search" name="name" placeholder="New lookbook, e.g. Hurst primary bath" required minLength={2} style={{ flex: "1 1 240px", minWidth: 0 }} />
          <input className="search" name="description" placeholder="optional note" style={{ flex: "1 1 200px", minWidth: 0 }} />
          <button className="btn" data-primary="true" type="submit">Create</button>
        </form>

        {boards.length === 0 ? (
          <p className="empty">No lookbooks yet. Make one above, or add a post to one from its page.</p>
        ) : (
          <div className="boards">
            {boards.map((b) => (
              <Link className="board-card" key={b.id} href={`/boards/${b.id}`}>
                <div className="board-cover">
                  {b.coverSha ? <img src={`/api/asset/${b.coverSha}/grid`} alt="" /> : <div className="board-empty">empty</div>}
                </div>
                <div className="board-meta">
                  <div>{b.name}{b.isPrivate && <span className="hint"> · private</span>}{b.isSmart && <span className="hint"> · smart</span>}</div>
                  <div className="hint">{b.count} {b.count === 1 ? "image" : "images"}{b.ownerName ? ` · ${b.ownerName}` : ""}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

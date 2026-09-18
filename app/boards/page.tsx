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
      <div style={{ padding: 20, maxWidth: 1100 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Boards</h2>
        <p className="hint" style={{ marginTop: 0 }}>Curated sets for a haus, a room, a meeting. Everyone sees a board unless its owner makes it private.</p>

        <form action={create} className="panel" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="search" name="name" placeholder="New board, e.g. Hurst primary bath" required minLength={2} />
          <input className="search" name="description" placeholder="optional note" style={{ flex: "0 0 260px" }} />
          <button className="btn" data-primary="true" type="submit">Create</button>
        </form>

        {boards.length === 0 ? (
          <p className="empty">No boards yet. Make one above, or add an image to a board from its page.</p>
        ) : (
          <div className="boards">
            {boards.map((b) => (
              <Link className="board-card" key={b.id} href={`/boards/${b.id}`}>
                <div className="board-cover">
                  {b.coverSha ? <img src={`/api/asset/${b.coverSha}/grid`} alt="" /> : <div className="board-empty">empty</div>}
                </div>
                <div className="board-meta">
                  <div>{b.name}{b.isPrivate && <span className="hint"> · private</span>}</div>
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

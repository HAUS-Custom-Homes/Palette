import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getBoard, moveOnBoard, removeFromBoard, setBoardCover, setBoardPrivacy } from "@/boards/boards";
import { boot } from "@/lib/boot";
import { Nav } from "../../ui/nav";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  await boot();
  const user = await requireUser();
  const { id } = await params;
  const board = await getBoard(id, user.id);
  if (!board) notFound();

  async function remove(formData: FormData) {
    "use server";
    const u = await requireUser();
    await removeFromBoard(String(formData.get("boardId")), String(formData.get("itemId")), u.id);
    revalidatePath(`/boards/${String(formData.get("boardId"))}`);
  }

  async function arrange(formData: FormData) {
    "use server";
    const u = await requireUser();
    const boardId = String(formData.get("boardId"));
    const itemId = String(formData.get("itemId"));
    const what = String(formData.get("what"));
    if (what === "up" || what === "down") await moveOnBoard(boardId, itemId, what);
    if (what === "cover") await setBoardCover(boardId, itemId, u.id);
    revalidatePath(`/boards/${boardId}`);
    revalidatePath("/boards");
  }

  async function privacy(formData: FormData) {
    "use server";
    const u = await requireUser();
    await setBoardPrivacy(String(formData.get("boardId")), u.id, formData.get("private") === "1");
    revalidatePath(`/boards/${String(formData.get("boardId"))}`);
    revalidatePath("/boards");
  }

  return (
    <div>
      <Nav user={user} />
      <div className="topbar" style={{ top: 44 }}>
        <Link className="btn" href="/boards">All boards</Link>
        <span style={{ fontFamily: "var(--serif)", fontSize: 16 }}>{board.name}</span>
        <span className="hint">{board.count} {board.count === 1 ? "image" : "images"}{board.ownerName ? ` · ${board.ownerName}` : ""}{board.isPrivate ? " · private" : ""}</span>
        <span style={{ flex: 1 }} />
        {board.canEdit && (
          <form action={privacy}>
            <input type="hidden" name="boardId" value={board.id} />
            <input type="hidden" name="private" value={board.isPrivate ? "0" : "1"} />
            <button className="btn" type="submit">{board.isPrivate ? "Make visible to team" : "Make private"}</button>
          </form>
        )}
      </div>

      {board.description && <p className="hint" style={{ padding: "10px 20px 0" }}>{board.description}</p>}

      {board.items.length === 0 ? (
        <div className="empty">
          <p>Nothing on this board yet.</p>
          <p style={{ fontSize: 12 }}>Open any image in the library and add it from the Boards panel.</p>
        </div>
      ) : (
        <div className="grid">
          {board.items.map((it) => (
            <figure className="card" key={it.id} style={{ margin: "0 0 12px" }}>
              <Link href={`/item/${it.id}`}>
                <img src={`/api/asset/${it.sha256}/grid`} alt={it.captionAi ?? ""} width={it.width ?? 400} height={it.height ?? 300} loading="lazy" />
              </Link>
              <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0 }}>{it.captionAi ?? it.title ?? "untitled"}</span>
                {board.canEdit && (
                  <span className="board-tools">
                    {(["up", "down", "cover"] as const).map((what) => (
                      <form action={arrange} key={what} style={{ display: "inline" }}>
                        <input type="hidden" name="boardId" value={board.id} />
                        <input type="hidden" name="itemId" value={it.id} />
                        <input type="hidden" name="what" value={what} />
                        <button type="submit" title={what === "cover" ? "Use as cover" : `Move ${what}`}>
                          {what === "up" ? "↑" : what === "down" ? "↓" : "★"}
                        </button>
                      </form>
                    ))}
                    <form action={remove} style={{ display: "inline" }}>
                      <input type="hidden" name="boardId" value={board.id} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <button type="submit" title="Remove from board">×</button>
                    </form>
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { feedbackForBoard, getBoard, moveOnBoard, removeFromBoard, setBoardCover, setBoardPrivacy, shareBoard, unshareBoard } from "@/boards/boards";
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

  async function share(formData: FormData) {
    "use server";
    const u = await requireUser();
    const boardId = String(formData.get("boardId"));
    if (formData.get("what") === "stop") await unshareBoard(boardId, u.id);
    else await shareBoard(boardId, u.id, Number(formData.get("days") ?? 30));
    revalidatePath(`/boards/${boardId}`);
  }

  const feedback = await feedbackForBoard(id);
  const likesByItem = new Map<string, string[]>();
  for (const f of feedback) if (f.sentiment === "like") likesByItem.set(f.itemId, [...(likesByItem.get(f.itemId) ?? []), f.viewer]);

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
        <span className="hint">{board.count} {board.count === 1 ? "image" : "images"}{board.ownerName ? ` · ${board.ownerName}` : ""}{board.isPrivate ? " · private" : ""}{board.isSmart ? " · smart board, always current" : ""}</span>
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

      {board.canEdit && (
        <div className="panel" style={{ margin: "12px 20px 0" }}>
          <h3>Share with a client</h3>
          {board.shareToken && board.shareExpiresAt ? (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                Anyone with this link sees this board only, read-only, until {board.shareExpiresAt.slice(0, 10)}. Their likes appear below.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ userSelect: "all", fontSize: 12, padding: "6px 10px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 4 }}>
                  {`/s/${board.shareToken}`}
                </code>
                <span className="hint">prefix with this Palette's address</span>
                <form action={share}><input type="hidden" name="boardId" value={board.id} /><input type="hidden" name="what" value="stop" /><button className="btn" type="submit">Stop sharing</button></form>
              </div>
              {feedback.length > 0 && (
                <p className="hint" style={{ margin: "10px 0 0" }}>
                  {feedback.filter((f) => f.sentiment === "like").length} likes from {new Set(feedback.map((f) => f.viewer)).size} {new Set(feedback.map((f) => f.viewer)).size === 1 ? "person" : "people"}.
                </p>
              )}
            </>
          ) : (
            <form action={share} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="boardId" value={board.id} />
              <span className="hint">Make a read-only link that expires in</span>
              <select name="days" className="search" defaultValue="30" style={{ flex: "0 0 110px", padding: "6px 8px" }}>
                <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
              </select>
              <button className="btn" data-primary="true" type="submit">Create link</button>
            </form>
          )}
        </div>
      )}

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
                <span style={{ flex: 1, minWidth: 0 }}>
                  {it.captionAi ?? it.title ?? "untitled"}
                  {likesByItem.has(it.id) && <span className="like-pill" title={likesByItem.get(it.id)!.join(", ")}>♥ {likesByItem.get(it.id)!.length}</span>}
                </span>
                {board.canEdit && !board.isSmart && (
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

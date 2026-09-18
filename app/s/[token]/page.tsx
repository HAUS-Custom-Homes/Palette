import { notFound } from "next/navigation";
import { getSharedBoard } from "@/boards/boards";
import { boot } from "@/lib/boot";
import { Feedback } from "./feedback";

export const dynamic = "force-dynamic";

/**
 * REF-01 FR-35. What a client sees: the board, nothing else. No navigation
 * into the library, no other boards, no search. Every image is served
 * through the same asset route with this token as the credential, and the
 * whole thing stops working on the expiry date.
 */
export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  await boot();
  const { token } = await params;
  const board = await getSharedBoard(token);
  if (!board) notFound();

  return (
    <div className="client">
      <header className="client-head">
        <div className="client-brand">HAUS</div>
        <h1>{board.name}</h1>
        {board.description && <p>{board.description}</p>}
        <p className="hint">Tap the ones you like. Your picks come straight back to us.</p>
      </header>
      <Feedback token={token} items={board.items.map((i) => ({ id: i.id, sha256: i.sha256, caption: i.captionAi, likes: i.likes }))} />
      <footer className="client-foot hint">Shared by HAUS Custom Homes for your review. This link expires {board.expires.slice(0, 10)}.</footer>
    </div>
  );
}

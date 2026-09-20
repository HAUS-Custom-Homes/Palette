"use client";

import { BoardPicker } from "../../ui/board-picker";

/** The post page's picker: one post, and a server component cannot hand a function across. */
export function ItemBoardPicker({ itemId, boards }: { itemId: string; boards: Array<{ id: string; name: string }> }) {
  return <BoardPicker boards={boards} itemIds={() => [itemId]} />;
}

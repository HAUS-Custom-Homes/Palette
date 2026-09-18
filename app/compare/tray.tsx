"use client";

import { useRouter } from "next/navigation";

export function TrayControls({ ids }: { ids: string[] }) {
  const router = useRouter();
  function remove(id: string) {
    const next = ids.filter((x) => x !== id);
    try { localStorage.setItem("palette.compare", JSON.stringify(next)); } catch { /* ignore */ }
    router.push(next.length ? `/compare?ids=${next.join(",")}` : "/compare");
  }
  function clear() {
    try { localStorage.setItem("palette.compare", "[]"); } catch { /* ignore */ }
    router.push("/compare");
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {ids.map((id, i) => (
        <button key={id} className="btn" onClick={() => remove(id)} title="Remove from tray">{i + 1} ×</button>
      ))}
      {ids.length > 0 && <button className="btn" onClick={clear}>Clear tray</button>}
    </div>
  );
}

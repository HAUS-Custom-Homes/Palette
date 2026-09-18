import Link from "next/link";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { Nav } from "../ui/nav";
import { TrayControls } from "./tray";

export const dynamic = "force-dynamic";

/**
 * REF-01 FR-32. Up to six images side by side at full width, which is what a
 * designer does with printouts on a table and no consumer tool does well.
 * The ids come from the compare tray (localStorage) via the query string, so
 * the page is also a shareable link within the team.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await boot();
  const user = await requireUser();
  const { ids } = await searchParams;
  const wanted = (ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 6);

  const d = await db();
  const rows = wanted.length
    ? await d.query<{ id: string; sha256: string; captionAi: string | null; title: string | null; ownerName: string | null }>(
        `SELECT i.id, a.sha256, i.caption_ai AS "captionAi", i.title, u.name AS "ownerName"
           FROM items i JOIN assets a ON a.id = i.asset_id LEFT JOIN users u ON u.id = i.created_by
          WHERE i.id = ANY($1::uuid[]) AND i.deleted_at IS NULL
          ORDER BY array_position($1::uuid[], i.id)`,
        [wanted],
      )
    : [];

  return (
    <div>
      <Nav user={user} />
      <div className="topbar" style={{ top: 44 }}>
        <Link className="btn" href="/">Library</Link>
        <span style={{ fontFamily: "var(--serif)", fontSize: 16 }}>Compare</span>
        <span className="hint">{rows.length} of 6</span>
        <span style={{ flex: 1 }} />
        <TrayControls ids={rows.map((r) => r.id)} />
      </div>
      {rows.length === 0 ? (
        <div className="empty"><p>The tray is empty. In the library, press <code>c</code> on an image, or select several and choose Compare.</p></div>
      ) : (
        <div className="compare" data-n={rows.length}>
          {rows.map((r) => (
            <figure key={r.id}>
              <Link href={`/item/${r.id}`}><img src={`/api/asset/${r.sha256}/detail`} alt={r.captionAi ?? ""} /></Link>
              <figcaption>{r.captionAi ?? r.title ?? "untitled"}{r.ownerName ? ` · ${r.ownerName}` : ""}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

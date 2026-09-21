import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/db/client";
import { boot } from "@/lib/boot";
import { Nav } from "../../ui/nav";

export const dynamic = "force-dynamic";

/**
 * The last save attempts, for the owner: when "it does not work on my phone",
 * this says whether the phone reached Palette, what it sent and what it was
 * told. Shapes and sizes only; no keys, no contents.
 */
type Row = { at: string; who: string | null; ua: string | null; content_type: string | null; bytes: string | null; status: number | null; ms: number | null; note: string | null };

export default async function AttemptsPage() {
  await boot();
  const user = await requireUser();
  if (user.role !== "owner") notFound();
  const d = await db();
  const rows = await d.query<Row>(
    `SELECT to_char(l.at AT TIME ZONE 'America/Chicago', 'Mon DD HH12:MI:SS AM') AS at,
            coalesce(u.name, u.email) AS who, l.ua, l.content_type, l.bytes::text AS bytes, l.status, l.ms, l.note
       FROM ingest_log l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC LIMIT 40`,
    [],
  );

  return (
    <div>
      <Nav user={user} />
      <div className="page" style={{ maxWidth: 980 }}>
        <div className="hero" style={{ paddingBottom: 14 }}>
          <h1>Save <span>attempts.</span></h1>
          <p>The last 40 things that reached Palette&apos;s save address, newest first. Central time.</p>
        </div>
        <section className="panel">
          {rows.length === 0 ? <p className="hint">Nothing has arrived yet.</p> : (
            <ol className="steps" style={{ listStyle: "none", paddingLeft: 0 }}>
              {rows.map((r, i) => (
                <li key={i} style={{ marginBottom: 12 }}>
                  <b>{r.at}</b> · {r.status ?? "arrived, never answered"}{r.ms != null ? ` in ${r.ms}ms` : ""} · {r.who ?? "no one recognised"}
                  <div className="hint" style={{ wordBreak: "break-word" }}>
                    {r.ua || "no user agent"} · {r.content_type || "no content type"} · {r.bytes ?? "?"} bytes
                    {r.note ? <><br />{r.note}</> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

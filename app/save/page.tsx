import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { listBoards } from "@/boards/boards";
import { boot } from "@/lib/boot";
import { facetCounts } from "@/search/query";
import { Nav } from "../ui/nav";
import { SaveButton } from "./save-button";

export const dynamic = "force-dynamic";

/**
 * The share sheet's interface on an iPhone (2026-09-23). Apple lets no web app
 * into its share card, and a Shortcut that posts to the API blind has nothing
 * to ask and nothing to show. So the Shortcut opens this page instead, with
 * the link in `u`: what is being saved, which haus, which lookbook, a note,
 * one button. It posts to /share exactly as an Android share does, and lands
 * on the post. No key, no headers, no form fields to get wrong.
 */
export default async function SavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await boot();
  const user = await requireUser();
  const sp = await searchParams;
  const shared = [sp.u, sp.url, sp.text, sp.title].filter(Boolean).join(" ");
  const url = shared.match(/https?:\/\/[^\s"'<>]+/)?.[0];
  if (!url) redirect("/capture");

  const [facets, boards] = await Promise.all([facetCounts({}), listBoards(user.id)]);
  const hauses = facets.find((f) => f.key === "project")?.terms ?? [];
  const lookbooks = boards.filter((b) => !b.isSmart);
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* shown as is */ }
  const site = ({ "instagram.com": "Instagram", "tiktok.com": "TikTok", "pinterest.com": "Pinterest", "pin.it": "Pinterest", "youtube.com": "YouTube", "youtu.be": "YouTube" } as Record<string, string>)[host] ?? host;

  return (
    <div>
      <Nav user={user} />
      <div className="page" style={{ maxWidth: 560 }}>
        <form method="post" action="/share" className="savesheet">
          <input type="hidden" name="url" value={url} />
          <h2>Save to Palette</h2>
          <p className="hint" style={{ margin: "0 0 14px", wordBreak: "break-all" }}>
            {site ? <b>{site}</b> : null}{site ? " · " : ""}{url.length > 90 ? `${url.slice(0, 90)}...` : url}
          </p>

          {user.role !== "viewer" && (
            <>
              <div className="facet-label">Which haus is this for? <span className="hint">Optional</span></div>
              <div className="haus-chips">
                <label className="chip"><input type="radio" name="haus" value="" defaultChecked /> None yet</label>
                {hauses.map((h) => (
                  <label className="chip" key={h.slug}><input type="radio" name="haus" value={h.slug} /> {h.label}</label>
                ))}
              </div>

              {lookbooks.length > 0 && (
                <>
                  <div className="facet-label" style={{ marginTop: 14 }}>Lookbook <span className="hint">Optional</span></div>
                  <select name="board" className="search" defaultValue="" style={{ width: "100%" }}>
                    <option value="">None</option>
                    {lookbooks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </>
              )}

              <div className="facet-label" style={{ marginTop: 14 }}>Note <span className="hint">Optional, searchable</span></div>
              <textarea name="note" className="search" rows={2} placeholder="Why this one" style={{ width: "100%", resize: "vertical" }} />
            </>
          )}

          <SaveButton site={site} />
          <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>
            Every picture in the post, at full size. <Link href="/" style={{ color: "var(--muted)", textDecoration: "underline" }}>Cancel</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

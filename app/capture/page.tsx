import { requireUser } from "@/auth";
import { boot } from "@/lib/boot";
import { facetCounts } from "@/search/query";
import { Nav } from "../ui/nav";
import { CaptureForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * REF-01 FR-6, FR-7, FR-8. The phone-first way in, and the one page that
 * opens with no signal (the service worker keeps a copy). On an iPhone, where
 * a web app cannot join the share sheet, this is the home-screen path: open
 * Palette, take or choose photos, done, online or not.
 */
export default async function CapturePage({ searchParams }: { searchParams: Promise<{ queued?: string }> }) {
  await boot();
  const user = await requireUser();
  const sp = await searchParams;
  const hauses = (await facetCounts({})).find((f) => f.key === "project")?.terms ?? [];

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: "20px 16px 60px", maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Save to Palette</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Photos, screenshots or a link. Works with no signal: what you save stays on this phone and uploads by itself later.
        </p>
        {sp.queued && (
          <p className="notice" data-kind="attention" style={{ margin: "0 0 12px" }}>
            <b>Saved on this phone.</b> No signal just now; it will upload when you are back online.
          </p>
        )}
        <CaptureForm hauses={hauses.map((h) => ({ slug: h.slug, label: h.label }))} />
      </div>
    </div>
  );
}

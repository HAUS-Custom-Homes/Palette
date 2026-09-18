import { requireUser } from "@/auth";
import { boot } from "@/lib/boot";
import { listDeviceTokens } from "@/lib/users";
import { gateSummary } from "@/ai/gates";
import { taggerMode } from "@/ai/tagger";
import { config } from "@/config";
import { Nav } from "../ui/nav";
import { Tokens } from "./tokens";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await boot();
  const user = await requireUser();
  const tokens = await listDeviceTokens(user.id);
  const model = taggerMode() === "claude" ? config.ai.model : "heuristic-v1";
  const gates = await gateSummary(model);

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: 20, maxWidth: 820 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Phone and settings</h2>
        <p className="hint" style={{ marginTop: 0 }}>Signed in as {user.email}, role {user.role}.</p>

        <div className="panel">
          <h3>Save from your phone</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Two taps from any app: Share, then Palette. Each phone gets its own token so one can be turned off without
            touching the others.
          </p>
          <Tokens initial={tokens} />
        </div>

        <div className="panel">
          <h3>iPhone: the Shortcut, once</h3>
          <ol className="steps">
            <li>Open <b>Shortcuts</b>, tap <b>+</b>, name it <b>Palette</b>.</li>
            <li>Tap the <b>ⓘ</b> at the bottom, turn on <b>Show in Share Sheet</b>, and under Share Sheet Types keep only <b>Images</b> and <b>URLs</b>.</li>
            <li>Add action <b>Get Contents of URL</b>. URL: <code>{typeof window === "undefined" ? "" : ""}https://YOUR-PALETTE-HOST/api/ingest</code>. Method <b>POST</b>.</li>
            <li>Under Headers add <code>Authorization</code> = <code>Bearer YOUR-TOKEN</code> (from above).</li>
            <li>Request Body: <b>Form</b>. Add field <code>files</code> of type <b>File</b> set to <b>Shortcut Input</b>, and field <code>url</code> of type <b>Text</b> set to <b>Shortcut Input</b>. Whichever one matches what was shared is used.</li>
            <li>Add action <b>Show Notification</b> with text "Saved to Palette". Done.</li>
          </ol>
          <p className="hint">Full write-up with screenshots: <code>docs/SHORTCUT.md</code> in the repo.</p>
        </div>

        <div className="panel">
          <h3>Android: nothing to set up</h3>
          <p className="hint" style={{ margin: 0 }}>
            Open Palette in Chrome, choose <b>Add to Home screen</b>. Palette then appears in the share sheet of every app.
          </p>
        </div>

        <div className="panel">
          <h3>Tag quality gate</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Model <code>{model}</code>. A facet's tags are applied only after <code>npm run eval</code> has recorded a pass for it
            on the golden set; until then they are suggestions.
            {config.ai.trustUngated && <b> PALETTE_TRUST_UNGATED is on: every facet is being applied unmeasured.</b>}
          </p>
          {gates.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>No eval has been run for this model. Everything it tags is suggested. See <code>evals/README.md</code>.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Facet</th><th>Precision</th><th>Recall</th><th>Threshold</th><th>Verdict</th><th>Images</th></tr></thead>
              <tbody>
                {gates.map((g) => (
                  <tr key={g.facet}>
                    <td>{g.facet}</td><td>{g.precision?.toFixed(3)}</td><td>{g.recall?.toFixed(3)}</td><td>{g.threshold}</td>
                    <td style={{ color: g.passed ? "var(--human)" : "var(--warn)" }}>{g.passed ? "applied" : "suggested"}</td><td>{g.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h3>Desktop: the browser extension</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Right-click any image to save it, or use the toolbar button. On your Instagram saved list or a Pinterest
            board it scans, lets you review, and imports what you keep, all from your own logged-in browser.
          </p>
          <ol className="steps">
            <li>Make a token above, named for this computer.</li>
            <li>Load the extension (<code>extension/README.md</code> in the repo has the two commands).</li>
            <li>Open its <b>Settings</b>, enter this Palette's address and the token, <b>Save and test</b>.</li>
          </ol>
          <p className="hint" style={{ margin: 0 }}>You can also drop images on the library page or paste an image URL there.</p>
        </div>
      </div>
    </div>
  );
}

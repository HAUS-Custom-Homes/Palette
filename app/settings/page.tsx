import { requireUser } from "@/auth";
import { boot } from "@/lib/boot";
import { listDeviceTokens } from "@/lib/users";
import { Nav } from "../ui/nav";
import { Tokens } from "./tokens";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await boot();
  const user = await requireUser();
  const tokens = await listDeviceTokens(user.id);

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: 20, maxWidth: 820 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Phone and settings</h2>
        <p className="hint" style={{ marginTop: 0 }}>Signed in as {user.email}, role {user.role}.</p>

        <div className="panel">
          <h3>Save from your phone</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Two taps from any app: Share, then Quarry. Each phone gets its own token so one can be turned off without
            touching the others.
          </p>
          <Tokens initial={tokens} />
        </div>

        <div className="panel">
          <h3>iPhone: the Shortcut, once</h3>
          <ol className="steps">
            <li>Open <b>Shortcuts</b>, tap <b>+</b>, name it <b>Quarry</b>.</li>
            <li>Tap the <b>ⓘ</b> at the bottom, turn on <b>Show in Share Sheet</b>, and under Share Sheet Types keep only <b>Images</b> and <b>URLs</b>.</li>
            <li>Add action <b>Get Contents of URL</b>. URL: <code>{typeof window === "undefined" ? "" : ""}https://YOUR-QUARRY-HOST/api/ingest</code>. Method <b>POST</b>.</li>
            <li>Under Headers add <code>Authorization</code> = <code>Bearer YOUR-TOKEN</code> (from above).</li>
            <li>Request Body: <b>Form</b>. Add field <code>files</code> of type <b>File</b> set to <b>Shortcut Input</b>, and field <code>url</code> of type <b>Text</b> set to <b>Shortcut Input</b>. Whichever one matches what was shared is used.</li>
            <li>Add action <b>Show Notification</b> with text "Saved to Quarry". Done.</li>
          </ol>
          <p className="hint">Full write-up with screenshots: <code>docs/SHORTCUT.md</code> in the repo.</p>
        </div>

        <div className="panel">
          <h3>Android: nothing to set up</h3>
          <p className="hint" style={{ margin: 0 }}>
            Open Quarry in Chrome, choose <b>Add to Home screen</b>. Quarry then appears in the share sheet of every app.
          </p>
        </div>

        <div className="panel">
          <h3>Desktop</h3>
          <p className="hint" style={{ margin: 0 }}>
            Drop images on the library page, or paste an image URL. The browser extension for one-click clipping and
            for importing your existing Instagram and Pinterest saves is the next round.
          </p>
        </div>
      </div>
    </div>
  );
}

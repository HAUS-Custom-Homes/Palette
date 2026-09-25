import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { boot } from "@/lib/boot";
import { Nav } from "../ui/nav";
import { InstallButton, PhoneToken } from "./client";

export const dynamic = "force-dynamic";

/**
 * Getting Palette into the share sheet, which is where saving actually
 * happens. Three platforms, three different rules:
 *
 *   Android and Windows let an installed web app join the system share sheet
 *   (manifest share_target, handled by /share). Install once, done.
 *
 *   iPhone does not let any web app in. The way in is an Apple Shortcut that
 *   shows up in the share sheet under Palette's name and opens /save with the
 *   link (PALETTE_SHORTCUT_URL makes it one tap to add).
 *
 * The page puts the visitor's own device first, keeps each device to three
 * steps, and says what is the same on every phone once (Trevor, 2026-09-24:
 * "the iOS instructions are a mile long").
 */
export default async function InstallPage() {
  await boot();
  const user = await requireUser();
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const device: "iphone" | "android" | "computer" =
    /iPhone|iPad|iPod/i.test(ua) ? "iphone" : /Android/i.test(ua) ? "android" : "computer";
  const host = process.env.AUTH_URL ?? `https://${h.get("x-forwarded-host") ?? h.get("host") ?? "hauspalette.com"}`;
  const shortcutUrl = process.env.PALETTE_SHORTCUT_URL ?? "";

  const site = host.replace(/^https?:\/\//, "");

  // Only what differs by device goes in these three cards. Everything that is
  // the same on every phone (saving a post, photos, help) is said once, below.
  const iphone = (
    <section className="panel" key="iphone" id="iphone">
      <h3>iPhone</h3>
      <ol className="steps big">
        <li><b>Sign in with Safari.</b> Open <code>{site}</code> in Safari (not Chrome) and sign in with your work Google account.</li>
        {shortcutUrl ? (
          <li>
            <b>Add the Shortcut.</b> Tap the button, then <b>Add Shortcut</b>.
            <div style={{ marginTop: 10 }}><a className="btn solid big" href={shortcutUrl}>Add the Palette Shortcut</a></div>
          </li>
        ) : (
          <li><b>Add the Shortcut.</b> Build it once, see <i>Build the Shortcut by hand</i> at the bottom of this page.</li>
        )}
      </ol>
      <p className="tip">
        <b>Tip: put Palette at the top.</b> The first time you share, scroll to the bottom of the share card and tap{" "}
        <b>Edit Actions</b>. Tap the green <b>+</b> next to Palette to add it to your <b>Favorites</b>, then{" "}
        <b>Done</b>. From then on Palette is the first action in the list, no scrolling.
      </p>
    </section>
  );

  const android = (
    <section className="panel" key="android" id="android">
      <h3>Android</h3>
      <ol className="steps big">
        <li><b>Install Palette.</b> <InstallButton /> If the button does nothing, open Chrome&apos;s menu and choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
      </ol>
      <p className="hint" style={{ margin: "4px 0 0" }}>That is all. Palette is now in the share sheet of every app.</p>
    </section>
  );

  const computer = (
    <section className="panel" key="computer" id="computer">
      <h3>Computer</h3>
      <ol className="steps big">
        <li><b>Paste a link</b> into the search box at the top of the library. It saves on paste.</li>
        <li><b>Or install Palette</b> as an app: <InstallButton /> On Windows it then appears in the system <b>Share</b> window.</li>
        <li><b>Or use the browser extension</b> for a Save button on every site. Ask Trevor for it.</li>
      </ol>
    </section>
  );

  const order = device === "iphone" ? [iphone, android, computer] : device === "android" ? [android, iphone, computer] : [computer, iphone, android];

  return (
    <div>
      <Nav user={user} />
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="hero" style={{ paddingBottom: 14 }}>
          <h1>Save from <span>anywhere.</span></h1>
          <p>Set up once per device. Your {device === "computer" ? "computer" : device === "iphone" ? "iPhone" : "Android phone"} is first.</p>
        </div>

        {order[0]}

        <section className="panel">
          <h3>Saving a post</h3>
          <ol className="steps big">
            <li>In Instagram, TikTok, Pinterest or a website, tap <b>Share</b>.</li>
            <li>Tap <b>Palette</b>. {device !== "android" && <span className="hint">On iPhone it is in the list under the row of app icons.</span>}</li>
            <li>Pick the haus and tap <b>Save</b>. A bar shows it working, then the post opens with every picture at full size.</li>
          </ol>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            <b>Photos and screenshots:</b> open Palette, tap <b>+ New</b>, choose photos. Works with no signal.
          </p>
        </section>

        <details className="panel help">
          <summary><h3 style={{ display: "inline" }}>Something not working?</h3></summary>
          <ul className="steps">
            <li><i>Palette is not in the share list</i> (iPhone): scroll down past the app icons. Still missing? In Shortcuts, press and hold Palette, <b>Details</b>, turn on <b>Show in Share Sheet</b>.</li>
            <li><i>It asks to sign in</i>: sign in with Google. It carries on to the save page.</li>
            <li><i>It opens the library instead of the save page</i> (iPhone): delete the Palette shortcut and add it again.</li>
            <li>Anything else: send Trevor a screenshot.</li>
          </ul>
        </details>

        <details className="panel help">
          <summary><h3 style={{ display: "inline" }}>Other devices</h3></summary>
          {order.slice(1)}
        </details>

        <details className="panel help">
          <summary><h3 style={{ display: "inline" }}>Build the Shortcut by hand</h3></summary>
          <ol className="steps">
            <li>Open <b>Shortcuts</b>, tap <b>+</b>, rename it <code>Palette</code>.</li>
            <li>Tap the <b>i</b>, turn on <b>Show in Share Sheet</b>. In the top block tap <b>Any</b>, <b>Clear</b>, switch on only <b>URLs</b>.</li>
            <li>Add the action <b>Open URLs</b>. In its box type <code>{host}/save?u=</code> and tap <b>Shortcut Input</b> right after the <code>=</code>.</li>
          </ol>
          <p className="hint">The older Shortcut with a phone key still works; its key is here.</p>
          <PhoneToken />
        </details>
      </div>
    </div>
  );
}

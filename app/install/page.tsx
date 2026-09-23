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
 *   shows up in the share sheet under Palette's name and posts to /api/ingest
 *   with the person's own token.
 *
 * The page puts the visitor's own device first and says only what they must do.
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

  const iphone = (
    <section className="panel" key="iphone" id="iphone">
      <h3>iPhone and iPad</h3>
      <p className="lead-line">Share, then Palette. From Instagram, TikTok, Pinterest, Safari, anywhere there is a link.</p>
      <p className="hint">
        Apple does not let websites into the share sheet, so Palette gets there as a Shortcut. It is two blocks, takes
        about two minutes once per phone, and needs no key. Sharing opens a small Palette page that asks which haus
        and lookbook, saves the whole post, and shows it.
      </p>

      <ol className="steps big">
        <li>
          <b>Sign in once in Safari.</b> Open <code>{host.replace(/^https?:\/\//, "")}</code> in Safari and sign in
          with Google. The share sheet uses Safari, so this is the sign-in it will use.
        </li>
        {shortcutUrl ? (
          <li>
            <b>Add the Shortcut.</b> Tap the button, then <b>Add Shortcut</b>.
            <div style={{ marginTop: 10 }}><a className="btn solid" href={shortcutUrl}>Add the Palette Shortcut</a></div>
          </li>
        ) : (
          <li>
            <b>Build the Shortcut.</b> Open <b>Shortcuts</b>, Apple&apos;s own app that comes on every iPhone (swipe
            down on the Home Screen and type Shortcuts). Tap <b>+</b>.
            <ol className="steps">
              <li><b>Name it.</b> Tap the name at the top (it says New Shortcut), choose <b>Rename</b>, type <code>Palette</code>.</li>
              <li><b>Put it in the share card.</b> Tap the <b>i</b> in a circle at the bottom. Turn on <b>Show in Share Sheet</b>. Tap <b>Done</b>. A block appears at the top: <i>Receive Any input from Share Sheet</i>.</li>
              <li><b>Say what it accepts.</b> Tap the blue word <b>Any</b> (or <b>Apps and 8 more</b>). Tap <b>Clear</b>, switch on only <b>URLs</b>, tap <b>Done</b>. The block reads <i>Receive URLs from Share Sheet</i>.</li>
              <li><b>Add the one action.</b> Tap <i>Search Actions</i> at the bottom, type <code>Open URLs</code>, tap it.</li>
              <li><b>The address.</b> In that block tap the faint <b>URL</b>. If a blue <b>Shortcut Input</b> bubble is already there, delete it. Type exactly <code>{host}/save?u=</code> and then, with the cursor right after the <code>=</code>, tap <b>Shortcut Input</b> in the strip above the keyboard. The box reads <code>{host}/save?u=</code> followed by the blue bubble.</li>
              <li><b>That is the whole shortcut:</b> <i>Receive URLs</i>, then <i>Open URLs</i>. Nothing else. It saves itself.</li>
            </ol>
            <p className="hint" style={{ marginTop: 8 }}>
              The first time, iPhone asks whether the shortcut may open {host.replace(/^https?:\/\//, "")}: choose <b>Always Allow</b>.
            </p>
          </li>
        )}
        <li>
          <b>Try it.</b> Open any Instagram post, tap the paper plane, then <b>Share to...</b> (or the three dots, then
          <b> Share to...</b>). In the share card, <b>Palette</b> is in the list of actions under the row of app icons,
          next to things like Copy. Tap it: Safari opens Palette&apos;s save page, you pick the haus, tap <b>Save the
          whole post</b>, and the post opens at full size.
        </li>
        <li>
          <b>Pin it to the top.</b> Scroll to the bottom of the share card, tap <b>Edit Actions...</b>, and tap the
          green <b>+</b> beside Palette. It stays at the top from then on.
        </li>
        <li>
          <b>Photos and screenshots.</b> Put Palette on your Home Screen: in Safari open <code>{host.replace(/^https?:\/\//, "")}</code>,
          tap <b>Share</b>, then <b>Add to Home Screen</b>. Open it, tap <b>+ Save</b>, choose photos. It works with no signal.
        </li>
        <li>
          <b>If it does not work:</b>
          <ol className="steps">
            <li><i>Safari opens the sign-in page</i>: sign in with Google, and it continues to the save page by itself.</li>
            <li><i>Safari opens the library instead of a save page</i>: the address in the Open URLs block is not exactly <code>{host}/save?u=</code> with the Shortcut Input bubble after the <code>=</code>.</li>
            <li><i>Palette is not in the share card</i>: open the shortcut, tap the <b>i</b>, check <b>Show in Share Sheet</b>. Look in the list of actions under the app icons, not among the icons.</li>
            <li>Still stuck: take a screenshot of the shortcut and send it to Trevor.</li>
          </ol>
        </li>
      </ol>
      <details style={{ marginTop: 12 }}>
        <summary className="hint">The older Shortcut, with a phone key, still works.</summary>
        <p className="hint">It posts straight to Palette and shows a notification, with no questions asked. If you built it, keep it or replace it; the key below is only for that.</p>
        <PhoneToken />
      </details>
    </section>
  );

  const android = (
    <section className="panel" key="android" id="android">
      <h3>Android</h3>
      <p className="lead-line">Install once. Palette then appears in the share sheet of every app.</p>
      <ol className="steps big">
        <li><b>Install Palette.</b> <InstallButton /> If the button does nothing, open Chrome&apos;s menu and choose <b>Add to Home screen</b> or <b>Install app</b>.</li>
        <li><b>Share to it.</b> In Instagram or anywhere else tap <b>Share</b>, then <b>Palette</b>. A link to a post brings the whole post, every picture and the video when it can be had.</li>
        <li><b>No signal?</b> Photos you save from the Palette app are kept on the phone and upload by themselves when signal returns.</li>
      </ol>
    </section>
  );

  const computer = (
    <section className="panel" key="computer" id="computer">
      <h3>Windows PC and Mac</h3>
      <p className="lead-line">Three ways, pick what suits you.</p>
      <ol className="steps big">
        <li>
          <b>Install Palette as an app.</b> <InstallButton /> In Chrome or Edge you can also use the install icon at the
          right of the address bar. On Windows, Palette then appears in the system <b>Share</b> window, the one Edge,
          Photos and the Snipping Tool open.
        </li>
        <li><b>Paste a link.</b> Copy a post&apos;s link and paste it into the dashed box on the library page. It saves on paste.</li>
        <li><b>The browser extension</b> adds a Palette button and a right-click <b>Save image to Palette</b> on every site. Ask Trevor for it; it is being published to the company&apos;s Chrome.</li>
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
          <p>Put Palette in your share sheet. Your {device === "computer" ? "computer" : device === "iphone" ? "iPhone" : "Android phone"} is first below.</p>
        </div>
        {order}
      </div>
    </div>
  );
}

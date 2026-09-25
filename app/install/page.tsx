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

  const site = host.replace(/^https?:\/\//, "");
  const buildSteps = (
    <ol className="steps">
      <li><b>Name it.</b> Tap the name at the top (it says New Shortcut), choose <b>Rename</b>, type <code>Palette</code>.</li>
      <li><b>Put it in the share card.</b> Tap the <b>i</b> in a circle at the bottom. Turn on <b>Show in Share Sheet</b>. Tap <b>Done</b>. A block appears at the top: <i>Receive Any input from Share Sheet</i>.</li>
      <li><b>Say what it accepts.</b> Tap the blue word <b>Any</b> (or <b>Apps and 8 more</b>). Tap <b>Clear</b>, switch on only <b>URLs</b>, tap <b>Done</b>.</li>
      <li><b>Add the one action.</b> Tap <i>Search Actions</i> at the bottom, type <code>Open URLs</code>, tap it.</li>
      <li><b>The address.</b> Tap the faint <b>URL</b> in that block. If a blue <b>Shortcut Input</b> bubble is already there, delete it. Type <code>{host}/save?u=</code> and then tap <b>Shortcut Input</b> in the strip above the keyboard, so the bubble sits right after the <code>=</code>.</li>
      <li><b>Done.</b> Two blocks: <i>Receive URLs</i>, then <i>Open</i>. It saves itself.</li>
    </ol>
  );

  const iphone = (
    <section className="panel" key="iphone" id="iphone">
      <h3>iPhone and iPad</h3>
      <p className="lead-line">Save any post from Instagram, TikTok, Pinterest or a website in two taps: Share, then Palette.</p>
      <p className="hint">About three minutes, once per phone. You only need to do this once.</p>

      <ol className="steps big">
        <li>
          <b>Sign in with Safari.</b> Open the <b>Safari</b> app (the blue compass, not Chrome), go to{" "}
          <code>{site}</code> and tap <b>Sign in with Google</b>. Use your @hauscustomhomes.com account. Saving from the
          share button opens Safari, so this is the sign-in it will use.
        </li>

        {shortcutUrl ? (
          <li>
            <b>Add Palette to your share button.</b> On this phone, tap the button below.
            <div style={{ margin: "12px 0 8px" }}><a className="btn solid big" href={shortcutUrl}>Add the Palette Shortcut</a></div>
            Apple&apos;s <b>Shortcuts</b> app opens with a card called <b>Palette</b>. Tap <b>Add Shortcut</b> at the
            bottom of the card. Nothing to type, nothing to set up.
            <p className="hint" style={{ marginTop: 8 }}>
              If a web page opens instead of the Shortcuts app, Shortcuts was removed from this phone. Get it free from
              the App Store (search <b>Shortcuts</b>, made by Apple), then come back here and tap the button again.
            </p>
          </li>
        ) : (
          <li>
            <b>Add Palette to your share button.</b> Open <b>Shortcuts</b>, Apple&apos;s own app (swipe down on the Home
            Screen and type Shortcuts). Tap <b>+</b>.
            {buildSteps}
          </li>
        )}

        <li>
          <b>Save your first post.</b> Open a post in Instagram and tap the <b>paper plane</b> under it. In the row
          along the bottom, swipe to the end and tap <b>Share</b> (a square with an arrow). The iPhone share card slides
          up.
          <ul className="steps">
            <li>Scroll down past the row of app icons. <b>Palette</b> is in the list of actions below them, next to
              things like Copy. (It is never in the row of app icons; Apple keeps that for App Store apps.)</li>
            <li>Tap <b>Palette</b>. The first time, the iPhone asks if Palette may open {site}: tap <b>Always Allow</b>.</li>
            <li>Palette opens in Safari. Pick the haus, a lookbook if you like, add a note if you like, and tap
              <b> Save the whole post</b>. Every picture comes in at full size.</li>
          </ul>
          <p className="hint">TikTok: tap <b>Share</b> (the arrow), then <b>More</b> or <b>Share to</b>. Pinterest:
            tap the share icon on the pin. Safari: the share button at the bottom. Then Palette, the same way.</p>
        </li>

        <li>
          <b>Put Palette at the top of the list.</b> In the share card, scroll to the very bottom and tap{" "}
          <b>Edit Actions...</b>. Tap the green <b>+</b> next to Palette, then <b>Done</b>. From now on Palette is the
          first thing in the list.
        </li>

        <li>
          <b>Photos and screenshots.</b> The share button only passes links. For pictures on your phone, add Palette to
          your Home Screen: in Safari at <code>{site}</code>, tap the share button, then <b>Add to Home Screen</b>. Open
          it, tap <b>+ Save</b>, and choose photos. It works even with no signal.
        </li>

        <li>
          <b>If something is off:</b>
          <ol className="steps">
            <li><i>Palette is not in the share card</i>: scroll down past the app icons, it is in the list below. Still
              missing? Open Shortcuts, press and hold Palette, tap <b>Details</b>, turn on <b>Show in Share Sheet</b>.</li>
            <li><i>It opens a sign-in page</i>: sign in with Google in Safari. It carries on to the save page.</li>
            <li><i>It opens the library instead of the save page</i>: delete the Palette shortcut and add it again with
              the button above.</li>
            <li>Anything else: take a screenshot and send it to Trevor.</li>
          </ol>
        </li>
      </ol>

      {shortcutUrl && (
        <details style={{ marginTop: 12 }}>
          <summary className="hint">Build the Shortcut by hand instead</summary>
          <p className="hint">Open Shortcuts, tap <b>+</b>, then:</p>
          {buildSteps}
        </details>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="hint">The older Shortcut, with a phone key, still works.</summary>
        <p className="hint">It saves straight away with no questions and shows a notification. The key below is only for that one.</p>
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
        <li><b>Paste a link.</b> Copy a post&apos;s link and paste it into the search box at the top of the library. It saves on paste, every picture at full size.</li>
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

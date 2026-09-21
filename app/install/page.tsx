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
      <p className="lead-line">Share, then Palette. From Instagram, Pinterest, Safari, Photos, anywhere.</p>
      <p className="hint">
        Apple does not let websites into the share sheet, so Palette gets there as a Shortcut. It takes about three
        minutes, once per phone, and after that it is the same two taps as any app.
      </p>

      <ol className="steps big">
        <li>
          <b>Make this phone&apos;s key.</b> It lets the Shortcut save as you, and can be switched off on its own if the
          phone is lost.
          <PhoneToken />
        </li>
        {shortcutUrl ? (
          <li>
            <b>Add the Shortcut.</b> Tap the button, then <b>Add Shortcut</b>. When it asks for your key, paste it.
            <div style={{ marginTop: 10 }}><a className="btn solid" href={shortcutUrl}>Add the Palette Shortcut</a></div>
          </li>
        ) : (
          <li>
            <b>Build the Shortcut.</b> Open <b>Shortcuts</b>, Apple&apos;s own app that comes on every iPhone (a dark
            icon with overlapping pink and blue shapes; swipe down on the Home Screen and type Shortcuts, or get it free
            from the App Store if you removed it). Tap <b>+</b> and name the new shortcut <b>Palette</b>.
            <ol className="steps">
              <li>Tap the <b>i</b> at the bottom. Turn on <b>Show in Share Sheet</b>. Under <b>Share Sheet Types</b>, keep only <b>Images</b>, <b>Media</b> and <b>URLs</b>.</li>
              <li>Add the action <b>Get Contents of URL</b>. Set URL to <code>{host}/api/ingest</code></li>
              <li>Tap <b>Show More</b>. Method: <b>POST</b>. Add a header: key <code>Authorization</code>, and for the value paste your key from step 1 (it already starts with the word Bearer).</li>
              <li>Request Body: <b>Form</b>. Add a field <code>files</code>, type <b>File</b>, value <b>Shortcut Input</b>.</li>
              <li>Add the action <b>Get Dictionary Value</b>: get <b>Value</b> for <code>message</code>.</li>
              <li>Add the action <b>Show Notification</b> and put the <b>Dictionary Value</b> in it. Done.</li>
            </ol>
          </li>
        )}
        <li>
          <b>Try it.</b> Open any Instagram post, tap the paper plane, then <b>Share to...</b> (or the three dots, then
          <b> Share to...</b>). The iPhone share card slides up. <b>Palette</b> is in the list of actions under the row
          of app icons, next to things like Copy and Save Image. It is not in the row of app icons: Apple keeps that
          row for App Store apps.
        </li>
        <li>
          <b>Pin it to the top.</b> Scroll to the bottom of the share card, tap <b>Edit Actions...</b>, and tap the
          green <b>+</b> beside Palette. It stays at the top of the list from then on.
        </li>
        <li>
          <b>Put Palette on your Home Screen.</b> In Safari open <code>{host.replace(/^https?:\/\//, "")}</code>, tap
          <b> Share</b>, then <b>Add to Home Screen</b>. It opens like an app and the save page works with no signal.
        </li>
      </ol>
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

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
      <p className="lead-line">Share, then Palette. From Instagram, Pinterest, TikTok, Safari, anywhere there is a link.</p>
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
              <li><b>Name it.</b> Tap the name at the top of the screen (it says something like New Shortcut), choose <b>Rename</b>, type <code>Palette</code>.</li>
              <li><b>Put it in the share card.</b> Tap the <b>i</b> in a circle at the bottom of the screen. Turn on <b>Show in Share Sheet</b>. Tap <b>Done</b>. A new block appears at the top of your shortcut that reads <i>Receive Any input from Share Sheet</i>.</li>
              <li><b>Say what it accepts.</b> In that block tap the blue words (<b>Any</b>, or <b>Apps and 8 more</b>). Tap <b>Clear</b>, then switch on only <b>URLs</b>. Tap <b>Done</b>. The block now reads <i>Receive URLs from Share Sheet</i>. This matters: with everything switched on, Instagram hands over something that is not a link and nothing is saved.</li>
              <li><b>Add the sending step.</b> Tap the search bar at the bottom (<i>Search Actions</i>), type <code>Get Contents of URL</code>, and tap it. It lands under the first block.</li>
              <li><b>The address.</b> In the new block tap the address box. iPhone often drops a blue <b>Shortcut Input</b> bubble in there by itself: delete it. Then type exactly: <code>{host}/api/ingest</code> so that the box holds the typed address and nothing else.</li>
              <li><b>Open its options.</b> Tap the small arrow <b>&gt;</b> at the right of that block. Tap <b>Method</b> and choose <b>POST</b>.</li>
              <li><b>What to send.</b> Tap <b>Request Body</b> and choose <b>Form</b>. (Leave <b>Headers</b> alone; you do not need it.)</li>
              <li><b>Your key.</b> Tap <b>Add new field</b>, choose <b>Text</b>. On the left, where it says Key, type <code>key</code>. On the right, where it says Text, paste the key you copied in step 1.</li>
              <li><b>The link.</b> Tap <b>Add new field</b>, choose <b>Text</b>. Left: <code>url</code>, typed letter by letter (picking it from the keyboard&apos;s suggestions adds a space). Right: tap the box, then tap <b>Shortcut Input</b> in the strip above the keyboard. You now have two rows: <code>key</code> and <code>url</code>.</li>
              <li><b>Show the answer.</b> Search actions for <code>Show Notification</code> and tap it. Tap its text (it says Hello World), delete that, and tap <b>Contents of URL</b> in the strip above the keyboard. Your shortcut is now three blocks, in this order: <i>Receive</i>, <i>Get contents of</i>, <i>Show notification</i>. Nothing else.</li>
              <li><b>Test it.</b> There is nothing to save: the shortcut saves itself as you go. Tap the <b>Play</b> button at the bottom right. With nothing shared, the right answer is a notification that says Palette <i>found no picture or link</i>. That means the phone reached Palette and your key was accepted.</li>
            </ol>
            <p className="hint" style={{ marginTop: 8 }}>
              The first time you use it, iPhone asks whether Palette may send to {host.replace(/^https?:\/\//, "")}: choose
              <b> Always Allow</b>. It may also ask to allow notifications from Shortcuts: <b>Allow</b>, or you will not see
              the confirmation.
            </p>
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
          <b>If it does not work,</b> the notification tells you why.
          <ol className="steps">
            <li><i>No key arrived</i>: the form has no row named <code>key</code>, or its right-hand box is empty. Paste your key there.</li>
            <li><i>That key is not active</i>: the key in the shortcut is not one Palette knows. Tap <b>Make my key</b> above, copy, and replace what is in the <code>key</code> row.</li>
            <li><i>The network connection was lost</i>: try once more, then try with Wi-Fi off. If it only fails on one Wi-Fi network, that network is blocking it; tell Trevor.</li>
            <li><i>found no picture or link</i>: the first block accepts more than <b>URLs</b>, or the <code>url</code> row is not set to <b>Shortcut Input</b>.</li>
            <li><i>couldn&apos;t convert from Rich Text</i>, or a notification full of code: the address box has a blue <b>Shortcut Input</b> bubble in it. Delete the bubble and leave only the typed address.</li>
            <li><b>No notification at all:</b> notifications for Shortcuts are off (Settings, Notifications, Shortcuts), or the address in the URL block has a typo.</li>
            <li><b>Palette is not in the share card:</b> open the shortcut, tap the <b>i</b>, and check <b>Show in Share Sheet</b> is on. Then look in the list of actions under the app icons, not among the icons.</li>
            <li>Still stuck: take a screenshot of the shortcut and send it to Trevor.</li>
          </ol>
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

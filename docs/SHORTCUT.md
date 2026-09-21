# Saving to Palette from an iPhone

Two taps from any app: **Share**, then **Palette**. This works from Instagram, Pinterest, Safari,
Photos, Screenshots, anywhere the share sheet appears. Setup takes about two minutes, once per
phone.

Why a Shortcut and not an app: Apple does not let web apps into the iOS share sheet. A Shortcut
does appear there, under its own name and icon, and it posts straight to Palette. It is the
same two taps a native app would give you, without an App Store.

**The easy way: open Palette on the phone, tap your initials, then "Get the app and share
sheet".** That page makes the key, shows the exact values with copy buttons, and is the current
version of these steps. What follows is the same thing on paper.

## 1. Get a key for this phone

On the "Get the app" page tap **Make my key**, then **Copy**. It is shown once, and it is copied
with the word `Bearer` in front, ready to paste. Each phone gets its own so one can be switched
off without touching the others.

## 2. Build the Shortcut

The page "Get the app and share sheet" in Palette has these same steps with your own address
filled in. Button names are from recent versions of iOS and may differ by a word on yours.

1. Open **Shortcuts** (Apple's own app, on every iPhone: a dark icon with overlapping pink and
   blue shapes). Tap **+** at the top right.
2. **Name it.** Tap the name at the top, **Rename**, type `Palette`.
3. **Put it in the share card.** Tap the **i** in a circle at the bottom. Turn on **Show in Share
   Sheet**. **Done.** A block appears at the top: *Receive Any input from Share Sheet*.
4. **Say what it accepts.** Tap the blue **Any**. Clear everything, then switch on only
   **Images**, **Media** and **URLs**. **Done.**
5. **Add the sending step.** In the search bar at the bottom type `Get Contents of URL` and tap it.
6. **The address.** Tap the faint blue **URL** and type exactly `https://hauspalette.com/api/ingest`
7. **Options.** Tap the small arrow at the right of that block. **Method**: **POST**.
8. **What to send.** **Request Body**: **Form**. Leave **Headers** alone.
9. **Your key.** **Add new field**, **Text**. Left box `key`, right box: paste the key from step 1.
   Then **Add new field**, **Text** again: left `url`, right **Shortcut Input** (from the strip
   above the keyboard).
10. **And the picture.** **Add new field**, **File**, key `files`, value **Shortcut Input**.
    Two fields because a share is sometimes a link and sometimes a picture; Palette uses
    whichever has something in it.
11. **Show the answer.** Add the action `Show Notification`. Replace "Hello World" with the
    **Contents of URL** variable. Palette answers a Shortcut in plain words, so there is no
    step in between. Three blocks in all: Receive, Get contents of, Show notification.
13. **Test.** Newer iOS has no Done button; the shortcut saves itself. Press **Play** (bottom
    right). With nothing shared, the right answer is "found no picture or link": the phone reached
    Palette and the key was accepted. First real use: iPhone asks to allow sending to hauspalette.com (**Always Allow**) and
    perhaps to allow Shortcuts notifications (**Allow**).

The notification then says "Saved to Palette · 7 items", "Already in Palette", or exactly why it
could not save (a bad key, nothing to save, a post that could not be read).

## Sharing the Shortcut with the team (Trevor, once)

Build it on one iPhone, then in the Shortcuts app long-press it, **Share**, **Copy iCloud Link**.
Before sharing, open the Shortcut, tap the **i**, **Setup**, **Add Question**, and point it at the
header value with the prompt "Paste your Palette key", so your own key is not shared and each
person is asked for theirs. Send the link to Claude and it goes on the "Get the app" page as a
one-tap **Add the Palette Shortcut** button (`PALETTE_SHORTCUT_URL` in Railway).

## 3. Use it

In any app, tap **Share**. **Palette** is in the list of actions under the row of app icons (next to Copy and Save Image), not in the row of icons, which Apple keeps for App Store apps. To pin it to the top: scroll to the bottom of the share card, **Edit Actions...**, green **+** beside Palette. In Instagram, tap the paper plane and then **Share to...** to reach the iPhone share card. The notification confirms it.
The image is in the library in a few seconds and tagged within about a minute. If you shared
a screenshot, nothing is fetched from anywhere: the picture itself is what gets saved, which is
the most reliable path there is.

## When a share does not save

- A **link** to an Instagram post works when the post is public. Palette brings every picture in
  it, and the video when Instagram offers the file. When a link fails, take a screenshot and
  share that instead. Screenshots always work.
- If every share fails, the token was probably revoked or mistyped. Make a new one.
- Anything the tagger cannot handle after three tries lands on your **Needs me** list. The
  image is safe either way; only the tags are missing.

## No signal (job sites, basements, the lake)

Add Palette to your Home Screen (Safari, Share, **Add to Home Screen**) and open it once while
online. From then on, **Capture** opens even with no signal: choose or take photos, pick a haus,
and they are kept on the phone and upload by themselves.

- **Android** uploads in the background the moment signal returns, even with Palette closed.
- **iPhone** has no background upload for web apps. The photos upload the next time you open
  Palette with a connection; a pill at the bottom shows how many are waiting.
- The Shortcut above needs a connection, because Shortcuts cannot queue. With no signal, use
  Capture in the Home Screen app instead.
- Nothing is ever duplicated by a retry. The server stores by content, so sending the same photo
  twice is one image.

## Android

Nothing to build. Open Palette in Chrome, choose **Add to Home screen**. Palette then appears in
the share sheet of every app on the phone.

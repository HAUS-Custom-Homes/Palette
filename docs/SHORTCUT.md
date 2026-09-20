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

1. Open the **Shortcuts** app. Tap **+** to make a new one. Name it **Palette**.
2. Tap the **i** at the bottom of the screen. Turn on **Show in Share Sheet**.
   Under **Share Sheet Types**, keep only **Images**, **Media** and **URLs**.
3. Add the action **Get Contents of URL**.
   - URL: `https://hauspalette.com/api/ingest`
   - Tap **Show More**. Method: **POST**
   - Headers: add one. Key `Authorization`, value: paste your key (it starts with `Bearer`)
   - Request Body: **Form**
   - Add a field: key `files`, type **File**, value **Shortcut Input**
   One field is enough. A picture goes up as a picture; a link goes up as a link and Palette
   finds it, then brings the whole post: every image, and the video when it can be had.
4. Add the action **Get Dictionary Value**: get **Value** for `message`.
5. Add the action **Show Notification** and put the **Dictionary Value** in it. It will say
   "Saved to Palette · 7 items", "Already in Palette", or why it could not save.
6. Done. The first time you use it, iOS asks to allow the connection to hauspalette.com: **Always Allow**.

## Sharing the Shortcut with the team (Trevor, once)

Build it on one iPhone, then in the Shortcuts app long-press it, **Share**, **Copy iCloud Link**.
Before sharing, open the Shortcut, tap the **i**, **Setup**, **Add Question**, and point it at the
header value with the prompt "Paste your Palette key", so your own key is not shared and each
person is asked for theirs. Send the link to Claude and it goes on the "Get the app" page as a
one-tap **Add the Palette Shortcut** button (`PALETTE_SHORTCUT_URL` in Railway).

## 3. Use it

In any app, tap **Share**, then **Palette** in the list of apps. The notification confirms it.
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

# Saving to Quarry from an iPhone

Two taps from any app: **Share**, then **Quarry**. This works from Instagram, Pinterest, Safari,
Photos, Screenshots, anywhere the share sheet appears. Setup takes about two minutes, once per
phone.

Why a Shortcut and not an app: Apple does not let web apps into the iOS share sheet. A Shortcut
does appear there, under its own name and icon, and it posts straight to Quarry. It is the
same two taps a native app would give you, without an App Store.

## 1. Get a token for this phone

In Quarry, open **Phone and settings**, type a name for the phone (for example "Trevor iPhone")
and tap **New phone token**. Copy the token. It is shown once. Each phone gets its own so one can
be turned off without touching the others.

## 2. Build the Shortcut

1. Open the **Shortcuts** app. Tap **+** to make a new one. Name it **Quarry**.
2. Tap the **ⓘ** icon at the bottom of the screen.
   Turn on **Show in Share Sheet**.
   Under **Share Sheet Types**, deselect everything except **Images** and **URLs**.
3. Add the action **Get Contents of URL**.
   - URL: `https://YOUR-QUARRY-HOST/api/ingest`
   - Tap **Show More**.
   - Method: **POST**
   - Headers: add one. Key `Authorization`, value `Bearer PASTE-YOUR-TOKEN-HERE`
   - Request Body: **Form**
   - Add a field: key `files`, type **File**, value **Shortcut Input**
   - Add a field: key `url`, type **Text**, value **Shortcut Input**
   Whichever field matches what was shared is used. An image fills `files`; a link fills `url`.
4. Add the action **Show Notification**. Text: `Saved to Quarry`.
5. Done.

## 3. Use it

In any app, tap **Share**, then **Quarry** in the list of apps. The notification confirms it.
The image is in the library in a few seconds and tagged within about a minute. If you shared
a screenshot, nothing is fetched from anywhere: the picture itself is what gets saved, which is
the most reliable path there is.

## When a share does not save

- A **link** to an Instagram or Pinterest post only works when the post is public and Meta is
  serving the image to unauthenticated fetches. That is a moving target. When it fails, take a
  screenshot and share that instead. Screenshots always work.
- If every share fails, the token was probably revoked or mistyped. Make a new one.
- Anything the tagger cannot handle after three tries lands on your **Needs me** list. The
  image is safe either way; only the tags are missing.

## Android

Nothing to build. Open Quarry in Chrome, choose **Add to Home screen**. Quarry then appears in
the share sheet of every app on the phone.

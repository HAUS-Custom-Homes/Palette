# REF-02: A post is a post

Status: **approved by Trevor on the mock ("way better, roll it out"), slices 1 to 3 built and deployed 2026-09-20.** Slice 4 (iPhone Shortcut) and the critic pass are next. Supersedes the
"each slide is its own item, video is a still and a link" decision in HANDOFF (2026-09-20
morning). That decision rested on a claim that was wrong: that Stasht does not keep media.

## Why this exists

Trevor, on the live site: "this is clunky and does not work well", then: "you need to deep
research the way Stasht saves posts. It's so much cleaner. Videos play, carousels aren't broken
apart into pieces."

He was right on both counts. A seven-image post became seven tiles with the same title, and a
video became a picture of a video.

## What the research found

First-hand, in Trevor's own Stasht account (read only), 2026-09-20:

- One card per post. The card is the cover, a source icon and a short AI-written title. No tags.
- The detail view is a full-width slider: "1 / 5" counter, dots with the current one stretched
  into a pill, a next arrow, a thumbnail strip on desktop, tap for full screen.
- A Reel **plays inside Stasht from Stasht's own copy**: a plain `<video>` (720x1280 MP4, 35 s),
  autoplay, muted, custom mute and full-screen buttons, poster from the same storage. Images are
  also their own copies, at 1440 wide. Their marketing says "not a downloader"; the product
  stores everything.
- Under the media: View on Instagram, saved-when, the AI title, @handle and date, the full
  caption, tags with **suggested tags as "+" chips that apply only when tapped**, a note.
- Nothing is asked at save time. Everything else arrives afterwards.

From the three research reports (sources in the session log):

- Instagram's public, signed-out embed page carries every slide's full-size image, and for many
  (not all) videos a progressive MP4 `video_url`. Those URLs expire in about a day and a half, so
  the file must be downloaded at save time and never hot-linked. Some posts give only a poster.
- A 35 to 70 second Reel from that page is roughly 3 to 15MB. A thousand is about 10GB, which is
  inside R2's free tier; 200GB is about $3 a month. No transcoding is needed at this size.
- An installed web app still cannot join the iPhone share sheet. The best no-app route is an
  Apple Shortcut in the share sheet that posts the link with the person's token. A thin native
  wrapper is the step after that if the Shortcut still feels clunky.
- Every admired product saves in one tap, confirms at once with Undo and an optional "add to
  project", and never waits for the AI.

## Decisions

1. **The item is the post.** One item, an ordered list of media (images and videos), one cover.
   The library shows one card per post.
2. **Palette keeps its own copy of everything it can get, video included.** Permanence is the
   first pillar (REF-01). Originals stay immutable and content-addressed; a video gets a poster
   and is served with range requests so it seeks.
3. **Acquisition order, never with anyone's credentials (R-1 unchanged):** the public embed page
   at save time; then the extension in the person's own browser; then poster and link, stated
   plainly on the page ("Instagram would not give Palette this video. The cover is kept.").
4. **A designer can still single out a slide without breaking the post:** "Make cover" per post;
   a board entry may point at a post **and** a slide; "Keep this frame" on a video makes a still
   that lives inside the same post. Tags and the haus belong to the post. Notes may name a slide.
5. **The card carries no tags.** Cover, haus pill, a stack or play mark, a short plain title.
6. **Suggested tags are "+" chips on the detail page**, applied only when tapped. This is FR-18's
   `suggested` state, shown the way people already understand.
7. **Save is one action with no questions**, confirmed at once with Undo and recent hauses as
   chips. Tagging, titles and embedding happen afterwards and never block or shift the layout.
8. **Out of scope on purpose:** maps, calendar, reminders, public discovery, "what else we found".

## Data model

**As built (simpler than first drawn, same behaviour):** every picture or video of a post is
still its own `items` row, and `items.group_id` ties them into one post. The **lead** is the row
whose `group_id` is its own id: it carries the title, haus, tags, notes and board spots.
`is_cover` marks the member whose picture stands for the post; `group_pos` orders them. A video
member's `asset_id` is its poster and `video_asset_id` is the file (`assets.duration_s`). Search
lists leads only and looks inside each post for tags, colour, video and visual matches
(`MEMBER`, `toPosts()` in `src/search/query.ts`). This kept search, embeddings, near-duplicate
detection and the integrity scrub working per picture with no rewrite. The original sketch:


- `items` stays the unit people see. New table `item_media (item_id, position, asset_id, kind
  image|video, poster_asset_id, duration_s, width, height, source_slide_index, frame_of_media_id,
  frame_time_s)`. `items.asset_id` becomes the cover and is kept in step with
  `items.cover_media_id`.
- `assets` gains `kind` and, for video, `duration_s`. Same sha256 addressing, same immutability
  trigger, same integrity scrub.
- `board_items` gains a nullable `media_id`.
- Migration folds today's per-slide items into one item per `sources.post_id`, carrying over
  human tags, notes, boards and the earliest `captured_at`. Reversible by construction: no asset
  or source row is deleted.
- Search, embeddings and near-duplicate detection run per media and resolve to the post.

## How it gets built: the loop

Roles are separate on purpose. The builder never grades its own work.

| Role | Does | Does not |
|---|---|---|
| Designer | Owns the mock and the copy. Signs off each screen against the mock at 390px and 1440px. | Write code. |
| Builder | Implements one slice at a time behind the existing tests. | Decide it is done. |
| Critic | Fresh context. Sees only the acceptance list and the live site. Drives hauspalette.com in a real browser with real posts, at phone and desktop widths, and scores each line pass or fail with a screenshot. | See the diff or the builder's notes. |
| Trevor | Five minutes on his own iPhone at the end of each slice. | Anything else. |

A slice ships only when every line below that it touches passes on the **live site**.

## Acceptance list ("done" means all of these, on hauspalette.com, with real posts)

Saving
- [ ] Pasting `instagram.com/p/DdhLiUgnFBU` makes **one** card. Opening it shows 7 slides at full size.
- [ ] Pasting a Reel link makes one card whose video plays within 2 seconds of opening, muted, with working mute and full-screen buttons, from a Palette URL.
- [ ] A post Instagram will not hand over still saves, shows its cover, and says why in one plain sentence.
- [ ] The confirmation appears in under 1 second after the server answers, offers Undo and recent hauses, and Undo really removes the post.
- [ ] Saving the same link twice says "already in your library" and opens it.

Library
- [ ] No tile is ever blank or black. Every image has its size reserved, so nothing jumps.
- [ ] A post with several media shows a stack mark and count; a video shows a play mark and length.
- [ ] Titles are short and plain. No paragraph captions, no tracking junk, no repeated title across tiles.
- [ ] First row of pictures is visible without scrolling on a 390x844 phone.

Post page
- [ ] Swipe, arrow buttons, arrow keys and dots all move the carousel; the counter is always right.
- [ ] "Make cover" changes the library card and any board that shows the post.
- [ ] Suggested tags are "+" chips; tapping one applies it; nothing is applied otherwise.
- [ ] A video slide inside a carousel pauses when swiped away.
- [ ] Back returns to the same scroll position in the library.

Everywhere
- [ ] Nothing a person reads contains a variable name, an error code or the word "heuristic".
- [ ] Every screen has an empty state, a loading state and an error state in plain words.
- [ ] Largest picture paints in under 2.5 s on throttled 4G; taps respond in under 200 ms.
- [ ] Tap targets are at least 44px; focus is visible; every image has alt text.
- [ ] The existing guarantees still hold: originals immutable, human tags never overwritten, integrity scrub passes.

import { describe, expect, it } from "vitest";
import { cleanUrl } from "@/ingest/page-preview";
import { cookieHeader, isTikTokUrl, tikTokFromHtml, tikTokIdOf } from "@/ingest/tiktok";

/** TikTok's public page carries the post as JSON. These are the shapes seen on 2026-09-20. */
const page = (itemStruct: unknown) =>
  `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct } } },
  })}</script></html>`;

const rendition = (codec: string, bitrate: number, w: number, h: number, tag: string) => ({
  Bitrate: bitrate, CodecType: codec, PlayAddr: { UrlList: [`https://v16.tiktok.com/video/${tag}.mp4`], Width: w, Height: h },
});

describe("recognising TikTok", () => {
  it("knows its links, long and short, and the post id", () => {
    expect(isTikTokUrl("https://www.tiktok.com/@scout2015/video/6718335390845095173")).toBe(true);
    expect(isTikTokUrl("https://vm.tiktok.com/ZMabc123/")).toBe(true);
    expect(isTikTokUrl("https://www.tiktok.com/t/ZTabc/")).toBe(true);
    expect(isTikTokUrl("https://nottiktok.com/@x/video/1234567")).toBe(false);
    expect(tikTokIdOf("https://www.tiktok.com/@scout2015/video/6718335390845095173?_t=abc")).toBe("6718335390845095173");
    expect(tikTokIdOf("https://www.tiktok.com/@x/photo/7300000000000000001")).toBe("7300000000000000001");
  });

  it("strips what only identifies the person who shared it", () => {
    expect(cleanUrl("https://www.tiktok.com/@a/video/123456789?_t=8abc&_r=1&is_from_webapp=1&sender_device=pc"))
      .toBe("https://www.tiktok.com/@a/video/123456789");
  });
});

describe("reading a TikTok page", () => {
  it("picks the best rendition every browser can play, not the biggest number", () => {
    const post = tikTokFromHtml(page({
      id: "6718335390845095173", desc: "Steel doors to a study #design", author: { uniqueId: "scout2015" },
      video: {
        playAddr: "https://v16.tiktok.com/video/default.mp4", cover: "https://p16.tiktokcdn.com/cover.jpg", originCover: "https://p16.tiktokcdn.com/origin.jpg",
        width: 576, height: 1024, duration: 10,
        bitrateInfo: [rendition("h265_hvc1", 9_000_000, 1080, 1920, "hevc"), rendition("h264", 2_240_963, 576, 1024, "best264"), rendition("h264", 992_286, 576, 1024, "low264")],
      },
    }))!;
    expect(post.id).toBe("6718335390845095173");
    expect(post.author).toBe("scout2015");
    expect(post.video).toMatchObject({ url: "https://v16.tiktok.com/video/best264.mp4", width: 576, height: 1024, durationS: 10, cover: "https://p16.tiktokcdn.com/origin.jpg" });
    expect(post.images).toEqual([]);
  });

  it("falls back to the default address when no renditions are listed", () => {
    const post = tikTokFromHtml(page({ id: "1234567", video: { playAddr: "https://v16.tiktok.com/video/only.mp4", cover: "https://p16.tiktokcdn.com/c.jpg" } }))!;
    expect(post.video?.url).toBe("https://v16.tiktok.com/video/only.mp4");
  });

  it("reads a photo post as its pictures, in order, and not as a video", () => {
    const post = tikTokFromHtml(page({
      id: "7300000000000000001", desc: "Kitchen details", author: { uniqueId: "studio" },
      video: { playAddr: "https://v16.tiktok.com/audio-track.mp4" },
      imagePost: { images: [1, 2, 3].map((n) => ({ imageURL: { urlList: [`https://p16.tiktokcdn.com/photo${n}.jpg`] }, imageWidth: 1080, imageHeight: 1440 })) },
    }))!;
    expect(post.video).toBeUndefined();
    expect(post.images.map((i) => i.url)).toEqual([1, 2, 3].map((n) => `https://p16.tiktokcdn.com/photo${n}.jpg`));
    expect(post.images[0]).toMatchObject({ width: 1080, height: 1440 });
  });

  it("gives nothing for a page without a post: private, removed, or a login wall", () => {
    expect(tikTokFromHtml("<html>Log in to TikTok</html>")).toBeNull();
    expect(tikTokFromHtml(page({ id: "1", desc: "no media" }))).toBeNull();
    expect(tikTokFromHtml(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{not json</script>`)).toBeNull();
  });
});

describe("the visitor cookie", () => {
  it("is carried from the page response to the file request, names and values only", () => {
    const res = new Response("", { headers: [["set-cookie", "tt_chain_token=abc123; Path=/; Secure; HttpOnly"], ["set-cookie", "ttwid=xyz; Domain=.tiktok.com; Max-Age=31536000"]] });
    expect(cookieHeader(res)).toBe("tt_chain_token=abc123; ttwid=xyz");
  });
});

import { describe, expect, it } from "vitest";
import { cropFor, dedupeByPost, externalIdFor, filenameFor, isCollectionPage, largestFromSrcset, oddOneOut, pickBest, plausible, siteFor, videoFileFromScripts } from "../lib/resolve";

describe("site detection", () => {
  it("recognises the two platforms and everything else", () => {
    expect(siteFor("https://www.instagram.com/p/abc123/")).toBe("instagram");
    expect(siteFor("https://www.pinterest.com/pin/1234/")).toBe("pinterest");
    expect(siteFor("https://pinterest.co.uk/user/board/")).toBe("pinterest");
    expect(siteFor("https://www.dezeen.com/2026/a-house/")).toBe("web");
    expect(siteFor("not a url")).toBe("web");
  });

  it("gives a stable external id per post so a re-save is one provenance row", () => {
    expect(externalIdFor("instagram", "https://www.instagram.com/p/CxYz_12/?img_index=2")).toBe("ig:CxYz_12");
    expect(externalIdFor("instagram", "https://www.instagram.com/reel/AbC/")).toBe("ig:AbC");
    expect(externalIdFor("pinterest", "https://www.pinterest.com/pin/9876543210/")).toBe("pin:9876543210");
    expect(externalIdFor("web", "https://example.com/x")).toBeUndefined();
  });

  it("knows a collection page from a single post", () => {
    expect(isCollectionPage("instagram", "https://www.instagram.com/trevor/saved/all-posts/")).toBe(true);
    expect(isCollectionPage("instagram", "https://www.instagram.com/p/abc/")).toBe(false);
    expect(isCollectionPage("pinterest", "https://www.pinterest.com/haus/kitchens/")).toBe(true);
    expect(isCollectionPage("pinterest", "https://www.pinterest.com/pin/123/")).toBe(false);
    expect(isCollectionPage("pinterest", "https://www.pinterest.com/search/pins/?q=x")).toBe(false);
  });
});

describe("choosing the image", () => {
  it("takes the largest srcset entry", () => {
    expect(largestFromSrcset("a.jpg 640w, b.jpg 1080w, c.jpg 750w")).toEqual({ src: "b.jpg", width: 1080 });
    expect(largestFromSrcset("a.jpg 1x, b.jpg 2x")).toEqual({ src: "b.jpg", width: 2000 });
    expect(largestFromSrcset(null)).toBeNull();
  });

  it("drops avatars, icons and pixels", () => {
    expect(plausible({ src: "https://x/s150x150/avatar.jpg", width: 150, height: 150 })).toBe(false);
    expect(plausible({ src: "https://x/logo.svg", width: 800, height: 800 })).toBe(false);
    expect(plausible({ src: "data:image/png;base64,xx", width: 800, height: 800 })).toBe(false);
    expect(plausible({ src: "https://x/big.jpg", width: 40, height: 40 })).toBe(false);
    expect(plausible({ src: "https://x/big.jpg", width: 1080, height: 1350 })).toBe(true);
  });

  it("prefers og:image when present, else the largest plausible image", () => {
    const c = [
      { src: "https://x/thumb.jpg", width: 300, height: 300 },
      { src: "https://x/hero.jpg", width: 1600, height: 1000 },
      { src: "https://x/og.jpg", width: 1200, height: 630 },
    ];
    expect(pickBest(c, "https://x/og.jpg")?.src).toBe("https://x/og.jpg");
    expect(pickBest(c)?.src).toBe("https://x/hero.jpg");
    expect(pickBest([{ src: "https://x/a.svg", width: 900, height: 900 }])).toBeNull();
  });

  it("collapses a scan to one image per post, keeping the largest", () => {
    const out = dedupeByPost([
      { src: "https://x/1-small.jpg", width: 320, height: 320, postUrl: "https://ig/p/1/" },
      { src: "https://x/1-big.jpg", width: 1080, height: 1080, postUrl: "https://ig/p/1/" },
      { src: "https://x/2.jpg", width: 640, height: 800, postUrl: "https://ig/p/2/" },
      { src: "https://x/avatar.jpg", width: 44, height: 44, postUrl: "https://ig/p/3/" },
    ]);
    expect(out.map((c) => c.src).sort()).toEqual(["https://x/1-big.jpg", "https://x/2.jpg"]);
  });

  it("makes a filename the server can take an extension from", () => {
    expect(filenameFor("https://cdn/x/abc.webp?x=1")).toBe("abc.webp");
    expect(filenameFor("https://cdn/x/abc")).toBe("abc.jpg");
    expect(filenameFor("nope")).toBe("clip.jpg");
  });
});

describe("carousel position from indicator dots", () => {
  it("is the one dot styled differently, 1-based", () => {
    expect(oddOneOut(["d", "d", "d on", "d", "d"])).toBe(3);
    expect(oddOneOut(["x on", "x", "x"])).toBe(1);
  });
  it("says nothing when the row is ambiguous", () => {
    expect(oddOneOut(["a", "b"])).toBeUndefined();
    expect(oddOneOut(["a", "a", "a"])).toBeUndefined();
    expect(oddOneOut(["a", "b", "c"])).toBeUndefined();
    expect(oddOneOut(["a"])).toBeUndefined();
  });
});

describe("cropping a tab screenshot to the video", () => {
  it("scales css pixels to device pixels", () => {
    expect(cropFor({ x: 100, y: 50, width: 400, height: 500 }, 2, 2000, 2000)).toEqual({ x: 200, y: 100, width: 800, height: 1000 });
  });
  it("clamps to the screenshot and refuses a sliver", () => {
    expect(cropFor({ x: -20, y: 10, width: 400, height: 900 }, 1, 800, 600)).toEqual({ x: 0, y: 10, width: 380, height: 590 });
    expect(cropFor({ x: 700, y: 10, width: 400, height: 400 }, 1, 800, 600)).toBeNull();
  });
});

describe("the video file in a reel page's data", () => {
  it("is the largest rendition, with its addresses unescaped", () => {
    const script = `{"items":[{"code":"ABC","video_versions":[{"width":640,"height":1136,"url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/small.mp4?efg=1\\u0026_nc_ht=x"},{"width":1080,"height":1920,"url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/big.mp4?efg=1\\u0026_nc_ht=x"}],"is_video":true}]}`;
    const v = videoFileFromScripts(["nothing here", script]);
    expect(v).toEqual({ url: "https://scontent.cdninstagram.com/v/big.mp4?efg=1&_nc_ht=x", width: 1080, height: 1920 });
  });
  it("is null when the page names no file", () => {
    expect(videoFileFromScripts(['{"is_video":true,"display_url":"https://x/y.jpg"}'])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { cleanUrl, headline, metaTags, postIdOf, previewFromHtml } from "@/ingest/page-preview";

/**
 * Found the hard way on 2026-09-20: the first real link pasted into Palette
 * was an Instagram post, and it was refused as "not an image". A pasted link
 * is nearly always a page.
 */
const IG = `<!doctype html><html><head>
<meta property="og:type" content="article" />
<meta property="og:title" content="Custom Home Designs | Architectural Plans on Instagram: &quot;What does a Focus Wall do for a room? &amp; more&quot;" />
<meta content="https://scontent-det1-1.cdninstagram.com/v/t51.82787-15/814695548_n.jpg?stp=dst-jpg_e35&amp;_nc_cat=1" property="og:image" />
<meta property="og:url" content="https://www.instagram.com/thehutcompany/p/DdhLiUgnFBU/" />
<meta property="og:description" content="2 likes, 2 comments - thehutcompany on September 17, 2026: &quot;What does a Focus Wall do&quot;" />
</head><body></body></html>`;

describe("a pasted link", () => {
  it("loses the parts that only say who shared it", () => {
    expect(cleanUrl("https://www.instagram.com/p/DdhLiUgnFBU/?utm_source=ig_web_copy_link&stkn=NTc4&img_index=2#x"))
      .toBe("https://www.instagram.com/p/DdhLiUgnFBU/");
    expect(cleanUrl("https://example.com/a?id=7&utm_medium=x")).toBe("https://example.com/a?id=7");
  });

  it("has the same post id the extension would send", () => {
    expect(postIdOf("https://www.instagram.com/p/DdhLiUgnFBU/?stkn=1")).toBe("ig:DdhLiUgnFBU");
    expect(postIdOf("https://www.instagram.com/thehutcompany/reel/ABC_-9/")).toBe("ig:ABC_-9");
    expect(postIdOf("https://www.pinterest.com/pin/12345/")).toBe("pin:12345");
    expect(postIdOf("https://example.com/p/nope/")).toBeUndefined();
  });
});

describe("reading a page's preview", () => {
  it("handles either attribute order and decodes entities", () => {
    const m = metaTags(IG);
    expect(m["og:image"]).toBe("https://scontent-det1-1.cdninstagram.com/v/t51.82787-15/814695548_n.jpg?stp=dst-jpg_e35&_nc_cat=1");
    expect(m["og:title"]).toContain('"What does a Focus Wall');
  });

  it("turns an Instagram post into an image, a credit and a post id", () => {
    const p = previewFromHtml(IG, "https://www.instagram.com/p/DdhLiUgnFBU/?utm_source=ig_web_copy_link&stkn=NTc4")!;
    expect(p.imageUrl).toContain("cdninstagram.com");
    expect(p.title).toBe("What does a Focus Wall do for a room?");
    expect(headline("A long caption without any sentence end that simply keeps going and going past the point where a title should stop")).toBe(
      "A long caption without any sentence end that simply keeps going and going past the point...",
    );
    expect(headline("Short one")).toBe("Short one");
    expect(p.source).toMatchObject({
      kind: "instagram",
      sourceUrl: "https://www.instagram.com/p/DdhLiUgnFBU/",
      postId: "ig:DdhLiUgnFBU",
      slideIndex: 1,
      mediaKind: "image",
      authorHandle: "thehutcompany",
    });
  });

  it("knows a reel is a video, and keeps only its cover", () => {
    const reel = IG.replace('content="article"', 'content="video.other"');
    const p = previewFromHtml(reel, "https://www.instagram.com/reel/XYZ/")!;
    expect(p.source.mediaKind).toBe("video_cover");
    expect(p.source.slideIndex).toBeUndefined();
  });

  it("works for any site with a preview image, and says so when there is none", () => {
    const p = previewFromHtml(`<meta name="twitter:image" content="/img/hero.jpg"><meta property="og:title" content="Oak kitchens">`, "https://studio.example/work/oak")!;
    expect(p.imageUrl).toBe("https://studio.example/img/hero.jpg");
    expect(p.source.kind).toBe("web");
    expect(p.source.postId).toBeUndefined();
    expect(previewFromHtml("<html><head><title>x</title></head></html>", "https://example.com/")).toBeNull();
  });
});

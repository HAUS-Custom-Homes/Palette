import type { MetadataRoute } from "next";

/**
 * Installable web app: an icon and no browser chrome. Once installed, share_target
 * puts Palette in the system share sheet on Android and on Windows (Chrome and
 * Edge). iOS allows no web app in its share sheet, so the iPhone gets a Shortcut
 * that does the same thing through /api/ingest. /install walks each person
 * through their own device.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Palette",
    short_name: "Palette",
    description: "HAUS visual reference library",
    start_url: "/",
    display: "standalone",
    id: "/",
    scope: "/",
    background_color: "#0a0a09",
    theme_color: "#0a0a09",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon: straight to saving, which also works offline (FR-8).
    shortcuts: [{ name: "Save photos", short_name: "Save", url: "/capture", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["image/*"] }],
      },
    },
  } as MetadataRoute.Manifest;
}

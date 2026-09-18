import type { MetadataRoute } from "next";

/**
 * Installable web app. "Add to Home Screen" on iPhone and Android, an icon,
 * no browser chrome. On Android, share_target also puts Quarry in the native
 * share sheet; iOS does not support that, so the iPhone gets a Shortcut
 * (docs/SHORTCUT.md) that does the same thing through /api/ingest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quarry",
    short_name: "Quarry",
    description: "HAUS visual reference library",
    start_url: "/",
    display: "standalone",
    background_color: "#12110f",
    theme_color: "#12110f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
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

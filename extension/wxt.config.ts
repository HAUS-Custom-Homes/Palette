import { defineConfig } from "wxt";

/**
 * REF-01 FR-4. The Palette clipper.
 *
 * Everything this extension does happens inside the person's own browser
 * session. It reads the page they already have open, fetches the image with
 * their own cookies, and posts the bytes to their own Palette with their own
 * device token. Nothing is scraped from a server and no credential ever
 * leaves the browser (REF-01 R-1).
 *
 * <all_urls> is needed twice over: to read any page a person chooses to clip
 * from, and to reach whatever host Palette is deployed at, which is set in
 * the options page rather than known at build time.
 */
export default defineConfig({
  manifest: {
    name: "Palette",
    description: "Save images to the HAUS reference library, and import your existing Instagram and Pinterest saves.",
    permissions: ["storage", "contextMenus", "activeTab", "notifications"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Save to Palette" },
  },
});

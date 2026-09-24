import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./look.css";
import { OfflineQueue } from "./ui/offline-queue";

export const metadata: Metadata = {
  title: "Palette",
  description: "HAUS visual reference library",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Palette" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a09" },
    { media: "(prefers-color-scheme: light)", color: "#f7f4ef" },
  ],
  width: "device-width",
  initialScale: 1,
  // An app, not a document: no pinch zoom and no zoom on tapping a field
  // (Trevor, 2026-09-24). Pictures zoom inside the viewer instead.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at run time, not build time, so a build never needs the network
            and an offline phone falls back to the system face. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap" />
      </head>
      <body>
        {children}
        {/* FR-8: registers the service worker and shows what is waiting on this phone. */}
        <OfflineQueue />
      </body>
    </html>
  );
}

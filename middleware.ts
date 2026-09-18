import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Every page needs a signed-in person. The exceptions are routes that carry
 * their own authentication (a device token on /api/ingest, the cron secret on
 * /api/cron), the sign-in flow itself, and the static bits a phone needs
 * before it can sign in (manifest, icons).
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Pages only. Every /api route authenticates itself (session, device token,
    // cron secret or share token) and answers 401 in JSON. Guarding them here
    // too would redirect a cookie-less bearer call to the sign-in page before
    // the route could read its token, which is how the extension and The
    // HausBuch talk to Palette. s/ is the client-facing share page (FR-35).
    "/((?!api/|s/|share|manifest.webmanifest|icons|_next/static|_next/image|favicon.ico).*)",
  ],
};

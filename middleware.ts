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
    // api/asset checks its own session or share token (FR-35); s/ and api/s/ are the client-facing share surface.
    "/((?!api/auth|api/ingest|api/cron|api/asset|api/s/|s/|share|manifest.webmanifest|icons|_next/static|_next/image|favicon.ico).*)",
  ],
};

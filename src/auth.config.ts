import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * The edge-safe half of sign-in: providers and the route guard. Middleware
 * runs this, so it must not import anything that touches Node (no database,
 * and not even src/config.ts, which imports node:path). It reads its few env
 * vars directly. The half that touches the database is src/auth.ts.
 *
 * Google is restricted to the Workspace domain twice: `hd` asks Google to only
 * offer those accounts, and the signIn callback refuses anything else, because
 * `hd` is a hint to the picker, not a guarantee.
 */
const isProd = process.env.NODE_ENV === "production";
const googleId = process.env.AUTH_GOOGLE_ID || null;
const googleSecret = process.env.AUTH_GOOGLE_SECRET || null;
const allowedDomain = process.env.PALETTE_ALLOWED_DOMAIN || "hauscustomhomes.com";
const devAuth = !isProd && process.env.PALETTE_DEV_AUTH === "1";
const secret = process.env.AUTH_SECRET || (isProd ? undefined : "palette-development-secret-never-use-in-production");

const providers: NextAuthConfig["providers"] = [];

if (googleId && googleSecret) {
  providers.push(
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
      authorization: { params: { hd: allowedDomain, prompt: "select_account" } },
    }),
  );
}

if (devAuth) {
  // Development only. Refused in production by the isProd guard above, and by
  // the absence of this branch when PALETTE_DEV_AUTH is unset.
  providers.push(
    Credentials({
      name: "Dev sign-in (local only)",
      credentials: { email: { label: "Email", type: "email", placeholder: "you@hauscustomhomes.com" } },
      authorize: async (c) => {
        const email = String(c?.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  secret,
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  trustHost: true,
  callbacks: {
    signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const email = (profile?.email ?? "").toLowerCase();
        const verified = (profile as { email_verified?: boolean })?.email_verified === true;
        return verified && email.endsWith(`@${allowedDomain}`);
      }
      if (account?.provider === "credentials") return devAuth && !!user?.email;
      return false;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};

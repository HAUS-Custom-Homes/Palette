import NextAuth from "next-auth";
import { redirect } from "next/navigation";
import { authConfig } from "./auth.config";
import { upsertUser, userById, type User } from "./lib/users";

/**
 * The full sign-in: on first sign-in the person is written to users and their
 * id and role ride in the JWT from then on. Session checks never hit the
 * database, which keeps every page fast and middleware edge-safe.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user?.email && (trigger === "signIn" || trigger === "signUp" || !token.uid)) {
        const u = await upsertUser({ email: user.email, name: user.name, image: user.image });
        token.uid = u.id;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as User["role"]) ?? "editor";
      }
      return session;
    },
  },
});

/** The signed-in person, or a redirect to sign-in. For pages and actions. */
export async function requireUser(): Promise<User> {
  const s = await auth();
  const id = s?.user?.id;
  if (!id) redirect("/api/auth/signin");
  const u = await userById(id);
  if (!u) redirect("/api/auth/signin");
  return u;
}

/** The signed-in person, or null. For API routes that also accept a token. */
export async function currentUser(): Promise<User | null> {
  const s = await auth();
  const id = s?.user?.id;
  return id ? userById(id) : null;
}

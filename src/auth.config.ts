/**
 * Edge-compatible Auth.js configuration (no Node.js-only imports).
 * Used by middleware for fast, lightweight route protection.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login?verify=1",
    newUser: "/drive",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const loggedIn = !!auth?.user;
      const isDrive = nextUrl.pathname.startsWith("/drive");
      const isSetup = nextUrl.pathname.startsWith("/setup");

      // Both /drive and /setup require auth
      if (isDrive || isSetup) {
        if (loggedIn) return true;
        // Redirect to login — Next.js appends callbackUrl automatically
        return false;
      }
      return true;
    },

    jwt({ token, user }) {
      // Attach user id to JWT on first sign-in
      if (user?.id) token.id = user.id;
      return token;
    },

    session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

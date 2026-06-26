/**
 * Edge-compatible Auth.js configuration (no Node.js-only imports).
 * Used by the proxy for fast, lightweight route protection + step-up gating.
 */
import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import type { AuthLevel } from "@/lib/auth/auth-level";

const PROTECTED = [
  "/drive",
  "/setup",
  "/settings",
  "/admin",
  "/stats",
  "/shares",
  "/backup",
];

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
      const level: AuthLevel = auth?.level ?? "full";
      const path = nextUrl.pathname;
      const isProtected = PROTECTED.some((p) => path.startsWith(p));
      const isChallenge = path.startsWith("/auth/challenge");

      // The challenge screen needs a session, but only a *pending* one.
      if (isChallenge) {
        if (!loggedIn) return false; // → /login
        if (level === "full") {
          return NextResponse.redirect(new URL("/drive", nextUrl));
        }
        return true; // pending → allowed
      }

      // A pending session can't reach protected areas until it's promoted.
      if (loggedIn && level === "pending" && isProtected) {
        return NextResponse.redirect(new URL("/auth/challenge", nextUrl));
      }

      if (isProtected) {
        return loggedIn;
      }
      return true;
    },

    jwt({ token, user }) {
      // Edge-safe: attach id on first sign-in. `level`/`pendingReason` are
      // written by the Node jwt callback (auth.ts) and preserved here untouched.
      if (user?.id) token.id = user.id;
      return token;
    },

    session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string;
      }
      session.level = token.level ?? "full";
      session.pendingReason = token.pendingReason ?? null;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

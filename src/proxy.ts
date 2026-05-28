/**
 * Next.js 16 Proxy (formerly "middleware").
 * Runs on the edge before every request to enforce authentication.
 *
 * We use the edge-compatible Auth.js config (no Prisma, no bcrypt) so this
 * file stays lightweight and fast.
 */
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// `auth` in proxy/middleware mode is called with (request, event?) and returns
// a Response or undefined. The type definition is complex (overloaded), so we
// cast via unknown to keep things simple.
type ProxyHandler = (req: NextRequest) => Promise<Response | undefined>;

export const proxy = (auth as unknown as ProxyHandler);

export const config = {
  // Match all routes except Next.js internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

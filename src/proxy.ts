/**
 * Next.js 16 Proxy (formerly "middleware"). Runs on the edge before every
 * request.
 *
 * Two jobs:
 *   1. Non-API routes → the edge-safe Auth.js config enforces authentication
 *      and step-up gating (unchanged behaviour).
 *   2. `/api/*` → support the desktop app (Tauri): CORS for its origin, and
 *      translate its `Authorization: Bearer <session-jwt>` into the session
 *      cookie so every existing route's `auth()` call keeps working untouched.
 *      The JWT is minted first-party by `POST /api/auth/desktop-token`.
 */
import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

type AuthProxy = (req: NextRequest, event: unknown) => Promise<Response | undefined>;

/**
 * Origins the Tauri shell is served from. Production build: `tauri.localhost`.
 * `tauri dev`: a random `http://127.0.0.1:<port>` / `http://localhost:<port>`.
 * Allowing localhost here is not a security hole — the bearer token is the real
 * gate, and CORS is only browser-side; a non-browser client ignores it anyway.
 */
const DESKTOP_ORIGINS = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
]);

function isDesktopOrigin(origin: string): boolean {
  return (
    DESKTOP_ORIGINS.has(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

const CORS_OPTIONS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function proxy(
  req: NextRequest,
  event: unknown,
): Promise<Response | undefined> {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin") ?? "";
    const fromDesktop = isDesktopOrigin(origin);

    // Preflight.
    if (req.method === "OPTIONS" && fromDesktop) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
          ...CORS_OPTIONS,
        },
      });
    }

    // Bearer session JWT → session cookie (only if no cookie is already set).
    const authz = req.headers.get("authorization");
    const bearer = authz?.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    // Mirror Auth.js's `useSecureCookies` default (prod OR https).
    const secure =
      process.env.NODE_ENV === "production" ||
      req.nextUrl.protocol === "https:";
    const cookieName = secure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    let response: NextResponse;
    if (bearer && !req.cookies.get(cookieName)) {
      const headers = new Headers(req.headers);
      const jar = headers.get("cookie");
      headers.set("cookie", `${jar ? `${jar}; ` : ""}${cookieName}=${bearer}`);
      response = NextResponse.next({ request: { headers } });
    } else {
      response = NextResponse.next();
    }

    if (fromDesktop) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
      for (const [k, v] of Object.entries(CORS_OPTIONS)) {
        response.headers.set(k, v);
      }
    }
    return response;
  }

  // Non-API: keep the existing Auth.js route protection.
  return (auth as unknown as AuthProxy)(req, event);
}

export const config = {
  // All routes except Next.js internals and static assets. `/api/*` is now
  // included (it was excluded before) so the desktop-token translation runs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

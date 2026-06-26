/**
 * Forge / refresh the Auth.js (JWT-strategy) session cookie directly.
 *
 * Auth.js doesn't expose a clean way to *promote* a session from a plain API
 * route, so we re-encode the JWT ourselves (same approach already used by the
 * native-auth exchange route) to set the step-up `level`. Used to promote a
 * "pending" session to "full" once a challenge is solved.
 */
import { encode } from "next-auth/jwt";
import type { NextResponse } from "next/server";
import type { AuthLevel, PendingReason } from "./auth-level";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function sessionCookieName(secure: boolean): string {
  return secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Encode a session JWT carrying the given step-up level. */
export async function buildSessionToken(
  user: SessionUser,
  level: AuthLevel,
  pendingReason: PendingReason,
  secure: boolean,
): Promise<string> {
  return encode({
    token: {
      sub: user.id,
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      picture: user.image ?? null,
      level,
      pendingReason,
    },
    secret: process.env.AUTH_SECRET!,
    salt: sessionCookieName(secure),
    maxAge: MAX_AGE,
  });
}

/** Write the session cookie onto a response (httpOnly, secure-aware). */
export async function setSessionCookie(
  res: NextResponse,
  user: SessionUser,
  level: AuthLevel,
  pendingReason: PendingReason,
  secure: boolean,
): Promise<void> {
  const token = await buildSessionToken(user, level, pendingReason, secure);
  res.cookies.set(sessionCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Whether the current request is served over HTTPS (selects the cookie name). */
export function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") return true;
  return req.headers.get("x-forwarded-proto") === "https";
}

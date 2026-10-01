import type { NextRequest } from "next/server";

/**
 * CSRF guard for cookie-authenticated POSTs: the `Origin` header must name the host the browser
 * actually asked for (`Host` / `X-Forwarded-Host`), not whatever internal host the server believes it has.
 * `requireOrigin`: also reject requests that carry no Origin at all.
 */
export function isSameOriginRequest(req: NextRequest, requireOrigin = false): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return !requireOrigin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

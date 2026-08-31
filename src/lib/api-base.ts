/**
 * API base indirection for the desktop (Tauri) build.
 *
 * Web build: API routes are same-origin — `apiUrl("/api/x")` → "/api/x".
 * Desktop build (`NEXT_PUBLIC_DESKTOP === "1"`): the shell is served from
 * tauri://localhost and talks cross-origin to the real deployment, so calls are
 * rebased onto `NEXT_PUBLIC_API_BASE` (default https://drivecord.app).
 *
 * Phase 1b adds `authFetch()` on top of this to attach the bearer token.
 */
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BASE = RAW_BASE.replace(/\/+$/, "");

/** True inside the Tauri desktop shell. */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

/** Rebase an app-relative API path onto the configured base (no-op on web). */
export function apiUrl(path: string): string {
  if (!BASE) return path;
  return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

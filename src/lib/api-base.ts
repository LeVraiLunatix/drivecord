/**
 * API base indirection + auth for the desktop (Tauri) build.
 *
 * Web build: API routes are same-origin; `apiUrl("/api/x")` → "/api/x" and
 * `authFetch` is a plain `fetch` (cookies do the auth).
 *
 * Desktop build (`NEXT_PUBLIC_DESKTOP === "1"`): the shell is served from
 * tauri://localhost and talks cross-origin to `NEXT_PUBLIC_API_BASE`
 * (default https://drivecord.app) with an `Authorization: Bearer <token>`
 * header — WebView2 does not carry the session cookie cross-origin. The token
 * getter is wired up once at boot by the desktop shell
 * (`setDesktopTokenGetter(() => invoke("get_token"))`).
 */
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BASE = RAW_BASE.replace(/\/+$/, "");

/** True inside the Tauri desktop shell. */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

/** Rebase an app-relative API path onto the configured base (no-op on web). */
export function apiUrl(path: string): string {
  if (!BASE || !path.startsWith("/")) return path;
  return `${BASE}${path}`;
}

type TokenGetter = () => string | null | Promise<string | null>;
let getToken: TokenGetter = () => null;

/** Called once by the desktop shell to supply the bearer token source. */
export function setDesktopTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

/**
 * `fetch` for app API calls. On the web this is exactly `fetch(path, init)`.
 * On desktop it rebases the URL and attaches the bearer token.
 */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!IS_DESKTOP) return fetch(path, init);

  const headers = new Headers(init.headers);
  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers, credentials: "omit" });
}

/**
 * Shared SWR fetcher — keys stay as "/api/..." strings, only the request is
 * rebased. Returns `any` on purpose: call sites type the result via `useSWR<T>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiFetcher = (path: string): Promise<any> =>
  authFetch(path).then((r) => r.json());

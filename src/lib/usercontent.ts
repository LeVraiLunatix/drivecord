/**
 * Separate origin for user-uploaded content (`USERCONTENT_ORIGIN`).
 *
 * Serving user bytes from the same origin as the app means a bug in the
 * content headers is an account-takeover bug. With a dedicated origin, even a
 * script that does run there has no cookies and no access to the app. The
 * routing rule is enforced in `src/proxy.ts` (see `docs/usercontent-domain.md`).
 *
 * Unset → single-origin mode (today's behaviour), nothing is enforced.
 */

/** Paths that serve raw user content and therefore belong on the content origin. */
export const CONTENT_PATH_PREFIXES = ["/api/v1/public/"] as const;

export function isContentPath(pathname: string): boolean {
  return CONTENT_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Parsed `USERCONTENT_ORIGIN`, or null when unset / invalid. */
export function contentOrigin(env: string | undefined = process.env.USERCONTENT_ORIGIN): URL | null {
  if (!env) return null;
  try {
    const u = new URL(env);
    return u.protocol === "https:" || u.hostname === "localhost" ? u : null;
  } catch {
    return null;
  }
}

/** Public hotlink URL for a share token — on the content origin when one is configured. */
export function publicFileUrl(token: string, requestUrl: string): string {
  const base = contentOrigin();
  return new URL(`/api/v1/public/${token}`, base ?? requestUrl).toString();
}

export type ContentRoutingDecision = "allow" | "not-found";

/**
 * - On the content origin: only content paths exist.
 * - On any other origin (when a content origin is configured): content paths don't.
 */
export function routeForOrigin(
  host: string,
  pathname: string,
  origin: URL | null = contentOrigin(),
): ContentRoutingDecision {
  if (!origin) return "allow";
  const onContentHost = host.toLowerCase() === origin.host.toLowerCase();
  return onContentHost === isContentPath(pathname) ? "allow" : "not-found";
}

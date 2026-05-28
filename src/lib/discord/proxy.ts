/**
 * Helpers to route Discord CDN fetches through our same-origin /api/proxy.
 *
 * cdn.discordapp.com does not allow cross-origin browser requests, so we
 * pipe through a Next.js API route. Webhook API calls (discord.com/api)
 * already allow CORS and do NOT need this wrapper.
 */

const PROXIED_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

/** Wrap a Discord CDN URL with our proxy. Non-proxied URLs are returned as-is. */
export function proxyUrl(cdnUrl: string): string {
  let u: URL;
  try {
    u = new URL(cdnUrl);
  } catch {
    return cdnUrl;
  }
  if (!PROXIED_HOSTS.has(u.host)) return cdnUrl;
  return `/api/proxy?u=${encodeURIComponent(cdnUrl)}`;
}

/** True if the given URL needs to go through the proxy. */
export function needsProxy(url: string): boolean {
  try {
    return PROXIED_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

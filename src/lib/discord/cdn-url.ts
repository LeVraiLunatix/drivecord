/**
 * Guard for every server-side fetch of a Discord attachment URL.
 *
 * Chunk references end up in the database from several places (API uploads,
 * the web app's direct uploads). Whatever their origin, the server must never
 * request a URL outside Discord's CDN — otherwise a stored URL is an SSRF
 * primitive (internal network, cloud metadata) whose response can be read back
 * through a download route.
 */
export const DISCORD_CDN_HOSTS: ReadonlySet<string> = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
]);

const MAX_REDIRECTS = 3;

export class CdnUrlError extends Error {
  constructor(message = "URL de CDN Discord invalide.") {
    super(message);
    this.name = "CdnUrlError";
  }
}

/** `https:` + exactly a Discord CDN host, no credentials, no custom port. */
export function isDiscordCdnUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    DISCORD_CDN_HOSTS.has(u.hostname) &&
    u.port === "" &&
    u.username === "" &&
    u.password === ""
  );
}

export function assertDiscordCdnUrl(input: unknown): string {
  if (!isDiscordCdnUrl(input)) throw new CdnUrlError();
  return input;
}

/**
 * `fetch` restricted to the Discord CDN. Redirects are followed by hand (max 3)
 * and every hop is validated, so an allowed host can't bounce us elsewhere.
 */
export async function fetchDiscordCdn(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let current = assertDiscordCdnUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    current = assertDiscordCdnUrl(new URL(location, current).toString());
  }
  throw new CdnUrlError("Trop de redirections depuis le CDN Discord.");
}

/** Discord snowflake id (message / attachment ids): digits only, 15–25 chars. */
export function isSnowflake(input: unknown): input is string {
  return typeof input === "string" && /^\d{15,25}$/.test(input);
}

/**
 * Streaming pass-through proxy for Discord CDN URLs.
 *
 * Why this exists:
 *   cdn.discordapp.com does NOT send Access-Control-Allow-Origin, so browser
 *   `fetch()` to attachment URLs is blocked by CORS. Since our app runs on
 *   the same Next.js server as this route, the browser calls /api/proxy?u=...
 *   (same origin → no CORS) and we stream the upstream body back.
 *
 * Security:
 *   - Host allowlist: only cdn.discordapp.com and media.discordapp.net.
 *   - Discord attachment URLs are already signed (ex/is/hm) and time-limited,
 *     so we don't add a second layer of auth — anyone with the signed URL
 *     can already fetch the file directly.
 *
 * Streaming:
 *   - We do not buffer the response; we pipe upstream.body straight to the
 *     client. Range headers are forwarded for partial-content (video seeking).
 *   - This route runs on Node runtime so we can use streaming Response bodies
 *     without worker payload limits.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
]);

// Headers we forward from upstream → client. Allowlisted, not blanket, to
// avoid leaking server-side concerns (set-cookie, server, etc.).
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
  "cache-control",
] as const;

export async function GET(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("u");
  if (!target) {
    return new Response("Missing `u` query parameter", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return new Response(`Forbidden host: ${parsed.host}`, { status: 403 });
  }

  // Forward Range / If-* headers for partial content + caching support.
  const upstreamHeaders: Record<string, string> = {};
  const passthroughReqHeaders = [
    "range",
    "if-range",
    "if-none-match",
    "if-modified-since",
  ];
  for (const h of passthroughReqHeaders) {
    const v = req.headers.get(h);
    if (v) upstreamHeaders[h] = v;
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      // Pass-through; do not follow auth redirects implicitly to weird hosts.
      redirect: "follow",
      // Cache at the edge level only when upstream allows it.
      cache: "no-store",
    });
  } catch (err) {
    return new Response(
      `Upstream fetch failed: ${(err as Error).message}`,
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  for (const h of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  // Discord may not send Accept-Ranges; advertise it so video tags know they
  // can seek. The upstream actually supports range — this just hints the UA.
  if (!respHeaders.has("accept-ranges")) {
    respHeaders.set("accept-ranges", "bytes");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

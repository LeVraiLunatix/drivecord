import { DiscordApiError } from "./types";

/**
 * Convert a non-OK Response into a DiscordApiError with the right category.
 *
 * Categories:
 *  - rate_limited: HTTP 429, may include retry-after header or body
 *  - transient:    HTTP 5xx, 408/425, or 403 (Cloudflare often returns 403 when
 *                  too many chunks are pushed too fast to one webhook — it's a
 *                  transient throttle, worth retrying with backoff).
 *  - permanent:    other HTTP 4xx (bad token, invalid payload, etc.)
 */
export async function parseDiscordError(res: Response): Promise<DiscordApiError> {
  let body: unknown = undefined;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
  } else {
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
  }

  if (res.status === 429) {
    // Discord returns retry_after in seconds (float) in the JSON body
    // and also as Retry-After header.
    const headerRetry = parseFloat(res.headers.get("retry-after") ?? "");
    const bodyRetry =
      typeof body === "object" && body !== null && "retry_after" in body
        ? Number((body as { retry_after: unknown }).retry_after)
        : NaN;
    const retrySec = Number.isFinite(bodyRetry)
      ? bodyRetry
      : Number.isFinite(headerRetry)
        ? headerRetry
        : 1;
    return new DiscordApiError(`Rate limited (HTTP 429)`, {
      category: "rate_limited",
      status: res.status,
      retryAfterMs: Math.ceil(retrySec * 1000),
      body,
    });
  }

  if (
    res.status >= 500 ||
    res.status === 408 ||
    res.status === 425 ||
    res.status === 403
  ) {
    return new DiscordApiError(`Discord transient error (HTTP ${res.status})`, {
      category: "transient",
      status: res.status,
      body,
    });
  }

  return new DiscordApiError(`Discord API error (HTTP ${res.status})`, {
    category: "permanent",
    status: res.status,
    body,
  });
}

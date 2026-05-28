import {
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
} from "./constants";
import { DiscordApiError } from "./types";

/**
 * Wrap an async op with exponential backoff + jitter retry.
 *
 * Retries on `rate_limited`, `transient`, and `network` categories.
 * For `rate_limited`, uses the server-provided `retryAfterMs` when available.
 * `permanent` errors propagate immediately.
 *
 * @param op       Async function to retry. Receives the attempt number (1-indexed).
 * @param signal   Optional abort signal.
 * @param maxAttempts  Override default RETRY_MAX_ATTEMPTS.
 */
export async function withRetry<T>(
  op: (attempt: number) => Promise<T>,
  signal?: AbortSignal,
  maxAttempts: number = RETRY_MAX_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await op(attempt);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof DiscordApiError)) {
        // Unknown error → treat as transient and retry, unless it's an AbortError
        if (err instanceof DOMException && err.name === "AbortError") throw err;
      } else if (err.category === "permanent") {
        throw err;
      }

      if (attempt === maxAttempts) break;

      const delay = computeDelay(err, attempt);
      await sleep(delay, signal);
    }
  }
  throw lastErr;
}

function computeDelay(err: unknown, attempt: number): number {
  if (err instanceof DiscordApiError && err.retryAfterMs) {
    // Respect server-provided retry-after, add tiny jitter
    return err.retryAfterMs + Math.floor(Math.random() * 200);
  }
  const exp = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
  );
  const jitter = Math.floor(Math.random() * (exp / 2));
  return exp / 2 + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

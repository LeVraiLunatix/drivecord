/**
 * Per-webhook rate limiter (client-side).
 *
 * Discord throttles each webhook to a small sustained rate (~5 requests / 2 s).
 * Firing chunks as fast as a worker-pool allows makes several requests collide
 * on the same bucket → HTTP 429, and hammering it further escalates to a longer
 * Cloudflare throttle. Retrying *after* the fact is not enough.
 *
 * This gate paces requests *proactively*:
 *  - It spaces the start of writes to a given webhook and caps overlap (3 in flight).
 *  - After each response it reads Discord's `X-RateLimit-Remaining` /
 *    `X-RateLimit-Reset-After` headers and delays the next request just enough
 *    to spread the remaining budget across the reset window — so we stay under
 *    the limit instead of bursting to 0 and getting 429'd.
 *  - If those headers aren't exposed to JS (CORS), it falls back to a safe fixed
 *    cadence.
 *  - A real 429 (or global limit) becomes a hard pause honoring `Retry-After`.
 *
 * Limiters are keyed by webhook id at module scope, so concurrent uploads of
 * several files to the same drive share one gate.
 */

/** Never send two webhook writes closer than this, even with budget to spare. */
const MIN_SPACING_MS = 250;
/** Max requests on the wire at once for one webhook. */
const MAX_IN_FLIGHT = 3;
/** Cadence used when rate-limit headers aren't readable (CORS-hidden). */
const FALLBACK_SPACING_MS = 550;

export class WebhookRateLimiter {
  /** Promise chain that serializes the *start* of requests (async mutex). */
  private tail: Promise<void> = Promise.resolve();
  /** Earliest epoch-ms at which the next request may be sent. */
  private nextAllowedAt = 0;
  /** Requests currently on the wire, and those waiting for a free slot. */
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  private freeSlot(): void {
    const next = this.waiters.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else this.inFlight -= 1;
  }

  private takeSlot(signal?: AbortSignal): Promise<void> {
    if (this.inFlight < MAX_IN_FLIGHT) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        const i = this.waiters.indexOf(grant);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      this.waiters.push(grant);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Wait for a free slot (at most MAX_IN_FLIGHT uploads overlap) and for the
   * pacing delay to elapse. Request *starts* are spaced out, but the bodies of
   * several chunks can be on the wire at once — a 9.5 MiB upload takes seconds,
   * so a handful of overlapping ones stay far below Discord's request budget.
   * Resolves with a `release` callback that MUST be called (in a `finally`)
   * once the request and its `noteResponse` are done.
   */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    await this.takeSlot(signal);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.freeSlot();
    };

    const prev = this.tail;
    let openGate!: () => void;
    this.tail = new Promise<void>((r) => (openGate = r));
    await prev;
    try {
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) await sleep(wait, signal);
      this.nextAllowedAt = Math.max(this.nextAllowedAt, Date.now() + MIN_SPACING_MS);
    } catch (err) {
      release();
      throw err;
    } finally {
      openGate();
    }
    return release;
  }

  /** Update pacing from a response's rate-limit headers. Call for every response. */
  noteResponse(res: Response): void {
    const now = Date.now();

    if (res.status === 429) {
      const ra = parseFloat(res.headers.get("retry-after") ?? "");
      const ms = Number.isFinite(ra) ? ra * 1000 : 1000;
      this.nextAllowedAt = Math.max(this.nextAllowedAt, now + ms + 300);
      return;
    }

    const remaining = parseInt(
      res.headers.get("x-ratelimit-remaining") ?? "",
      10,
    );
    const resetAfterSec = parseFloat(
      res.headers.get("x-ratelimit-reset-after") ?? "",
    );

    if (Number.isFinite(remaining) && Number.isFinite(resetAfterSec)) {
      const resetMs = resetAfterSec * 1000;
      const next =
        remaining <= 0
          ? now + resetMs + 150 // budget exhausted — wait for the bucket reset
          : now + Math.max(MIN_SPACING_MS, Math.min(resetMs, resetMs / remaining));
      this.nextAllowedAt = Math.max(this.nextAllowedAt, next);
    } else {
      // Headers hidden by CORS — pace on a safe fixed cadence.
      this.nextAllowedAt = Math.max(this.nextAllowedAt, now + FALLBACK_SPACING_MS);
    }
  }
}

const limiters = new Map<string, WebhookRateLimiter>();

/** Get (or lazily create) the shared limiter for a webhook id. */
export function getWebhookLimiter(webhookId: string): WebhookRateLimiter {
  let l = limiters.get(webhookId);
  if (!l) {
    l = new WebhookRateLimiter();
    limiters.set(webhookId, l);
  }
  return l;
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

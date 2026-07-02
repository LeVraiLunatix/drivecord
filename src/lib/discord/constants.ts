/**
 * Constants for the Discord client.
 *
 * The chunk size is the maximum file size we'll upload in a single webhook
 * call. Discord's per-message attachment limit for free/unboosted servers is
 * 10 MiB (10 * 1024 * 1024). We subtract a small safety margin to leave room
 * for multipart form overhead.
 */

export const DISCORD_API_BASE = "https://discord.com/api/v10";

/** 10 MiB hard ceiling for free Discord accounts on unboosted servers. */
export const DISCORD_FREE_UPLOAD_LIMIT = 10 * 1024 * 1024;

/** Default chunk size we use for uploads. Slightly below the 10 MiB limit to
 *  account for multipart form encoding overhead. */
export const DEFAULT_CHUNK_SIZE = 9.5 * 1024 * 1024; // 9.5 MiB

/** Max number of chunks uploaded concurrently. À 1 : les écritures vers un même
 *  webhook sont de toute façon sérialisées et cadencées par le rate limiter
 *  (voir rate-limit.ts), qui lit les en-têtes X-RateLimit-* de Discord pour
 *  rester sous la limite. Envoyer plusieurs chunks « en parallèle » ne ferait
 *  que les mettre en file au portillon — et provoquait avant les 429 / 403. */
export const DEFAULT_PARALLEL_UPLOADS = 1;

/** Max number of chunks downloaded concurrently. */
export const DEFAULT_PARALLEL_DOWNLOADS = 4;

/** Retry policy. */
// Élevé exprès : sur un gros fichier, le webhook Discord finit rate-limité (429)
// et chaque chunk peut avoir besoin de nombreux essais (en respectant le
// retry-after) avant de passer.
export const RETRY_MAX_ATTEMPTS = 12;
export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_MAX_DELAY_MS = 30_000;

/** Webhook URL regex. Matches discord.com and ptb./canary. subdomains.
 *  Group 1 = webhook id, group 2 = webhook token. */
export const WEBHOOK_URL_REGEX =
  /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d{17,20})\/([\w-]+)\/?$/i;

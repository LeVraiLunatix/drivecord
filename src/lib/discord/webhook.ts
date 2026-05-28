import { DISCORD_API_BASE, WEBHOOK_URL_REGEX } from "./constants";
import { DiscordApiError } from "./types";
import type { WebhookInfo, WebhookRef } from "./types";
import { parseDiscordError } from "./errors";

/**
 * Parse a Discord webhook URL into its ID + token.
 *
 * Accepts:
 *   - https://discord.com/api/webhooks/{id}/{token}
 *   - https://discord.com/api/v10/webhooks/{id}/{token}
 *   - https://discordapp.com/api/webhooks/{id}/{token}
 *   - https://ptb.discord.com/api/webhooks/{id}/{token}
 *   - https://canary.discord.com/api/webhooks/{id}/{token}
 *
 * Returns null if the URL is not a valid Discord webhook URL.
 */
export function parseWebhookUrl(input: string): WebhookRef | null {
  const trimmed = input.trim();
  const match = WEBHOOK_URL_REGEX.exec(trimmed);
  if (!match) return null;
  const [, id, token] = match;
  return { id, token, url: trimmed };
}

/**
 * Validate a webhook URL against the Discord API by GET-ing the webhook.
 * Returns the webhook info if valid, throws DiscordApiError otherwise.
 */
export async function fetchWebhookInfo(
  ref: WebhookRef,
  signal?: AbortSignal,
): Promise<WebhookInfo> {
  const url = `${DISCORD_API_BASE}/webhooks/${ref.id}/${ref.token}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", signal });
  } catch (err) {
    throw new DiscordApiError(
      `Network error while fetching webhook: ${(err as Error).message}`,
      { category: "network" },
    );
  }
  if (!res.ok) {
    throw await parseDiscordError(res);
  }
  return (await res.json()) as WebhookInfo;
}

/**
 * Hash the webhook URL with SHA-256, return hex digest.
 * Used as a stable client-side identifier for the "account" (drive) without
 * ever sending the token to a server.
 */
export async function hashWebhook(ref: WebhookRef): Promise<string> {
  const enc = new TextEncoder().encode(`${ref.id}:${ref.token}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetch a DriveFile's bytes server-side: refresh each chunk's Discord CDN URL
 * (signed URLs expire after ~24h), concatenate, and decrypt if the file is
 * drive-key-encrypted. Shared by the `/api/v1` file download route and the
 * public-link route — both need the exact same "give me the raw bytes" logic.
 */
import { decryptUrl } from "@/lib/auth/encrypt";
import { decryptFileBuffer } from "@/lib/crypto/file-server-crypto";
import { parseWebhookUrl, withRetry } from "@/lib/discord";
import { getWebhookLimiter } from "@/lib/discord/rate-limit";
import { parseDiscordError } from "@/lib/discord/errors";
import { DiscordApiError } from "@/lib/discord/types";
import type { ChunkRef } from "@/lib/discord";

type DiscordAttachment = { id: string; url: string };
type DiscordMessage = { attachments: DiscordAttachment[] };

/** Skip refetching a chunk's message if its cached CDN URL isn't about to expire. */
const URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type ServeFileResult =
  | { ok: true; body: Buffer }
  | { ok: false; status: number; error: string };

export async function fetchAndDecryptFile(params: {
  encryptedWebhookUrl: string;
  encKeyEncrypted: string | null;
  chunks: ChunkRef[];
  encIv: string | null;
  locked: boolean;
}): Promise<ServeFileResult> {
  if (params.locked) {
    return {
      ok: false,
      status: 403,
      error: "Ce fichier est dans le coffre-fort chiffré et ne peut pas être servi.",
    };
  }

  const webhookUrl = decryptUrl(params.encryptedWebhookUrl);
  const chunks = [...params.chunks].sort((a, b) => a.index - b.index);
  // Same webhook = same Discord rate-limit bucket as the client-side
  // uploader/downloader — pace + retry through it instead of firing bare
  // fetches, or a burst of downloads can trip a 429 (or worse, a longer
  // Cloudflare throttle) that degrades the whole drive.
  const webhookId = parseWebhookUrl(webhookUrl)?.id ?? webhookUrl;
  const limiter = getWebhookLimiter(webhookId);

  const cache = new Map<string, DiscordMessage | null>();
  const parts: Buffer[] = [];
  for (const c of chunks) {
    let url = c.url;
    // The cached URL is still comfortably valid — skip the refetch entirely
    // instead of hitting `/messages/{id}` on every single download.
    if (!c.expiresAt || c.expiresAt - Date.now() < URL_REFRESH_MARGIN_MS) {
      try {
        let msg = cache.get(c.messageId);
        if (msg === undefined) {
          msg = await withRetry(async () => {
            const release = await limiter.acquire();
            try {
              const res = await fetch(`${webhookUrl}/messages/${c.messageId}`);
              limiter.noteResponse(res);
              if (res.status === 404) return null; // message gone — fall back to stored URL
              if (!res.ok) throw await parseDiscordError(res);
              return (await res.json()) as DiscordMessage;
            } finally {
              release();
            }
          });
          cache.set(c.messageId, msg);
        }
        const att = msg?.attachments.find((a) => a.id === c.attachmentId);
        if (att) url = att.url;
      } catch {
        // fall back to the stored URL
      }
    }
    let r: Response;
    try {
      r = await withRetry(async () => {
        const res = await fetch(url);
        if (!res.ok) {
          throw new DiscordApiError(`CDN fetch failed (HTTP ${res.status})`, {
            category: res.status >= 500 ? "transient" : "permanent",
            status: res.status,
          });
        }
        return res;
      });
    } catch {
      return { ok: false, status: 502, error: "Téléchargement interrompu." };
    }
    parts.push(Buffer.from(await r.arrayBuffer()));
  }

  let body: Buffer = Buffer.concat(parts);
  if (params.encIv) {
    if (!params.encKeyEncrypted) {
      return {
        ok: false,
        status: 403,
        error: "Ce fichier chiffré ne peut pas être servi (clé de drive absente).",
      };
    }
    const keyB64 = decryptUrl(params.encKeyEncrypted);
    body = decryptFileBuffer(body, keyB64, params.encIv);
  }

  return { ok: true, body };
}

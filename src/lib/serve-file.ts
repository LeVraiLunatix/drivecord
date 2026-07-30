/**
 * Fetch a DriveFile's bytes server-side: refresh each chunk's Discord CDN URL
 * (signed URLs expire after ~24h), concatenate, and decrypt if the file is
 * drive-key-encrypted. Shared by the `/api/v1` file download route and the
 * public-link route — both need the exact same "give me the raw bytes" logic.
 */
import { decryptUrl } from "@/lib/auth/encrypt";
import { decryptFileBuffer } from "@/lib/crypto/file-server-crypto";
import type { ChunkRef } from "@/lib/discord";

type DiscordAttachment = { id: string; url: string };
type DiscordMessage = { attachments: DiscordAttachment[] };

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

  const cache = new Map<string, DiscordMessage | null>();
  const parts: Buffer[] = [];
  for (const c of chunks) {
    let url = c.url;
    try {
      let msg = cache.get(c.messageId);
      if (msg === undefined) {
        const res = await fetch(`${webhookUrl}/messages/${c.messageId}`);
        msg = res.ok ? ((await res.json()) as DiscordMessage) : null;
        cache.set(c.messageId, msg);
      }
      const att = msg?.attachments.find((a) => a.id === c.attachmentId);
      if (att) url = att.url;
    } catch {
      // fall back to the stored URL
    }
    const r = await fetch(url);
    if (!r.ok) return { ok: false, status: 502, error: "Téléchargement interrompu." };
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

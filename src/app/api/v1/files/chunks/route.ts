/**
 * POST /api/v1/files/chunks — upload a single chunk (<=10 MiB) and relay it to
 * Discord immediately, returning a `ChunkRef`.
 *
 * Pairs with `POST /api/v1/files` (JSON body): upload the file as a series of
 * small chunk requests here, then finalize with the collected chunk refs.
 * This is how a file of unlimited size gets past the platform's per-request
 * body-size limit — no single request ever carries more than one chunk.
 */
import { NextRequest } from "next/server";
import { decryptUrl } from "@/lib/auth/encrypt";
import {
  DiscordApiError,
  DiscordClient,
  DISCORD_FREE_UPLOAD_LIMIT,
  parseCdnExpiry,
  type ChunkRef,
} from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../_helpers";

export const runtime = "nodejs";

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "write")) {
    return corsJson({ error: "Cette clé n'a pas la permission d'écriture." }, { status: 403 });
  }
  // Higher budget than the default 60/min: a large file needs one call per
  // chunk. Discord's own per-webhook rate limiter (inside DiscordClient)
  // still paces the actual upload, so this only guards against abuse.
  const limited = await checkRateLimit(auth.apiKey, { limit: 300, windowSec: 60, bucket: "chunks" });
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return corsJson({ error: "Corps de requête invalide (attendu: multipart/form-data)." }, { status: 400 });
  }

  const chunk = form.get("chunk");
  if (!(chunk instanceof File)) {
    return corsJson({ error: "Champ `chunk` manquant." }, { status: 400 });
  }
  if (chunk.size > DISCORD_FREE_UPLOAD_LIMIT) {
    return corsJson(
      { error: `Chunk trop volumineux (max ${DISCORD_FREE_UPLOAD_LIMIT / (1024 * 1024)} Mio par morceau).` },
      { status: 413 },
    );
  }
  const rawIndex = Number(form.get("index"));
  const index = Number.isFinite(rawIndex) ? rawIndex : 0;

  const webhookUrl = decryptUrl(auth.webhook.encryptedUrl);
  const client = DiscordClient.fromUrl(webhookUrl);

  try {
    const msg = await client.uploadChunk(chunk, `part${index}`);
    const att = msg.attachments[0];
    if (!att) {
      return corsJson(
        { error: "Chunk envoyé mais Discord n'a renvoyé aucune pièce jointe." },
        { status: 502 },
      );
    }

    const chunkRef: ChunkRef = {
      index,
      size: chunk.size,
      messageId: msg.id,
      attachmentId: att.id,
      url: att.url,
      expiresAt: parseCdnExpiry(att.url),
    };
    return corsJson(chunkRef, { status: 201 });
  } catch (err) {
    if (err instanceof DiscordApiError) {
      return corsJson({ error: `Échec de l'envoi du chunk vers Discord : ${err.message}` }, { status: 502 });
    }
    throw err;
  }
}

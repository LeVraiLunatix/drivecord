/**
 * PUT /api/v2/uploads/[uploadId]/chunks/[index] — one chunk as a raw octet-stream (<= 8 MiB + 16).
 * Sizes are fixed by the session: every chunk but the last is exactly one chunk long.
 * Optional `X-Chunk-SHA256` (hex) is verified; the digest of what we relayed is always returned.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { DiscordClient, isDiscordCdnUrl, isSnowflake, parseCdnExpiry } from "@/lib/discord";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { consumeByteQuota, loadScope } from "@/lib/api-v2/drive";
import { chunkSizeOf, expectedChunkBytes, ownedSession } from "@/lib/api-v2/uploads";
import { CHUNK_CIPHER } from "@/lib/crypto/e2ee/file-cipher";

export const runtime = "nodejs";
export const OPTIONS = preflight("PUT, OPTIONS");

export const PUT = v2Route<{ uploadId: string; index: string }>(
  { cap: "write", bucket: BUCKETS.chunks, route: "/api/v2/uploads/[uploadId]/chunks/[index]" },
  async ({ req, principal, params }) => {
    const s = await ownedSession(principal, params.uploadId);
    const index = /^\d{1,5}$/.test(params.index) ? Number(params.index) : -1;
    const count = s.expectedChunks!;
    if (index < 0 || index >= count) throw new ApiError(400, "invalid_request", "`index` hors de la plage de la session.");

    const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type !== "application/octet-stream") throw new ApiError(415, "unsupported_media_type", "Content-Type doit être application/octet-stream.");
    const declared = Number(req.headers.get("content-length") ?? "NaN");
    const total = Number(s.cipherSize);
    const want = expectedChunkBytes(total, chunkSizeOf(s.visibility), index, count);
    if (Number.isFinite(declared) && declared > CHUNK_CIPHER) throw new ApiError(413, "payload_too_large", "Morceau trop volumineux.");
    const data = Buffer.from(await req.arrayBuffer());
    if (data.length !== want) {
      throw new ApiError(400, "chunk_mismatch", `Taille du morceau ${index} incorrecte : ${data.length} octets reçus, ${want} attendus.`);
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    const claimed = req.headers.get("x-chunk-sha256");
    if (claimed !== null && claimed.toLowerCase() !== sha256) throw new ApiError(400, "chunk_mismatch", "L'empreinte SHA-256 du morceau ne correspond pas.");

    await consumeByteQuota(principal.userId, data.length);
    const scope = await loadScope(principal);
    const client = DiscordClient.fromUrl(decryptUrl(scope.webhook.encryptedUrl));
    let msg;
    try {
      msg = await client.uploadChunk(new Blob([new Uint8Array(data)]), `${s.fileId}.part${index}`);
    } catch {
      throw new ApiError(502, "upstream_error", "Discord a refusé le morceau. Réessaie.");
    }
    const att = msg.attachments[0];
    if (!att || !isSnowflake(msg.id) || !isSnowflake(att.id) || !isDiscordCdnUrl(att.url)) {
      throw new ApiError(502, "upstream_error", "Discord n'a renvoyé aucune pièce jointe exploitable.");
    }
    const exp = parseCdnExpiry(att.url);
    const row = { size: data.length, messageId: msg.id, attachmentId: att.id, url: att.url, urlExpiresAt: exp ? new Date(exp) : null, sha256 };
    try {
      const previous = await prisma.uploadChunk.findUnique({ where: { sessionId_index: { sessionId: s.id, index } } });
      await prisma.uploadChunk.upsert({ where: { sessionId_index: { sessionId: s.id, index } }, create: { sessionId: s.id, index, ...row }, update: row });
      if (previous) await client.deleteChunk({ ...previous, expiresAt: 0 }).catch(() => {});
    } catch (err) {
      await client.deleteChunk({ index, size: data.length, messageId: msg.id, attachmentId: att.id, url: att.url, expiresAt: 0 }).catch(() => {});
      throw err;
    }
    return ok({ index, size: data.length, sha256 });
  },
);

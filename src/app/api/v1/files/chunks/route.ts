/**
 * POST /api/v1/files/chunks — upload a single chunk (<=10 MiB) and relay it to
 * Discord immediately.
 *
 * Form fields: `chunk` (file), `index`, and optionally `uploadId` (+ `parentId`,
 * `expectedChunks` on the first call). Without `uploadId` a session is created.
 * The chunk reference is recorded SERVER-SIDE; `POST /api/v1/files` with that
 * `uploadId` then finalizes from those records alone — the client can never
 * inject a chunk (and so never a URL) of its own. The response keeps the old
 * `ChunkRef` shape and adds `uploadId`.
 */
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { DISCORD_FREE_UPLOAD_LIMIT, DiscordClient, isDiscordCdnUrl, isSnowflake, parseCdnExpiry } from "@/lib/discord";
import type { ChunkRef } from "@/lib/discord";
import { HttpError } from "@/lib/api-v1/errors";
import { assertParentUsable, consumeByteQuota } from "@/lib/api-v1/guards";
import { idSchema, parentIdSchema, parse } from "@/lib/api-v1/schemas";
import { BUCKETS, json, preflight, v1Route } from "@/lib/api-v1/pipeline";
import { cleanupExpiredSessions, createSession } from "@/lib/upload-sessions";
import { assertSessionUsable, MAX_CHUNKS, parseChunkIndex } from "@/lib/upload-session-core";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export const POST = v1Route(
  // Higher budget than the default: a large file needs one call per chunk.
  { route: "/api/v1/files/chunks", scope: "files:write", bucket: BUCKETS.chunks },
  async ({ req, auth }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Corps de requête invalide (attendu: multipart/form-data).");
    }

    const chunk = form.get("chunk");
    if (!(chunk instanceof File)) throw new HttpError(400, "Champ `chunk` manquant.");
    if (chunk.size === 0) throw new HttpError(400, "Morceau vide.");
    if (chunk.size > DISCORD_FREE_UPLOAD_LIMIT) {
      throw new HttpError(413, `Chunk trop volumineux (max ${DISCORD_FREE_UPLOAD_LIMIT / (1024 * 1024)} Mio par morceau).`);
    }
    const index = parseChunkIndex(form.get("index") ?? "0");

    after(() => cleanupExpiredSessions());

    // ── Session: existing (must be ours, open, unexpired) or brand new ─────────
    const uploadIdRaw = form.get("uploadId");
    let session;
    if (typeof uploadIdRaw === "string" && uploadIdRaw !== "") {
      const uploadId = parse(idSchema, uploadIdRaw);
      session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
      assertSessionUsable(session, { apiKeyId: auth.apiKey.id, webhookId: auth.webhook.id });
    } else {
      const parentId = parse(parentIdSchema, String(form.get("parentId") ?? ""));
      await assertParentUsable(auth.webhook.id, parentId);
      const expectedRaw = form.get("expectedChunks");
      const expectedChunks = expectedRaw === null || expectedRaw === "" ? null : Number(expectedRaw);
      if (expectedChunks !== null && (!Number.isInteger(expectedChunks) || expectedChunks < 1 || expectedChunks > MAX_CHUNKS)) {
        throw new HttpError(400, "`expectedChunks` invalide.");
      }
      session = await createSession({
        apiKeyId: auth.apiKey.id,
        userId: auth.apiKey.userId,
        webhookId: auth.webhook.id,
        parentId,
        expectedChunks,
      });
    }
    if (session.expectedChunks !== null && index >= session.expectedChunks) {
      throw new HttpError(400, "`index` dépasse le nombre de morceaux annoncé.");
    }

    await consumeByteQuota(auth.apiKey.userId, chunk.size);

    // ── Relay to Discord, then record ──────────────────────────────────────────
    const client = DiscordClient.fromUrl(decryptUrl(auth.webhook.encryptedUrl));
    const msg = await client.uploadChunk(chunk, `part${index}`);
    const att = msg.attachments[0];
    if (!att || !isSnowflake(msg.id) || !isSnowflake(att.id) || !isDiscordCdnUrl(att.url)) {
      throw new HttpError(502, "Chunk envoyé mais Discord n'a renvoyé aucune pièce jointe exploitable.");
    }

    const expiresAt = parseCdnExpiry(att.url);
    const data = {
      size: chunk.size,
      messageId: msg.id,
      attachmentId: att.id,
      url: att.url,
      urlExpiresAt: expiresAt ? new Date(expiresAt) : null,
    };
    try {
      const previous = await prisma.uploadChunk.findUnique({ where: { sessionId_index: { sessionId: session.id, index } } });
      await prisma.uploadChunk.upsert({
        where: { sessionId_index: { sessionId: session.id, index } },
        create: { sessionId: session.id, index, ...data },
        update: data,
      });
      // Re-sending an index replaces it: don't leave the old message orphaned on Discord.
      if (previous) await client.deleteChunk({ ...previous, expiresAt: 0 }).catch(() => {});
    } catch (err) {
      await client.deleteChunk({ index, size: chunk.size, messageId: msg.id, attachmentId: att.id, url: att.url, expiresAt: 0 }).catch(() => {});
      throw err;
    }

    const ref: ChunkRef & { uploadId: string } = {
      uploadId: session.id,
      index,
      size: chunk.size,
      messageId: msg.id,
      attachmentId: att.id,
      url: att.url,
      expiresAt,
    };
    return json(ref, { status: 201 });
  },
);


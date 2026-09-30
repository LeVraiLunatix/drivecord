/** POST /api/v2/uploads — open an upload session for a client-generated file id. */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { assertParentUsable, loadScope, resolveParent, zparse } from "@/lib/api-v2/drive";
import { clientFileId, idLike } from "@/lib/e2ee-server";
import { CHUNK_CIPHER, CHUNK_PLAIN, MAX_FILE_CHUNKS } from "@/lib/crypto/e2ee/file-cipher";
import { MAX_OPEN_SESSIONS_PER_KEY, SESSION_TTL_MS } from "@/lib/upload-session-core";
import { maxApiFilesPerDrive } from "@/lib/api-v1/guards";
import { principalId } from "@/lib/api-v2/principal";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, OPTIONS");

const body = z.strictObject({
  fileId: clientFileId,
  parentId: z.union([z.literal(""), idLike]).optional(),
  /** Exact byte size of what will be uploaded: ciphertext (private) or the file itself (public). */
  size: z.number().int().positive().max(MAX_FILE_CHUNKS * CHUNK_CIPHER),
  visibility: z.enum(["private", "public"]).default("private"),
});

export const POST = v2Route({ cap: "write", bucket: BUCKETS.write, route: "/api/v2/uploads", json: true, idempotent: true }, async ({ principal, body: raw }) => {
  const b = zparse(body, raw);
  const scope = await loadScope(principal);
  if (b.visibility === "private" && scope.webhook.e2eeVersion < 1) {
    throw new ApiError(409, "unsupported_operation", "Ce drive n'est pas encore chiffré de bout en bout : ouvre-le une fois dans l'application web.");
  }
  const parentId = resolveParent(scope, b.parentId);
  await assertParentUsable(scope, parentId);

  const chunkSize = b.visibility === "private" ? CHUNK_CIPHER : CHUNK_PLAIN;
  const chunkCount = Math.ceil(b.size / chunkSize);
  if (chunkCount > MAX_FILE_CHUNKS) throw new ApiError(413, "payload_too_large", "Fichier trop volumineux.");

  if (await prisma.driveFile.findUnique({ where: { id: b.fileId }, select: { id: true } })) {
    throw new ApiError(409, "conflict", "Cet identifiant de fichier existe déjà.");
  }
  if ((await prisma.driveFile.count({ where: { webhookId: scope.webhook.id } })) >= maxApiFilesPerDrive()) {
    throw new ApiError(409, "quota_exceeded", "Nombre maximal de fichiers atteint pour ce drive.");
  }
  const owner = principalId(principal);
  const now = new Date();
  const open = await prisma.uploadSession.count({ where: { apiKeyId: owner, status: "open", expiresAt: { gt: now } } });
  if (open >= MAX_OPEN_SESSIONS_PER_KEY) throw new ApiError(429, "rate_limited", "Trop d'uploads en cours : termine ou annule les autres d'abord.");

  const s = await prisma.uploadSession.create({
    data: {
      apiKeyId: owner,
      userId: principal.userId,
      webhookId: scope.webhook.id,
      parentId,
      expectedChunks: chunkCount,
      fileId: b.fileId,
      cipherSize: BigInt(b.size),
      visibility: b.visibility,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
  return ok({ uploadId: s.id, fileId: b.fileId, parentId, chunkSize, chunkCount, expiresAt: s.expiresAt.toISOString() }, 201);
});

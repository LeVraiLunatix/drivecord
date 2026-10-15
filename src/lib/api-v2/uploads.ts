import { prisma } from "@/lib/prisma";
import { ApiError } from "./errors";
import { principalId, type Principal } from "./principal";
import { CHUNK_CIPHER } from "@/lib/crypto/e2ee/file-cipher";

/** The session must be OURS (same principal), open and unexpired; anything else is a plain 404. */
export async function ownedSession(p: Principal, uploadId: string) {
  const s = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!s || s.apiKeyId !== principalId(p) || s.userId !== p.userId || !s.fileId) {
    throw new ApiError(404, "upload_not_found", "Session d'upload introuvable.");
  }
  if (s.status !== "open") throw new ApiError(409, "conflict", "Cette session d'upload est déjà terminée.");
  if (s.expiresAt.getTime() <= Date.now()) throw new ApiError(410, "upload_expired", "Cette session d'upload a expiré.");
  return s;
}

/** Public files are sent in 4 MiB pieces: a request body over 4.5 MB is refused by the hosting (413) before it reaches the app. */
export const CHUNK_PUBLIC = 4 * 1024 * 1024;

export const chunkSizeOf = (visibility: string) => (visibility === "public" ? CHUNK_PUBLIC : CHUNK_CIPHER);

/** Every chunk but the last is exactly one chunk long; the last carries the remainder. */
export function expectedChunkBytes(total: number, chunkSize: number, index: number, count: number): number {
  return index < count - 1 ? chunkSize : total - (count - 1) * chunkSize;
}

/**
 * POST /api/v2/uploads/[uploadId]/complete — seal the upload into a file.
 *  private: { encMeta, fkWrapped, noncePrefix }   (name, type and size live only inside encMeta)
 *  public:  { filename, mimeType }                (stored in clear, on purpose)
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { assertParentUsable, loadScope, recordChange, serializeFile, zparse } from "@/lib/api-v2/drive";
import { chunkSizeOf, ownedSession } from "@/lib/api-v2/uploads";
import { wrappedBlob } from "@/lib/e2ee-server";
import { toChunkRefs } from "@/lib/upload-session-core";
import { parseName } from "@/lib/api-v2/validate";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, OPTIONS");

const privateBody = z.strictObject({
  encMeta: wrappedBlob,
  fkWrapped: wrappedBlob,
  noncePrefix: z.string().regex(/^[A-Za-z0-9+/]{9}[AQgw]==$/),
});
const publicBody = z.strictObject({
  filename: z.string().max(255),
  mimeType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9!#$&^_.+-]{0,126}$/i).default("application/octet-stream"),
});

export const POST = v2Route<{ uploadId: string }>(
  { cap: "write", bucket: BUCKETS.write, route: "/api/v2/uploads/[uploadId]/complete", json: true, idempotent: true },
  async ({ principal, params, body }) => {
    const s = await ownedSession(principal, params.uploadId);
    const scope = await loadScope(principal);
    await assertParentUsable(scope, s.parentId);

    const isPublic = s.visibility === "public";
    const meta = isPublic ? zparse(publicBody, body) : zparse(privateBody, body);

    const rows = await prisma.uploadChunk.findMany({ where: { sessionId: s.id } });
    const count = s.expectedChunks!;
    const have = new Set(rows.map((r) => r.index));
    for (let i = 0; i < count; i++) {
      if (!have.has(i)) throw new ApiError(409, "upload_incomplete", `Le morceau ${i} n'a pas été envoyé.`, undefined, { missingChunk: i });
    }
    const size = rows.reduce((n, r) => n + r.size, 0);
    if (rows.length !== count || size !== Number(s.cipherSize)) throw new ApiError(409, "upload_incomplete", "Les morceaux reçus ne correspondent pas à la taille annoncée.");

    // Claim the session so two concurrent completions can't both create the file.
    const claimed = await prisma.uploadSession.updateMany({ where: { id: s.id, status: "open" }, data: { status: "completed" } });
    if (claimed.count !== 1) throw new ApiError(409, "conflict", "Cette session d'upload est déjà terminée.");

    let filename = "";
    let mimeType = "application/octet-stream";
    if (isPublic) {
      const m = meta as z.infer<typeof publicBody>;
      filename = parseName(m.filename, "filename");
      mimeType = m.mimeType.toLowerCase();
    }
    const enc = meta as z.infer<typeof privateBody>;
    try {
      const file = await prisma.driveFile.create({
        data: {
          id: s.fileId!,
          webhookId: scope.webhook.id,
          driveId: scope.webhook.driveId,
          parentId: s.parentId,
          filename,
          size: BigInt(size),
          mimeType,
          chunkSize: chunkSizeOf(s.visibility),
          chunks: toChunkRefs(rows),
          cryptoVersion: isPublic ? 0 : 1,
          fkWrapped: isPublic ? null : enc.fkWrapped,
          encMeta: isPublic ? null : enc.encMeta,
          noncePrefix: isPublic ? null : enc.noncePrefix,
          visibility: s.visibility,
        },
      });
      await recordChange(scope.webhook.id, "upsert", "file", file.id);
      return ok(serializeFile(file), 201);
    } catch (err) {
      await prisma.uploadSession.updateMany({ where: { id: s.id }, data: { status: "open" } });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "conflict", "Ce fichier existe déjà.");
      throw err;
    }
  },
);

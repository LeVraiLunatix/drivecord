/** GET / PATCH / DELETE /api/v2/files/[id]. DELETE trashes; `?permanent=true` erases for good. */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { assertParentUsable, findFile, loadScope, recordChange, serializeFile, zparse } from "@/lib/api-v2/drive";
import { idLike, wrappedBlob } from "@/lib/e2ee-server";
import { deleteFileMessages } from "@/lib/api-v1/discord-cleanup";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, PATCH, DELETE, OPTIONS");
type P = { id: string };

export const GET = v2Route<P>({ cap: "read", bucket: BUCKETS.read, route: "/api/v2/files/[id]" }, async ({ principal, params }) => {
  const scope = await loadScope(principal);
  return ok(serializeFile(await findFile(scope, params.id)));
});

const patch = z.strictObject({
  encMeta: wrappedBlob.optional(),
  parentId: z.union([z.literal(""), idLike]).optional(),
  trashed: z.boolean().optional(),
});

export const PATCH = v2Route<P>({ cap: "write", bucket: BUCKETS.write, route: "/api/v2/files/[id]", json: true }, async ({ principal, params, body }) => {
  const b = zparse(patch, body);
  if (Object.keys(b).length === 0) throw new ApiError(400, "invalid_request", "Aucun champ à modifier.");
  const scope = await loadScope(principal);
  const file = await findFile(scope, params.id);
  if (b.encMeta !== undefined && file.visibility === "public") {
    throw new ApiError(409, "unsupported_operation", "Un fichier public n'a pas de métadonnées chiffrées.");
  }
  if (b.parentId !== undefined && b.parentId !== file.parentId) await assertParentUsable(scope, b.parentId);
  if (b.trashed === false && file.trashed && (await prisma.driveFolder.findFirst({ where: { id: file.parentId, trashed: true }, select: { id: true } }))) {
    throw new ApiError(409, "parent_trashed", "Le dossier parent est dans la corbeille.");
  }
  const updated = await prisma.driveFile.update({
    where: { id: file.id },
    data: {
      ...(b.encMeta !== undefined ? { encMeta: b.encMeta } : {}),
      ...(b.parentId !== undefined ? { parentId: b.parentId } : {}),
      ...(b.trashed !== undefined ? { trashed: b.trashed, trashedAt: b.trashed ? new Date() : null } : {}),
    },
  });
  await recordChange(scope.webhook.id, "upsert", "file", file.id);
  return ok(serializeFile(updated));
});

export const DELETE = v2Route<P>({ cap: "delete", bucket: BUCKETS.delete, route: "/api/v2/files/[id]" }, async ({ req, principal, params }) => {
  const scope = await loadScope(principal);
  const file = await findFile(scope, params.id);
  if (req.nextUrl.searchParams.get("permanent") !== "true") {
    await prisma.driveFile.update({ where: { id: file.id }, data: { trashed: true, trashedAt: new Date() } });
    await recordChange(scope.webhook.id, "upsert", "file", file.id);
    return noContent();
  }
  const failed = await deleteFileMessages(scope.webhook, [file]);
  if (failed.length > 0) throw new ApiError(502, "upstream_error", "Discord n'a pas pu supprimer tous les morceaux. Réessaie.");
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: file.id, webhookId: scope.webhook.id } }),
    prisma.driveFile.delete({ where: { id: file.id } }),
  ]);
  await recordChange(scope.webhook.id, "delete", "file", file.id);
  return noContent();
});

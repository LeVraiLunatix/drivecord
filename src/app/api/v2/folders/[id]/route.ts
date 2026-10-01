/** GET / PATCH / DELETE /api/v2/folders/[id]. DELETE trashes; `?permanent=true` only removes an empty folder. */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { assertParentUsable, findFolder, loadScope, recordChange, serializeFolder, zparse } from "@/lib/api-v2/drive";
import { FOLDER_COLORS } from "@/lib/api-v2/validate";
import { idLike, wrappedBlob } from "@/lib/e2ee-server";
import { depthOf, MAX_FOLDER_DEPTH, subtreeHeight, wouldCreateCycle } from "@/lib/api-v2/tree";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, PATCH, DELETE, OPTIONS");
type P = { id: string };

const protectedRoot = () => new ApiError(409, "conflict", "Le dossier racine de l'application est protégé.");

export const GET = v2Route<P>({ cap: "read", bucket: BUCKETS.read, route: "/api/v2/folders/[id]" }, async ({ principal, params }) => {
  const scope = await loadScope(principal);
  return ok(serializeFolder(await findFolder(scope, params.id)));
});

const patch = z.strictObject({
  encName: wrappedBlob.optional(),
  parentId: z.union([z.literal(""), idLike]).optional(),
  color: z.enum(FOLDER_COLORS).nullable().optional(),
  trashed: z.boolean().optional(),
});

export const PATCH = v2Route<P>({ cap: "write", bucket: BUCKETS.write, route: "/api/v2/folders/[id]", json: true }, async ({ principal, params, body }) => {
  const b = zparse(patch, body);
  if (Object.keys(b).length === 0) throw new ApiError(400, "invalid_request", "Aucun champ à modifier.");
  const scope = await loadScope(principal);
  const folder = await findFolder(scope, params.id);
  if (folder.id === scope.appFolderId && (b.parentId !== undefined || b.trashed !== undefined)) throw protectedRoot();
  if (b.parentId !== undefined && b.parentId !== folder.parentId) {
    await assertParentUsable(scope, b.parentId);
    const all = await prisma.driveFolder.findMany({ where: { webhookId: scope.webhook.id }, select: { id: true, parentId: true } });
    if (b.parentId === folder.id || (b.parentId !== "" && wouldCreateCycle(all, folder.id, b.parentId))) {
      throw new ApiError(409, "conflict", "Un dossier ne peut pas être déplacé dans lui-même.");
    }
    const newDepth = b.parentId === "" ? 1 : depthOf(all, b.parentId) + 1;
    if (newDepth + subtreeHeight(all, folder.id) - 1 > MAX_FOLDER_DEPTH) throw new ApiError(400, "invalid_request", `Profondeur maximale atteinte (${MAX_FOLDER_DEPTH}).`);
  }
  const updated = await prisma.driveFolder.update({
    where: { id: folder.id },
    data: {
      ...(b.encName !== undefined ? { encName: b.encName, name: "" } : {}),
      ...(b.parentId !== undefined ? { parentId: b.parentId } : {}),
      ...(b.color !== undefined ? { color: b.color } : {}),
      ...(b.trashed !== undefined ? { trashed: b.trashed, trashedAt: b.trashed ? new Date() : null } : {}),
    },
  });
  await recordChange(scope.webhook.id, "upsert", "folder", folder.id);
  return ok(serializeFolder(updated));
});

export const DELETE = v2Route<P>({ cap: "delete", bucket: BUCKETS.delete, route: "/api/v2/folders/[id]" }, async ({ req, principal, params }) => {
  const scope = await loadScope(principal);
  const folder = await findFolder(scope, params.id);
  if (folder.id === scope.appFolderId) throw protectedRoot();
  if (req.nextUrl.searchParams.get("permanent") !== "true") {
    await prisma.driveFolder.update({ where: { id: folder.id }, data: { trashed: true, trashedAt: new Date() } });
    await recordChange(scope.webhook.id, "upsert", "folder", folder.id);
    return noContent();
  }
  const [files, folders] = await Promise.all([
    prisma.driveFile.count({ where: { webhookId: scope.webhook.id, parentId: folder.id } }),
    prisma.driveFolder.count({ where: { webhookId: scope.webhook.id, parentId: folder.id } }),
  ]);
  if (files + folders > 0) throw new ApiError(409, "conflict", "Le dossier n'est pas vide : supprime d'abord son contenu.");
  await prisma.driveFolder.delete({ where: { id: folder.id } });
  await recordChange(scope.webhook.id, "delete", "folder", folder.id);
  return noContent();
});

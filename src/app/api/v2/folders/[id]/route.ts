/**
 * GET    /api/v2/folders/:id — metadata                                   (scope `read`)
 * PATCH  /api/v2/folders/:id — { name?, parentId?, color?, trashed? }     (scope `write`)
 *          rename / move / recolor / trash / restore. Trashing and restoring
 *          cascade to the whole subtree, like the web app.
 * DELETE /api/v2/folders/:id — permanent: the folder, its sub-folders and every
 *          file inside, Discord messages included                        (scope `delete`)
 */
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, readJsonBody, v2Route } from "@/lib/api-v2/http";
import { ApiError, conflict, notFound } from "@/lib/api-v2/errors";
import { serializeFolder } from "@/lib/api-v2/serialize";
import { assertParentUsable, deleteFromDiscord, loadFolderNodes } from "@/lib/api-v2/drive";
import { depthOf, MAX_FOLDER_DEPTH, subtreeHeight, subtreeIds, wouldCreateCycle } from "@/lib/api-v2/tree";
import {
  assertKnownKeys,
  assertNotEmpty,
  parseBoolean,
  parseColor,
  parseId,
  parseName,
  parseParentId,
} from "@/lib/api-v2/validate";

export const runtime = "nodejs";

type Params = { id: string };

export const GET = v2Route<Params>({ scope: "read", bucket: BUCKETS.read }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const row = await prisma.driveFolder.findFirst({ where: { id, webhookId: auth.webhook.id } });
  if (!row) throw notFound("Dossier");
  return ok(serializeFolder(row));
});

export const PATCH = v2Route<Params>({ scope: "write", bucket: BUCKETS.write }, async ({ req, auth, params }) => {
  const id = parseId(params.id);
  const webhookId = auth.webhook.id;
  const body = await readJsonBody(req);
  assertKnownKeys(body, ["name", "parentId", "color", "trashed"]);
  assertNotEmpty(body);

  const folder = await prisma.driveFolder.findFirst({ where: { id, webhookId } });
  if (!folder) throw notFound("Dossier");

  const name = "name" in body ? parseName(body.name) : undefined;
  const color = "color" in body ? parseColor(body.color) : undefined;
  const parentId = "parentId" in body ? parseParentId(body.parentId) : undefined;
  const trashed = "trashed" in body ? parseBoolean(body.trashed, "trashed") : undefined;

  if (folder.trashed && trashed !== false) {
    throw conflict("conflict", "Ce dossier est dans la corbeille : restaure-le d'abord (`trashed: false`).");
  }

  const nodes = await loadFolderNodes(webhookId);

  if (parentId !== undefined && parentId !== folder.parentId) {
    if (parentId === id || wouldCreateCycle(nodes, id, parentId)) {
      throw new ApiError(400, "cycle", "Ce déplacement placerait le dossier dans lui-même.");
    }
    if (depthOf(nodes, parentId) + subtreeHeight(nodes, id) > MAX_FOLDER_DEPTH) {
      throw new ApiError(400, "max_depth", `Profondeur maximale dépassée (${MAX_FOLDER_DEPTH} niveaux).`);
    }
  }
  const finalParent = parentId ?? folder.parentId;
  const willBeLive = trashed === undefined ? !folder.trashed : !trashed;
  if (willBeLive && (parentId !== undefined || trashed === false)) {
    await assertParentUsable(webhookId, finalParent);
  }

  const now = new Date();
  const ops = [
    prisma.driveFolder.updateMany({
      where: { id, webhookId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
    }),
  ];
  if (trashed !== undefined) {
    const ids = subtreeIds(nodes, id);
    const state = { trashed, trashedAt: trashed ? now : null, updatedAt: now };
    ops.push(
      prisma.driveFolder.updateMany({ where: { id: { in: ids }, webhookId }, data: state }),
      // Never touch vault files through the API, even inside a trashed folder.
      prisma.driveFile.updateMany({ where: { webhookId, locked: false, parentId: { in: ids } }, data: state }),
    );
  }
  await prisma.$transaction(ops);

  const row = await prisma.driveFolder.findFirst({ where: { id, webhookId } });
  if (!row) throw notFound("Dossier");
  return ok(serializeFolder(row));
});

export const DELETE = v2Route<Params>({ scope: "delete", bucket: BUCKETS.delete }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const webhookId = auth.webhook.id;

  const root = await prisma.driveFolder.findFirst({ where: { id, webhookId }, select: { id: true } });
  if (!root) throw notFound("Dossier");

  const ids = subtreeIds(await loadFolderNodes(webhookId), id);

  // Vault files are off-limits to API keys: refuse rather than silently destroy them.
  const lockedCount = await prisma.driveFile.count({ where: { webhookId, locked: true, parentId: { in: ids } } });
  if (lockedCount > 0) {
    throw new ApiError(409, "locked_items", "Ce dossier contient des éléments du coffre-fort : suppression refusée.");
  }

  const files = await prisma.driveFile.findMany({ where: { webhookId, parentId: { in: ids } } });
  const failures = await deleteFromDiscord(auth.webhook, files);
  if (failures.length > 0) {
    throw new ApiError(
      502,
      "upstream_error",
      `Échec du nettoyage Discord pour ${failures.length}/${files.length} fichier(s). Rien n'a été supprimé — réessaie.`,
      undefined,
      { failedFiles: failures.slice(0, 50) },
    );
  }

  await prisma.$transaction([
    prisma.share.deleteMany({ where: { webhookId, fileId: { in: files.map((f) => f.id) } } }),
    prisma.driveFile.deleteMany({ where: { webhookId, parentId: { in: ids } } }),
    prisma.driveFolder.deleteMany({ where: { id: { in: ids }, webhookId } }),
  ]);
  return noContent();
});

/**
 * GET    /api/v1/folders/[id] — folder metadata
 * DELETE /api/v1/folders/[id] — hard-delete the folder and its whole subtree
 *   (every sub-folder + every file inside, including the files' Discord
 *   messages). Best-effort on the Discord side, same as `DELETE /api/v1/files/[id]`.
 */
import { prisma } from "@/lib/prisma";
import { toFolderEntry } from "@/app/api/drive/_helpers";
import { deleteFileMessages } from "@/lib/api-v1/discord-cleanup";
import { HttpError } from "@/lib/api-v1/errors";
import { idSchema, parse } from "@/lib/api-v1/schemas";
import { json, noContent, preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

type Params = { id: string };

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route<Params>({ route: "/api/v1/folders/[id]", scope: "files:read" }, async ({ auth, params }) => {
  const id = parse(idSchema, params.id);
  const row = await prisma.driveFolder.findFirst({ where: { id, webhookId: auth.webhook.id } });
  if (!row) throw new HttpError(404, "Dossier introuvable.");
  return json(toFolderEntry(row));
});

export const DELETE = v1Route<Params>({ route: "/api/v1/folders/[id]", scope: "files:delete" }, async ({ auth, params }) => {
  const id = parse(idSchema, params.id);
  const webhookId = auth.webhook.id;
  const root = await prisma.driveFolder.findFirst({ where: { id, webhookId }, select: { id: true } });
  if (!root) throw new HttpError(404, "Dossier introuvable.");

  // Load the drive's folder tree once, walk it in memory.
  const all = await prisma.driveFolder.findMany({ where: { webhookId }, select: { id: true, parentId: true } });
  const children = new Map<string, string[]>();
  for (const f of all) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  const subtreeIds = [id];
  for (let i = 0; i < subtreeIds.length; i++) subtreeIds.push(...(children.get(subtreeIds[i]!) ?? []));

  // Vault files are off-limits to API keys: refuse rather than silently destroy them.
  const locked = await prisma.driveFile.count({ where: { webhookId, locked: true, parentId: { in: subtreeIds } } });
  if (locked > 0) throw new HttpError(409, "Ce dossier contient des éléments du coffre-fort : suppression refusée.");

  // Discord cleanup BEFORE the DB delete commits: a failure (rate limit, revoked
  // webhook…) must not drop metadata for a file whose messages are still live.
  const files = await prisma.driveFile.findMany({ where: { webhookId, parentId: { in: subtreeIds } } });
  const failures = await deleteFileMessages(auth.webhook, files);
  if (failures.length > 0) {
    throw new HttpError(502, `Échec de nettoyage Discord pour ${failures.length}/${files.length} fichier(s). Rien n'a été supprimé — réessaie.`, {
      extra: { failedFiles: failures.slice(0, 50) },
    });
  }

  await prisma.$transaction([
    prisma.share.deleteMany({ where: { webhookId, fileId: { in: files.map((f) => f.id) } } }),
    prisma.driveFile.deleteMany({ where: { webhookId, parentId: { in: subtreeIds } } }),
    prisma.driveFolder.deleteMany({ where: { id: { in: subtreeIds }, webhookId } }),
  ]);
  return noContent();
});

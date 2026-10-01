/**
 * GET    /api/v1/files/[id] — file metadata
 * DELETE /api/v1/files/[id] — delete the file (Discord messages + DB row)
 */
import { prisma } from "@/lib/prisma";
import { toFileEntry } from "@/app/api/drive/_helpers";
import { deleteFileMessages } from "@/lib/api-v1/discord-cleanup";
import { HttpError } from "@/lib/api-v1/errors";
import { idSchema, parse } from "@/lib/api-v1/schemas";
import { json, noContent, preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

type Params = { id: string };

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route<Params>({ route: "/api/v1/files/[id]", scope: "files:read" }, async ({ auth, params }) => {
  const id = parse(idSchema, params.id);
  // Vault (`locked`) files are zero-knowledge and never reachable through an API key.
  const row = await prisma.driveFile.findFirst({ where: { id, webhookId: auth.webhook.id, locked: false } });
  if (!row) throw new HttpError(404, "Fichier introuvable.");
  return json(toFileEntry(row));
});

export const DELETE = v1Route<Params>({ route: "/api/v1/files/[id]", scope: "files:delete" }, async ({ auth, params }) => {
  const id = parse(idSchema, params.id);
  const row = await prisma.driveFile.findFirst({ where: { id, webhookId: auth.webhook.id, locked: false } });
  if (!row) throw new HttpError(404, "Fichier introuvable.");

  const failures = await deleteFileMessages(auth.webhook, [row]);
  if (failures.length > 0) {
    // A real cleanup failure must not drop metadata for messages still live on Discord.
    throw new HttpError(502, "Échec de nettoyage Discord — rien n'a été supprimé, réessaie.");
  }
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } }),
    prisma.driveFile.deleteMany({ where: { id, webhookId: auth.webhook.id } }),
  ]);
  return noContent();
});

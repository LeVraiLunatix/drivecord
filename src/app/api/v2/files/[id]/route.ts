/**
 * GET    /api/v2/files/:id  — metadata                               (scope `read`)
 * PATCH  /api/v2/files/:id  — { filename?, parentId?, tags?, favorite?, trashed? }
 *                             rename / move / tag / trash / restore (scope `write`)
 * DELETE /api/v2/files/:id  — permanent deletion, Discord messages included
 *                                                                    (scope `delete`)
 */
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, readJsonBody, v2Route } from "@/lib/api-v2/http";
import { ApiError, conflict, notFound } from "@/lib/api-v2/errors";
import { serializeFile } from "@/lib/api-v2/serialize";
import { assertParentUsable, deleteFromDiscord } from "@/lib/api-v2/drive";
import {
  assertKnownKeys,
  assertNotEmpty,
  parseBoolean,
  parseId,
  parseName,
  parseParentId,
  parseTags,
} from "@/lib/api-v2/validate";

export const runtime = "nodejs";

type Params = { id: string };

export const GET = v2Route<Params>({ scope: "read", bucket: BUCKETS.read }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const row = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id, locked: false },
  });
  if (!row) throw notFound("Fichier");
  return ok(serializeFile(row));
});

export const PATCH = v2Route<Params>({ scope: "write", bucket: BUCKETS.write }, async ({ req, auth, params }) => {
  const id = parseId(params.id);
  const body = await readJsonBody(req);
  assertKnownKeys(body, ["filename", "parentId", "tags", "favorite", "trashed"]);
  assertNotEmpty(body);

  const where = { id, webhookId: auth.webhook.id, locked: false };
  const file = await prisma.driveFile.findFirst({ where });
  if (!file) throw notFound("Fichier");

  const data: Record<string, unknown> = {};
  if ("filename" in body) data.filename = parseName(body.filename, "filename");
  if ("tags" in body) data.tags = parseTags(body.tags);
  if ("favorite" in body) data.favorite = parseBoolean(body.favorite, "favorite");

  const trashed = "trashed" in body ? parseBoolean(body.trashed, "trashed") : undefined;
  const parentId = "parentId" in body ? parseParentId(body.parentId) : undefined;

  // A file in the trash can only be restored — not edited or moved in place.
  if (file.trashed && trashed !== false) {
    throw conflict("conflict", "Ce fichier est dans la corbeille : restaure-le d'abord (`trashed: false`).");
  }

  const finalParent = parentId ?? file.parentId;
  const willBeLive = trashed === undefined ? !file.trashed : !trashed;
  if (willBeLive && (parentId !== undefined || trashed === false)) {
    await assertParentUsable(auth.webhook.id, finalParent);
  }
  if (parentId !== undefined) data.parentId = parentId;

  if (trashed !== undefined) {
    data.trashed = trashed;
    data.trashedAt = trashed ? new Date() : null;
  }

  await prisma.driveFile.updateMany({ where, data });
  const row = await prisma.driveFile.findFirst({ where });
  if (!row) throw notFound("Fichier");
  return ok(serializeFile(row));
});

export const DELETE = v2Route<Params>({ scope: "delete", bucket: BUCKETS.delete }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const where = { id, webhookId: auth.webhook.id, locked: false };
  const file = await prisma.driveFile.findFirst({ where });
  if (!file) throw notFound("Fichier");

  // Discord first: a failure must not drop metadata for messages still live.
  const failures = await deleteFromDiscord(auth.webhook, [file]);
  if (failures.length > 0) {
    throw new ApiError(502, "upstream_error", "Échec du nettoyage Discord — rien n'a été supprimé, réessaie.");
  }

  await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } }),
    prisma.driveFile.deleteMany({ where }),
  ]);
  return noContent();
});

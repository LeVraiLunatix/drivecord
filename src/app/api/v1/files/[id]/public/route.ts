/**
 * POST   /api/v1/files/[id]/public — create (or replace) a permanent, public,
 *        no-auth link for this file. Meant for hotlinking — `<img src="...">`.
 * DELETE /api/v1/files/[id]/public — revoke it.
 *
 * One active public link per file, same "replace on re-create" convention as
 * the web app's manual share feature — they share the `Share` table. The URL
 * points at `USERCONTENT_ORIGIN` when one is configured.
 */
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { publicFileUrl } from "@/lib/usercontent";
import { HttpError } from "@/lib/api-v1/errors";
import { idSchema, parse } from "@/lib/api-v1/schemas";
import { json, noContent, preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

type Params = { id: string };

export function OPTIONS() {
  return preflight();
}

export const POST = v1Route<Params>({ route: "/api/v1/files/[id]/public", scope: "public:manage" }, async ({ req, auth, params }) => {
  const id = parse(idSchema, params.id);
  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id, trashed: false },
    select: { id: true, locked: true },
  });
  if (!file) throw new HttpError(404, "Fichier introuvable.");
  if (file.locked) throw new HttpError(400, "Les fichiers du coffre-fort ne peuvent pas être rendus publics.");

  // Replace any existing share for this file (web UI or API alike).
  const token = nanoid(16);
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } }),
    prisma.share.create({ data: { token, webhookId: auth.webhook.id, fileId: id, passwordHash: null, expiresAt: null } }),
  ]);
  return json({ token, url: publicFileUrl(token, req.url) }, { status: 201 });
});

export const DELETE = v1Route<Params>({ route: "/api/v1/files/[id]/public", scope: "public:manage" }, async ({ auth, params }) => {
  const id = parse(idSchema, params.id);
  await prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } });
  return noContent();
});

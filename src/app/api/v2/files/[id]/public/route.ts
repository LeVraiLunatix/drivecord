/**
 * POST / DELETE /api/v2/files/[id]/public — hotlink for files uploaded with `visibility: "public"`.
 * Encrypted files never get one (there is nothing the server could serve). Personal tokens only.
 */
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { findFile, loadScope } from "@/lib/api-v2/drive";
import { publicFileUrl } from "@/lib/usercontent";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, DELETE, OPTIONS");
type P = { id: string };

export const POST = v2Route<P>({ cap: "share", bucket: BUCKETS.share, route: "/api/v2/files/[id]/public", idempotent: true }, async ({ req, principal, params }) => {
  const scope = await loadScope(principal);
  const file = await findFile(scope, params.id);
  if (file.trashed) throw new ApiError(404, "file_not_found", "Fichier introuvable.");
  if (file.visibility !== "public") {
    throw new ApiError(409, "unsupported_operation", "Seuls les fichiers envoyés avec `visibility: \"public\"` peuvent avoir un lien public.");
  }
  const token = nanoid(16);
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: file.id, webhookId: scope.webhook.id } }),
    prisma.share.create({ data: { token, webhookId: scope.webhook.id, fileId: file.id } }),
  ]);
  return ok({ token, url: publicFileUrl(token, req.url) }, 201);
});

export const DELETE = v2Route<P>({ cap: "share", bucket: BUCKETS.share, route: "/api/v2/files/[id]/public" }, async ({ principal, params }) => {
  const scope = await loadScope(principal);
  const file = await findFile(scope, params.id);
  await prisma.share.deleteMany({ where: { fileId: file.id, webhookId: scope.webhook.id } });
  return noContent();
});

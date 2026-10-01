/**
 * POST /api/v2/files/[id]/shares — create (replacing any previous) an end-to-end encrypted share.
 * The decryption key never passes through here: the caller puts the file key in the link's
 * `#k=` fragment. A password, if wanted, is applied client-side (`fkWrappedForShare` + `shareKdf`).
 * Personal tokens only (scope `drive:share`).
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { BUCKETS, ok, preflight, v2Route } from "@/lib/api-v2/http";
import { ApiError } from "@/lib/api-v2/errors";
import { findFile, loadScope, zparse } from "@/lib/api-v2/drive";
import { phraseKdfSchema, wrappedBlob } from "@/lib/e2ee-server";

export const runtime = "nodejs";
export const OPTIONS = preflight("POST, OPTIONS");

const body = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{24}$/).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
  fkWrappedForShare: wrappedBlob.optional(),
  shareKdf: phraseKdfSchema.optional(),
});

export const POST = v2Route<{ id: string }>(
  { cap: "share", bucket: BUCKETS.share, route: "/api/v2/files/[id]/shares", json: true, idempotent: true },
  async ({ principal, params, body: raw }) => {
    const b = zparse(body, raw);
    if ((b.fkWrappedForShare === undefined) !== (b.shareKdf === undefined)) {
      throw new ApiError(400, "invalid_request", "`fkWrappedForShare` et `shareKdf` vont ensemble.");
    }
    const scope = await loadScope(principal);
    const file = await findFile(scope, params.id);
    if (file.trashed) throw new ApiError(404, "file_not_found", "Fichier introuvable.");
    if (file.visibility !== "public" && file.cryptoVersion < 1) {
      throw new ApiError(409, "unsupported_operation", "Ce fichier n'est pas au format chiffré v1.");
    }
    if (file.visibility === "public" && b.fkWrappedForShare) throw new ApiError(400, "invalid_request", "Un fichier public n'a pas de clé à protéger.");
    const token = b.token ?? nanoid(24);
    const expiresAt = b.expiresInDays ? new Date(Date.now() + b.expiresInDays * 86_400_000) : null;
    await prisma.$transaction([
      prisma.share.deleteMany({ where: { fileId: file.id, webhookId: scope.webhook.id } }),
      prisma.share.create({
        data: { token, webhookId: scope.webhook.id, fileId: file.id, expiresAt, ...(b.fkWrappedForShare ? { fkWrappedForShare: b.fkWrappedForShare, shareKdf: b.shareKdf } : {}) },
      }),
    ]);
    const origin = new URL(appOrigin()).origin;
    return ok({ token, url: `${origin}/s/${token}`, hasPassword: Boolean(b.fkWrappedForShare), expiresAt: expiresAt?.toISOString() ?? null }, 201);
  },
);

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "https://drivecord.app";
}

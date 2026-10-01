/**
 * GET /api/v1/files/[id]/download — stream the file's bytes directly.
 *
 * Refreshes each chunk's Discord CDN URL server-side (signed URLs expire after
 * ~24h) before fetching. Always served as an attachment (see safe-file-headers).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndDecryptFile } from "@/lib/serve-file";
import type { ChunkRef } from "@/lib/discord";
import { buildSafeFileHeaders } from "@/lib/safe-file-headers";
import { HttpError } from "@/lib/api-v1/errors";
import { idSchema, parse } from "@/lib/api-v1/schemas";
import { preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route<{ id: string }>(
  { route: "/api/v1/files/[id]/download", scope: "files:read" },
  async ({ auth, params }) => {
    const id = parse(idSchema, params.id);
    const file = await prisma.driveFile.findFirst({
      where: { id, webhookId: auth.webhook.id, trashed: false, locked: false },
    });
    if (!file) throw new HttpError(404, "Fichier introuvable.");

    const result = await fetchAndDecryptFile({
      encryptedWebhookUrl: auth.webhook.encryptedUrl,
      encKeyEncrypted: auth.webhook.encKey,
      chunks: file.chunks as unknown as ChunkRef[],
      encIv: file.encIv,
      locked: file.locked,
      cryptoVersion: file.cryptoVersion,
      e2eeVersion: auth.webhook.e2eeVersion,
    });
    if (!result.ok) throw new HttpError(result.status, result.error);

    // Encrypted files come back as ciphertext (octet-stream) plus a marker header: the server
    // holds no key, so only the client that owns the drive key can make sense of them.
    const headers = buildSafeFileHeaders(
      { filename: file.filename, mimeType: file.mimeType, size: result.body.length },
      { disposition: "attachment", cacheControl: "private, no-store" },
    );
    if (result.encrypted) headers["X-Drivecord-Encrypted"] = "1";
    return new NextResponse(new Uint8Array(result.body), { headers });
  },
);

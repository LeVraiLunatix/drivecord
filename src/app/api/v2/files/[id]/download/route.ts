/**
 * GET /api/v2/files/:id/download — the file's bytes (scope `read`).
 *
 * The body is buffered server-side (chunks are fetched from Discord, then
 * decrypted if needed), so it is capped; larger files will need streaming.
 * Served as an attachment with `nosniff` and a sandboxing CSP: a file
 * uploaded by someone else can never execute in the browser from here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndDecryptFile } from "@/lib/serve-file";
import type { ChunkRef } from "@/lib/discord";
import { BUCKETS, v2Route } from "@/lib/api-v2/http";
import { ApiError, notFound } from "@/lib/api-v2/errors";
import { contentDisposition, safeContentType } from "@/lib/api-v2/serialize";
import { parseId } from "@/lib/api-v2/validate";

export const runtime = "nodejs";

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MiB

export const GET = v2Route<{ id: string }>(
  { scope: "read", bucket: BUCKETS.download },
  async ({ auth, params }) => {
    const id = parseId(params.id);
    const file = await prisma.driveFile.findFirst({
      where: { id, webhookId: auth.webhook.id, locked: false, trashed: false },
    });
    if (!file) throw notFound("Fichier");
    if (file.size > MAX_DOWNLOAD_BYTES) {
      throw new ApiError(
        413,
        "file_too_large",
        `Fichier trop volumineux pour l'API (max ${MAX_DOWNLOAD_BYTES / (1024 * 1024)} Mio).`,
      );
    }

    const result = await fetchAndDecryptFile({
      encryptedWebhookUrl: auth.webhook.encryptedUrl,
      encKeyEncrypted: auth.webhook.encKey,
      chunks: file.chunks as unknown as ChunkRef[],
      encIv: file.encIv,
      locked: file.locked,
    });
    if (!result.ok) throw new ApiError(result.status === 403 ? 403 : 502, "upstream_error", result.error);

    return new NextResponse(new Uint8Array(result.body), {
      headers: {
        "Content-Type": safeContentType(file.mimeType),
        "Content-Disposition": contentDisposition(file.filename),
        "Content-Length": String(result.body.length),
      },
    });
  },
);

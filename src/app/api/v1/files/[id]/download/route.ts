/**
 * GET /api/v1/files/[id]/download — stream the file's bytes directly.
 *
 * Refreshes each chunk's Discord CDN URL server-side (signed URLs expire
 * after ~24h) before fetching, same approach as the public share endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndDecryptFile } from "@/lib/serve-file";
import type { ChunkRef } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../../_helpers";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id, trashed: false },
  });
  if (!file) return corsJson({ error: "Fichier introuvable." }, { status: 404 });

  const result = await fetchAndDecryptFile({
    encryptedWebhookUrl: auth.webhook.encryptedUrl,
    encKeyEncrypted: auth.webhook.encKey,
    chunks: file.chunks as unknown as ChunkRef[],
    encIv: file.encIv,
    locked: file.locked,
  });
  if (!result.ok) return corsJson({ error: result.error }, { status: result.status });

  return new NextResponse(new Uint8Array(result.body), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(result.body.length),
    },
  });
}

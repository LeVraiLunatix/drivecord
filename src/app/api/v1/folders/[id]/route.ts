/**
 * GET    /api/v1/folders/[id] — folder metadata
 * DELETE /api/v1/folders/[id] — hard-delete the folder and its whole subtree
 *   (every sub-folder + every file inside, including the files' Discord
 *   messages). Best-effort on the Discord side, same as `DELETE /api/v1/files/[id]`.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { toFolderEntry } from "@/app/api/drive/_helpers";
import { DiscordClient } from "@/lib/discord";
import type { ChunkRef, FileManifest } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../_helpers";

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
  const row = await prisma.driveFolder.findFirst({
    where: { id, webhookId: auth.webhook.id },
  });
  if (!row) return corsJson({ error: "Dossier introuvable." }, { status: 404 });
  return corsJson(toFolderEntry(row));
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "write")) {
    return corsJson({ error: "Cette clé n'a pas la permission d'écriture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  const root = await prisma.driveFolder.findFirst({
    where: { id, webhookId: auth.webhook.id },
    select: { id: true },
  });
  if (!root) return corsJson({ error: "Dossier introuvable." }, { status: 404 });

  // BFS: this folder + every descendant folder id.
  const subtreeIds = [id];
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = await prisma.driveFolder.findMany({
      where: { webhookId: auth.webhook.id, parentId: cur },
      select: { id: true },
    });
    for (const c of children) {
      subtreeIds.push(c.id);
      queue.push(c.id);
    }
  }

  // Best-effort Discord cleanup for every file in the subtree.
  const files = await prisma.driveFile.findMany({
    where: { webhookId: auth.webhook.id, parentId: { in: subtreeIds } },
  });
  if (files.length > 0) {
    const client = DiscordClient.fromUrl(decryptUrl(auth.webhook.encryptedUrl));
    await Promise.all(
      files.map((f) => {
        const manifest: FileManifest = {
          size: f.size,
          mimeType: f.mimeType,
          filename: f.filename,
          chunkSize: f.chunkSize,
          chunks: f.chunks as unknown as ChunkRef[],
        };
        return client.deleteFile(manifest).catch(() => {
          // Messages may already be gone — nothing to do.
        });
      }),
    );
  }

  await prisma.$transaction([
    prisma.driveFile.deleteMany({
      where: { webhookId: auth.webhook.id, parentId: { in: subtreeIds } },
    }),
    prisma.driveFolder.deleteMany({
      where: { id: { in: subtreeIds }, webhookId: auth.webhook.id },
    }),
  ]);

  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}

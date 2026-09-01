/**
 * GET /api/drive/[driveId]/tree
 *
 * Flat snapshot of an entire drive — every non-trashed folder + every
 * non-trashed, non-locked file, in one call. Consumed by the desktop
 * folder-sync engine to build the placeholder tree in Windows Explorer.
 *
 * Files include their `chunks` / `encIv` so the native client can download +
 * decrypt without a second round-trip per file.
 *
 * Query params:
 *  - since (number, Unix ms) — incremental mode: only rows with
 *    `updatedAt > since`, plus `trashedFileIds` / `trashedFolderIds` listing
 *    items trashed since then (so the client can drop their placeholders).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFileEntry, toFolderEntry } from "../../_helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const webhookId = result.webhook.id;

  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw ? Number(sinceRaw) : null;
  const incremental = since !== null && Number.isFinite(since);
  const after = incremental ? { updatedAt: { gt: new Date(since) } } : {};

  const [folders, files] = await Promise.all([
    prisma.driveFolder.findMany({
      where: { webhookId, trashed: false, ...after },
      orderBy: { name: "asc" },
    }),
    prisma.driveFile.findMany({
      where: { webhookId, trashed: false, locked: false, ...after },
      orderBy: { filename: "asc" },
    }),
  ]);

  const body: Record<string, unknown> = {
    folders: folders.map(toFolderEntry),
    files: files.map(toFileEntry),
    serverTime: Date.now(),
  };

  if (incremental) {
    const [trashedFolders, trashedFiles] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { webhookId, trashed: true, updatedAt: { gt: new Date(since) } },
        select: { id: true },
      }),
      prisma.driveFile.findMany({
        where: { webhookId, trashed: true, updatedAt: { gt: new Date(since) } },
        select: { id: true },
      }),
    ]);
    body.trashedFolderIds = trashedFolders.map((f) => f.id);
    body.trashedFileIds = trashedFiles.map((f) => f.id);
  }

  return NextResponse.json(body);
}

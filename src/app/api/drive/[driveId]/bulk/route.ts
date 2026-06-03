/**
 * POST /api/drive/[driveId]/bulk
 *
 * Batch operations on many items in a single request, so deleting/restoring a
 * large selection is one round-trip + two updateMany queries instead of N
 * sequential PATCHes (each of which also re-fetched the whole drive).
 *
 * Body: { action: "trash" | "restore", fileIds?: string[], folderIds?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook } from "../../_helpers";

type RouteParams = { params: Promise<{ driveId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const webhookId = result.webhook.id;

  const body = (await req.json()) as {
    action?: "trash" | "restore";
    fileIds?: string[];
    folderIds?: string[];
  };
  const action = body.action;
  if (action !== "trash" && action !== "restore") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((s) => typeof s === "string") : [];
  const folderIds = Array.isArray(body.folderIds) ? body.folderIds.filter((s) => typeof s === "string") : [];
  if (fileIds.length === 0 && folderIds.length === 0) {
    return NextResponse.json({ files: 0, folders: 0 });
  }

  const trashed = action === "trash";
  const data = { trashed, trashedAt: trashed ? new Date() : null, updatedAt: new Date() };

  // Scope by webhookId so a user can only touch their own items.
  const [files, folders] = await prisma.$transaction([
    prisma.driveFile.updateMany({
      where: { webhookId, id: { in: fileIds } },
      data,
    }),
    prisma.driveFolder.updateMany({
      where: { webhookId, id: { in: folderIds } },
      data,
    }),
  ]);

  return NextResponse.json({ files: files.count, folders: folders.count });
}

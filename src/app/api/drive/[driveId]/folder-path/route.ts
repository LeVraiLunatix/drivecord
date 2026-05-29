/**
 * GET /api/drive/[driveId]/folder-path?folderId=xxx
 *
 * Returns the breadcrumb path from the drive root down to folderId (inclusive).
 * Returns [] for the root.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFolderEntry } from "../../_helpers";
import type { FolderEntry } from "@/lib/storage/schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const folderId = req.nextUrl.searchParams.get("folderId") ?? "";
  if (!folderId) return NextResponse.json({ path: [] });

  // Walk up from folderId to root.
  const path: FolderEntry[] = [];
  let cur = folderId;
  const seen = new Set<string>();
  while (cur && cur !== "") {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = await prisma.driveFolder.findFirst({
      where: { id: cur, webhookId: webhook.id },
    });
    if (!row) break;
    path.unshift(toFolderEntry(row));
    cur = row.parentId;
  }
  return NextResponse.json({ path });
}

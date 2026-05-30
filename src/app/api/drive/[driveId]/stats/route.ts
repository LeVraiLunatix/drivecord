/**
 * GET /api/drive/[driveId]/stats
 * Aggregates the drive's non-trashed files by kind, plus totals and top files.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook } from "../../_helpers";
import { kindOf, type FileKind } from "@/lib/utils/file-icons";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const files = await prisma.driveFile.findMany({
    where: { webhookId: result.webhook.id, trashed: false },
    select: { filename: true, mimeType: true, size: true },
  });

  const byKind: Record<string, { count: number; bytes: number }> = {};
  let totalBytes = 0;
  for (const f of files) {
    const k: FileKind = kindOf(f.filename, f.mimeType);
    (byKind[k] ??= { count: 0, bytes: 0 });
    byKind[k].count += 1;
    byKind[k].bytes += f.size;
    totalBytes += f.size;
  }

  const kinds = Object.entries(byKind)
    .map(([kind, v]) => ({ kind, count: v.count, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const topFiles = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)
    .map((f) => ({ filename: f.filename, size: f.size }));

  return NextResponse.json({
    fileCount: files.length,
    totalBytes,
    byKind: kinds,
    topFiles,
  });
}

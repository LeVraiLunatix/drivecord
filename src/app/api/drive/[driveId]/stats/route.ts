/**
 * GET /api/drive/[driveId]/stats
 * Rich aggregation of the drive's content for the stats dashboard.
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

  const webhookId = result.webhook.id;

  const [allFiles, folderCount] = await Promise.all([
    prisma.driveFile.findMany({
      where: { webhookId },
      select: {
        filename: true,
        mimeType: true,
        size: true,
        createdAt: true,
        favorite: true,
        tags: true,
        trashed: true,
      },
    }),
    prisma.driveFolder.count({ where: { webhookId, trashed: false } }),
  ]);

  const active = allFiles.filter((f) => !f.trashed);
  const trashed = allFiles.filter((f) => f.trashed);

  // By kind
  const byKindMap: Record<string, { count: number; bytes: number }> = {};
  let totalBytes = 0;
  let favoriteCount = 0;
  const tagCounts: Record<string, number> = {};
  const monthMap: Record<string, number> = {};
  let firstUpload: number | null = null;
  let lastUpload: number | null = null;

  for (const f of active) {
    const k: FileKind = kindOf(f.filename, f.mimeType);
    (byKindMap[k] ??= { count: 0, bytes: 0 });
    byKindMap[k].count += 1;
    byKindMap[k].bytes += f.size;
    totalBytes += f.size;
    if (f.favorite) favoriteCount += 1;
    for (const t of f.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;

    const ts = f.createdAt.getTime();
    if (firstUpload === null || ts < firstUpload) firstUpload = ts;
    if (lastUpload === null || ts > lastUpload) lastUpload = ts;
    const ym = `${f.createdAt.getFullYear()}-${String(f.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthMap[ym] = (monthMap[ym] ?? 0) + 1;
  }

  const byKind = Object.entries(byKindMap)
    .map(([kind, v]) => ({ kind, count: v.count, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const topFiles = [...active]
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)
    .map((f) => ({ filename: f.filename, size: f.size }));

  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Last 6 months of upload activity (oldest → newest).
  const now = new Date();
  const uploadsByMonth: { month: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    uploadsByMonth.push({
      month: ym,
      label: d.toLocaleDateString("fr", { month: "short" }),
      count: monthMap[ym] ?? 0,
    });
  }

  const trashedBytes = trashed.reduce((acc, f) => acc + f.size, 0);

  return NextResponse.json({
    fileCount: active.length,
    totalBytes,
    folderCount,
    favoriteCount,
    avgBytes: active.length ? Math.round(totalBytes / active.length) : 0,
    firstUpload,
    lastUpload,
    trashedCount: trashed.length,
    trashedBytes,
    byKind,
    topFiles,
    topTags,
    uploadsByMonth,
  });
}

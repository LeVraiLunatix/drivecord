/**
 * GET /api/drive/[driveId]/usage
 * Returns { fileCount, totalBytes } for the sidebar stats bar.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook } from "../../_helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const files = await prisma.driveFile.findMany({
    where: { webhookId: result.webhook.id, trashed: false },
    select: { size: true },
  });

  const fileCount = files.length;
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  return NextResponse.json({ fileCount, totalBytes });
}

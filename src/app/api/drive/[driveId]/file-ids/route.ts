/**
 * GET /api/drive/[driveId]/file-ids — ids of all non-trashed files (light).
 * Used to reconcile the camera-roll backup tracker with what's actually there.
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
    select: { id: true },
  });
  return NextResponse.json({ ids: files.map((f) => f.id) });
}

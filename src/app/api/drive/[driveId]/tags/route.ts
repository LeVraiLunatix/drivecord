/**
 * GET /api/drive/[driveId]/tags
 * Returns [{ tag, count }] sorted alphabetically.
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
    select: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const f of files) {
    for (const tag of f.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag, "fr"));

  return NextResponse.json({ tags });
}

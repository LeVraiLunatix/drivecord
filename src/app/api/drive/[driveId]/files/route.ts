/**
 * POST /api/drive/[driveId]/files — record an uploaded file.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFileEntry } from "../../_helpers";
import type { ChunkRef } from "@/lib/discord";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const body = (await req.json()) as {
    id: string;
    parentId: string;
    filename: string;
    size: number;
    mimeType: string;
    chunkSize: number;
    chunks: ChunkRef[];
    tags?: string[];
    locked?: boolean;
    encIv?: string | null;
  };

  const row = await prisma.driveFile.create({
    data: {
      id: body.id,
      webhookId: webhook.id,
      driveId,
      parentId: body.parentId,
      filename: body.filename,
      size: body.size,
      mimeType: body.mimeType,
      chunkSize: body.chunkSize,
      chunks: body.chunks,
      tags: body.tags ?? [],
      locked: body.locked ?? false,
      encIv: body.encIv ?? null,
    },
  });

  return NextResponse.json(toFileEntry(row), { status: 201 });
}

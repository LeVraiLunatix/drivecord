/**
 * GET    /api/drive/[driveId]/files/[id]
 * PATCH  /api/drive/[driveId]/files/[id]  — partial update
 * DELETE /api/drive/[driveId]/files/[id]  — hard delete
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFileEntry } from "../../../_helpers";
import type { ChunkRef } from "@/lib/discord";

type RouteParams = { params: Promise<{ driveId: string; id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const row = await prisma.driveFile.findFirst({
    where: { id, webhookId: result.webhook.id },
  });
  if (!row) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(toFileEntry(row));
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const body = (await req.json()) as {
    filename?: string;
    parentId?: string;
    favorite?: boolean;
    locked?: boolean;
    tags?: string[];
    trashed?: boolean;
    trashedAt?: number | null;
    chunks?: ChunkRef[];
  };

  if (body.parentId !== undefined && body.parentId !== "") {
    const parent = await prisma.driveFolder.findFirst({
      where: { id: body.parentId, webhookId: webhook.id },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Dossier de destination introuvable." }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.filename !== undefined) data.filename = body.filename.trim();
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.favorite !== undefined) data.favorite = body.favorite;
  if (body.locked !== undefined) data.locked = body.locked;
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.trashed !== undefined) {
    data.trashed = body.trashed;
    data.trashedAt = body.trashed ? new Date() : null;
    if (body.trashedAt === null) data.trashedAt = null;
  }
  if (body.chunks !== undefined) data.chunks = body.chunks;

  const { count } = await prisma.driveFile.updateMany({
    where: { id, webhookId: webhook.id },
    data,
  });
  if (count === 0) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const row = await prisma.driveFile.findFirst({ where: { id, webhookId: webhook.id } });
  if (!row) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(toFileEntry(row));
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  await prisma.driveFile.deleteMany({
    where: { id, webhookId: result.webhook.id },
  });
  return new NextResponse(null, { status: 204 });
}

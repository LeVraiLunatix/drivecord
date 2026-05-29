/**
 * GET    /api/drive/[driveId]/folders/[id]
 * PATCH  /api/drive/[driveId]/folders/[id]  — update name/color/parentId/trashed
 * DELETE /api/drive/[driveId]/folders/[id]  — hard-delete subtree; returns deleted file entries
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFileEntry, toFolderEntry } from "../../../_helpers";

type RouteParams = { params: Promise<{ driveId: string; id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const row = await prisma.driveFolder.findFirst({
    where: { id, webhookId: result.webhook.id },
  });
  if (!row) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(toFolderEntry(row));
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const body = (await req.json()) as {
    name?: string;
    color?: string | null;
    parentId?: string;
    trashed?: boolean;
  };

  if (body.parentId !== undefined && body.parentId !== "") {
    // Cycle check: walk up from target to root; reject if we encounter `id`.
    let cur = body.parentId;
    const seen = new Set<string>();
    while (cur && cur !== "") {
      if (cur === id) {
        return NextResponse.json({ error: "Déplacement créerait un cycle." }, { status: 400 });
      }
      if (seen.has(cur)) break;
      seen.add(cur);
      const parent = await prisma.driveFolder.findFirst({
        where: { id: cur, webhookId: webhook.id },
        select: { parentId: true },
      });
      cur = parent?.parentId ?? "";
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) data.name = body.name.trim();
  if ("color" in body) data.color = body.color ?? null;
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.trashed !== undefined) {
    // Trash/restore the whole subtree.
    const now = new Date();
    const subtreeIds = await collectSubtreeIds(webhook.id, id);
    await prisma.$transaction([
      prisma.driveFolder.updateMany({
        where: { id: { in: subtreeIds }, webhookId: webhook.id },
        data: { trashed: body.trashed, trashedAt: body.trashed ? now : null, updatedAt: now },
      }),
      prisma.driveFile.updateMany({
        where: { webhookId: webhook.id, parentId: { in: subtreeIds } },
        data: { trashed: body.trashed, trashedAt: body.trashed ? now : null, updatedAt: now },
      }),
    ]);
    const row = await prisma.driveFolder.findFirst({ where: { id, webhookId: webhook.id } });
    if (!row) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
    return NextResponse.json(toFolderEntry(row));
  }

  const row = await prisma.driveFolder.update({ where: { id }, data });
  return NextResponse.json(toFolderEntry(row));
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const subtreeIds = await collectSubtreeIds(webhook.id, id);

  // Collect file rows for caller's Discord cleanup.
  const fileRows = await prisma.driveFile.findMany({
    where: { webhookId: webhook.id, parentId: { in: subtreeIds } },
  });

  await prisma.$transaction([
    prisma.driveFile.deleteMany({
      where: { webhookId: webhook.id, parentId: { in: subtreeIds } },
    }),
    prisma.driveFolder.deleteMany({
      where: { id: { in: subtreeIds }, webhookId: webhook.id },
    }),
  ]);

  return NextResponse.json({
    deletedFolderIds: subtreeIds,
    deletedFiles: fileRows.map(toFileEntry),
  });
}

/** BFS: collect folderId + all descendant folder ids. */
async function collectSubtreeIds(webhookId: string, rootId: string): Promise<string[]> {
  const all = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = await prisma.driveFolder.findMany({
      where: { webhookId, parentId: cur },
      select: { id: true },
    });
    for (const c of children) {
      all.push(c.id);
      queue.push(c.id);
    }
  }
  return all;
}

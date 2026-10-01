/**
 * POST /api/drive/[driveId]/folders  — create a folder
 * GET  /api/drive/[driveId]/folders  — list ALL non-trashed folders (for move dialog)
 */
import { recordChanges } from "@/lib/api-v2/drive";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook, toFolderEntry } from "../../_helpers";
import { wrappedBlob } from "@/lib/e2ee-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const rows = await prisma.driveFolder.findMany({
    where: { webhookId: result.webhook.id, trashed: false },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ folders: rows.map(toFolderEntry) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> },
) {
  const { driveId } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { webhook } = result;

  const body = (await req.json()) as { id: string; parentId: string; name: string; encName?: string };
  if (body.encName !== undefined && (webhook.e2eeVersion < 1 || !wrappedBlob.safeParse(body.encName).success)) {
    return NextResponse.json({ error: "Nom chiffré invalide." }, { status: 400 });
  }

  const row = await prisma.driveFolder.create({
    data: {
      id: body.id,
      webhookId: webhook.id,
      driveId,
      parentId: body.parentId,
      // An encrypted folder never exposes its name to the server.
      name: body.encName ? "" : body.name.trim() || "Nouveau dossier",
      encName: body.encName ?? null,
    },
  });
  await recordChanges(webhook.id, [{ type: "upsert", kind: "folder", id: row.id }]);
  return NextResponse.json(toFolderEntry(row), { status: 201 });
}

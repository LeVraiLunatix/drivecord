/**
 * POST   /api/v1/files/[id]/public — create (or replace) a permanent, public,
 *        no-auth link for this file. Meant for hotlinking — `<img src="...">`,
 *        direct downloads from a visitor's browser, etc.
 * DELETE /api/v1/files/[id]/public — revoke it.
 *
 * One active public link per file, same "replace on re-create" convention as
 * the web app's manual share feature (`/api/drive/[driveId]/files/[id]/share`)
 * — they share the same `Share` table, so creating one here also replaces a
 * link previously made from the Drivecord UI for this file, and vice versa.
 */
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../../_helpers";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id, trashed: false },
    select: { id: true, locked: true },
  });
  if (!file) return corsJson({ error: "Fichier introuvable." }, { status: 404 });
  if (file.locked) {
    return corsJson(
      { error: "Les fichiers du coffre-fort ne peuvent pas être rendus publics." },
      { status: 400 },
    );
  }

  // Replace any existing share for this file (web UI or API alike).
  await prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } });
  const token = nanoid(10);
  await prisma.share.create({
    data: { token, webhookId: auth.webhook.id, fileId: id, passwordHash: null, expiresAt: null },
  });

  const url = new URL(`/api/v1/public/${token}`, req.url).toString();
  return corsJson({ token, url }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  await prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } });
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}

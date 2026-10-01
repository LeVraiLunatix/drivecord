/**
 * POST /api/drive/[driveId]/e2ee/rotate — swap in a new drive key.
 *
 * The client has generated a new DK and re-wrapped every file key (cheap — file
 * content is not re-encrypted) and re-encrypted every folder name. The server
 * applies it ALL in one transaction, and refuses a partial set: a file or
 * folder left under the old key would become unreadable forever.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientFileId, idLike, isResponse, readBody, requireUser, wrappedBlob } from "@/lib/e2ee-server";

export const runtime = "nodejs";

const schema = z.object({
  dkWrapped: wrappedBlob,
  files: z.array(z.object({ id: clientFileId, fkWrapped: wrappedBlob })).max(100_000),
  folders: z.array(z.object({ id: idLike, encName: wrappedBlob })).max(100_000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ driveId: string }> }) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { driveId } = await params;
  const body = await readBody(req, schema, 32 * 1024 * 1024);
  if (isResponse(body)) return body;

  const webhook = await prisma.webhook.findFirst({ where: { driveId, userId: u.userId } });
  if (!webhook) return NextResponse.json({ error: "Drive introuvable." }, { status: 404 });
  if (webhook.e2eeVersion < 1) return NextResponse.json({ error: "Ce drive n'est pas encore chiffré de bout en bout." }, { status: 409 });

  // Legacy single-IV files are encrypted directly with the current drive key: they must have been
  // re-encrypted to format v1 first, otherwise dropping the old key would strand them.
  const legacy = await prisma.driveFile.count({
    where: { webhookId: webhook.id, cryptoVersion: 0, NOT: { encIv: null }, locked: false },
  });
  if (legacy > 0) {
    return NextResponse.json({ error: `${legacy} fichier(s) à l'ancien format doivent d'abord être rechiffrés.` }, { status: 409 });
  }

  const [files, folders] = await Promise.all([
    prisma.driveFile.findMany({ where: { webhookId: webhook.id, cryptoVersion: { gte: 1 } }, select: { id: true } }),
    prisma.driveFolder.findMany({ where: { webhookId: webhook.id, NOT: { encName: null } }, select: { id: true } }),
  ]);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && b.every((x) => new Set(a).has(x));
  if (!sameSet(body.files.map((f) => f.id), files.map((f) => f.id)) || !sameSet(body.folders.map((f) => f.id), folders.map((f) => f.id))) {
    return NextResponse.json(
      { error: "Rotation incomplète : le drive a changé pendant l'opération. Relance-la." },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.webhook.update({ where: { id: webhook.id }, data: { dkWrapped: body.dkWrapped } }),
    ...body.files.map((f) => prisma.driveFile.updateMany({ where: { id: f.id, webhookId: webhook.id }, data: { fkWrapped: f.fkWrapped } })),
    ...body.folders.map((f) => prisma.driveFolder.updateMany({ where: { id: f.id, webhookId: webhook.id }, data: { encName: f.encName } })),
  ]);
  return NextResponse.json({ ok: true });
}

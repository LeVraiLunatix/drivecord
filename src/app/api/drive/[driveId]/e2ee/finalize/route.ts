/**
 * POST /api/drive/[driveId]/e2ee/finalize — migrate a legacy drive to end-to-end encryption.
 *
 * The client has fetched the old server-held key one last time, wrapped it with
 * the user's Master Key, and sends the wrapped blob. The server stores it, flips
 * `e2eeVersion` to 1 and DESTROYS its copy of the key (`encKey = null`).
 * Old files stay readable: they were encrypted with that very key, now known
 * to the client only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody, requireUser, wrappedBlob } from "@/lib/e2ee-server";

export const runtime = "nodejs";

const schema = z.object({ dkWrapped: wrappedBlob });

export async function POST(req: NextRequest, { params }: { params: Promise<{ driveId: string }> }) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { driveId } = await params;
  const body = await readBody(req, schema);
  if (isResponse(body)) return body;

  const webhook = await prisma.webhook.findFirst({ where: { driveId, userId: u.userId } });
  if (!webhook) return NextResponse.json({ error: "Drive introuvable." }, { status: 404 });

  if (!(await prisma.userKeys.findUnique({ where: { userId: u.userId }, select: { userId: true } }))) {
    return NextResponse.json({ error: "Configure d'abord le chiffrement de ton compte." }, { status: 409 });
  }
  if (webhook.e2eeVersion >= 1) {
    // Idempotent for a retry of the same call; never silently replace an existing key.
    if (webhook.dkWrapped === body.dkWrapped) return NextResponse.json({ ok: true, e2eeVersion: 1 });
    return NextResponse.json({ error: "Ce drive est déjà chiffré de bout en bout." }, { status: 409 });
  }

  const { count } = await prisma.webhook.updateMany({
    where: { id: webhook.id, e2eeVersion: 0 },
    data: { dkWrapped: body.dkWrapped, e2eeVersion: 1, encKey: null },
  });
  if (count !== 1) return NextResponse.json({ error: "Migration déjà effectuée." }, { status: 409 });
  return NextResponse.json({ ok: true, e2eeVersion: 1 });
}

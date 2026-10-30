/**
 * Master-Key transfer to a new device (see lib/crypto/e2ee/keys.ts for the protocol).
 *
 * POST /api/e2ee/transfer — the new device opens a request: { commitment, label }
 * GET  /api/e2ee/transfer — pending requests, for the already-unlocked device to review
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { sendKeyTransferPush } from "@/lib/push/apns";
import { afterCordNotify, DRIVECORD_URL } from "@/lib/cord-sync";

export const runtime = "nodejs";

export const TRANSFER_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 3;

const createSchema = z.object({
  /** base64 of a 32-byte SHA-256. */
  commitment: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  label: z.string().trim().min(1).max(60),
});

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const l = await rateLimit(`e2ee:transfer:create:${u.userId}`, 6, 600);
  if (!l.ok) return NextResponse.json({ error: "Trop de demandes. Réessaie dans quelques minutes." }, { status: 429, headers: { "Retry-After": String(l.retryAfterSec) } });
  const body = await readBody(req, createSchema);
  if (isResponse(body)) return body;

  if (!(await prisma.userKeys.findUnique({ where: { userId: u.userId }, select: { userId: true } }))) {
    return NextResponse.json({ error: "Le chiffrement n'est pas encore configuré sur ce compte." }, { status: 409 });
  }
  const pending = await prisma.keyTransferRequest.count({
    where: { userId: u.userId, status: "pending", expiresAt: { gt: new Date() } },
  });
  if (pending >= MAX_PENDING) return NextResponse.json({ error: "Trop de demandes en attente." }, { status: 429 });

  const row = await prisma.keyTransferRequest.create({
    data: { userId: u.userId, commitment: body.commitment, label: body.label, expiresAt: new Date(Date.now() + TRANSFER_TTL_MS) },
  });

  // Wake the user's other devices so they don't have to open the app and wait for the next poll.
  // Best-effort: the in-app prompt (polling) still works without any push configured.
  try {
    await sendKeyTransferPush(u.userId, { deviceLabel: body.label });
  } catch (err) {
    console.error("[e2ee-transfer] push", err);
  }
  afterCordNotify(
    u.userId,
    {
      title: "Nouvel appareil à approuver",
      body: `${body.label} demande l'accès à tes fichiers chiffrés. Ouvre Drivecord sur un appareil déverrouillé pour l'approuver.`,
      url: `${DRIVECORD_URL}/drive`,
    },
    { kind: { key: "key-transfer", limit: 10, windowSec: 10 * 60 } },
  );

  return NextResponse.json({ id: row.id, expiresAt: row.expiresAt }, { status: 201 });
}

export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const rows = await prisma.keyTransferRequest.findMany({
    where: { userId: u.userId, status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      label: r.label,
      commitment: r.commitment,
      approverNonce: r.approverNonce,
      requesterPublicKey: r.requesterPublicKey,
      requesterNonce: r.requesterNonce,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  });
}

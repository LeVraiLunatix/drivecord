/**
 * POST /api/auth/login-requests/approve   body: { shortCode }
 *
 * Un appareil de confiance (session full) approuve une connexion en saisissant
 * le code à 4 chiffres affiché sur l'appareil qui veut se connecter — plutôt que
 * via la fenêtre automatique. La demande doit appartenir au même compte, être en
 * attente et non expirée.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDeviceId } from "@/lib/auth/device";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await rateLimit(`loginreq:approve:${userId}`, 20, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { shortCode?: string };
  const code = (body.shortCode ?? "").trim();
  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "Code à 4 chiffres requis." }, { status: 400 });
  }

  const lr = await prisma.loginRequest.findFirst({
    where: { userId, shortCode: code, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!lr) {
    return NextResponse.json(
      { error: "Aucune connexion en attente avec ce code." },
      { status: 404 },
    );
  }
  if (lr.expiresAt.getTime() < Date.now()) {
    await prisma.loginRequest.update({
      where: { id: lr.id },
      data: { status: "expired" },
    });
    return NextResponse.json({ error: "Demande expirée." }, { status: 410 });
  }

  await prisma.loginRequest.update({
    where: { id: lr.id },
    data: { status: "approved", approvedByDeviceId: readDeviceId(req) ?? null },
  });

  return NextResponse.json({ ok: true, deviceLabel: lr.requestingDeviceLabel });
}

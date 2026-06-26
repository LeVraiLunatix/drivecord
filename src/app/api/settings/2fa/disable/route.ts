/**
 * POST /api/settings/2fa/disable   body: { code }
 *
 * Disables 2FA after re-verifying with a TOTP token or a recovery code
 * (email-method users disable with a recovery code).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifySecondFactor } from "@/lib/auth/second-factor";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await rateLimit(`2fa:disable:${userId}`, 10, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled) {
    return NextResponse.json(
      { error: "La double authentification n'est pas activée." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = body.code?.trim() ?? "";
  const kind = await verifySecondFactor(userId, code, true);
  if (!kind) {
    return NextResponse.json(
      { error: "Code 2FA ou de récupération incorrect." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.totpSecret.deleteMany({ where: { userId } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorMethod: null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

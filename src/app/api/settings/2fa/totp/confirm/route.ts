/**
 * POST /api/settings/2fa/totp/confirm   body: { token }
 *
 * Confirms the pending TOTP secret with a code from the authenticator app,
 * enables 2FA, and issues 10 recovery codes (shown once).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { replaceRecoveryCodes } from "@/lib/auth/recovery-codes";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await rateLimit(`2fa:confirm:${userId}`, 10, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim() ?? "";

  const totp = await prisma.totpSecret.findUnique({ where: { userId } });
  if (!totp || totp.enabled) {
    return NextResponse.json(
      { error: "Aucune configuration en attente." },
      { status: 400 },
    );
  }

  const ok = await verifyTotp(decryptSecret(totp.secretEncrypted), token);
  if (!ok) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.totpSecret.update({
      where: { userId },
      data: { enabled: true, confirmedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: "totp" },
    }),
  ]);

  const recoveryCodes = await replaceRecoveryCodes(userId);
  return NextResponse.json({ ok: true, recoveryCodes });
}

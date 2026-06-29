/**
 * POST /api/settings/2fa/email — activer la 2FA par email.
 *
 * N'écrase PAS le TOTP : les deux méthodes peuvent coexister. La méthode
 * préférée reste inchangée si elle existe déjà, sinon email devient préférée.
 * Les codes de récupération ne sont générés qu'au tout premier facteur activé.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { replaceRecoveryCodes } from "@/lib/auth/recovery-codes";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const [current, recoveryCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorMethod: true },
    }),
    prisma.recoveryCode.count({ where: { userId } }),
  ]);

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      emailOtpEnabled: true,
      twoFactorMethod: current?.twoFactorMethod ?? "email",
    },
  });

  const recoveryCodes =
    recoveryCount > 0 ? null : await replaceRecoveryCodes(userId);
  return NextResponse.json({ ok: true, recoveryCodes });
}

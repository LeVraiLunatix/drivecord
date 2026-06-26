/**
 * POST /api/settings/2fa/email — enable email-based 2FA.
 *
 * Switches the account to email 2FA (removing any TOTP secret so a single
 * method is active) and issues fresh recovery codes.
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

  await prisma.$transaction([
    prisma.totpSecret.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: "email" },
    }),
  ]);

  const recoveryCodes = await replaceRecoveryCodes(userId);
  return NextResponse.json({ ok: true, recoveryCodes });
}

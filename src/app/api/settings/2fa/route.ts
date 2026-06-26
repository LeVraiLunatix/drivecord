/**
 * GET /api/settings/2fa — current 2FA status for the settings UI.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, totp, recoveryRemaining] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorMethod: true },
    }),
    prisma.totpSecret.findUnique({
      where: { userId },
      select: { enabled: true },
    }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);

  return NextResponse.json({
    enabled: user?.twoFactorEnabled ?? false,
    method: user?.twoFactorMethod ?? null,
    totpConfigured: totp?.enabled ?? false,
    recoveryRemaining,
  });
}

/**
 * GET /api/settings/2fa — état 2FA (multi-méthodes) pour l'UI des réglages.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadTwoFactor } from "@/lib/auth/two-factor";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const [state, recoveryRemaining] = await Promise.all([
    loadTwoFactor(userId),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);

  return NextResponse.json({
    enabled: state.enabled,
    totpEnabled: state.totpEnabled,
    emailEnabled: state.emailEnabled,
    preferred: state.preferred,
    recoveryRemaining,
  });
}

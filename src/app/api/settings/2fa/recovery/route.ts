/**
 * POST /api/settings/2fa/recovery — regenerate recovery codes (invalidates old).
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled) {
    return NextResponse.json(
      { error: "Active d'abord la double authentification." },
      { status: 400 },
    );
  }

  const recoveryCodes = await replaceRecoveryCodes(userId);
  return NextResponse.json({ ok: true, recoveryCodes });
}

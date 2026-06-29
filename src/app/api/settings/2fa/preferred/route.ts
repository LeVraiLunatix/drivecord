/**
 * POST /api/settings/2fa/preferred   body: { method }
 *
 * Définit la méthode 2FA préférée (présentée en premier au login). La méthode
 * doit être actuellement activée.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadTwoFactor, type TwoFactorMethod } from "@/lib/auth/two-factor";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as {
    method?: TwoFactorMethod;
  };
  const method = body.method;
  if (method !== "totp" && method !== "email") {
    return NextResponse.json({ error: "Méthode invalide." }, { status: 400 });
  }

  const state = await loadTwoFactor(userId);
  const isEnabled = method === "totp" ? state.totpEnabled : state.emailEnabled;
  if (!isEnabled) {
    return NextResponse.json(
      { error: "Cette méthode n'est pas activée." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorMethod: method },
  });

  return NextResponse.json({ ok: true });
}

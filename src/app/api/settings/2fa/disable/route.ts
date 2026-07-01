/**
 * POST /api/settings/2fa/disable   body: { code, method? }
 *
 * Re-vérifie avec un code TOTP ou un code de récupération, puis désactive :
 *  - method "totp" | "email" → désactive uniquement cette méthode (l'autre reste).
 *  - method absent           → désactive complètement la 2FA.
 * Les codes de récupération ne sont supprimés que s'il ne reste aucune méthode.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifySecondFactor } from "@/lib/auth/second-factor";
import {
  loadTwoFactor,
  resolvePreferred,
  type TwoFactorMethod,
} from "@/lib/auth/two-factor";
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

  const state = await loadTwoFactor(userId);
  if (!state.enabled) {
    return NextResponse.json(
      { error: "La double authentification n'est pas activée." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    method?: TwoFactorMethod;
  };
  const code = body.code?.trim() ?? "";
  const target = body.method;

  const kind = await verifySecondFactor(userId, code, true);
  if (!kind) {
    return NextResponse.json(
      { error: "Code 2FA ou de récupération incorrect." },
      { status: 400 },
    );
  }

  const dropTotp = target === "totp" || !target;
  const dropEmail = target === "email" || !target;
  const dropDevice = target === "device" || !target;
  const totpEnabled = state.totpEnabled && !dropTotp;
  const emailEnabled = state.emailEnabled && !dropEmail;
  const deviceEnabled = state.deviceEnabled && !dropDevice;
  const stillEnabled = totpEnabled || emailEnabled || deviceEnabled;
  const preferred = stillEnabled
    ? resolvePreferred(state.preferred, totpEnabled, emailEnabled, deviceEnabled)
    : null;

  await prisma.$transaction(async (tx) => {
    if (dropTotp) await tx.totpSecret.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: stillEnabled,
        emailOtpEnabled: emailEnabled,
        deviceApprovalEnabled: deviceEnabled,
        twoFactorMethod: preferred,
      },
    });
    if (!stillEnabled) await tx.recoveryCode.deleteMany({ where: { userId } });
  });

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/auth/secure-account — réinitialiser le mot de passe via le lien
 * « ce n'était pas moi » reçu par email.
 *
 * Body: { token, newPassword }
 *  - Le jeton (à usage unique, 30 min) prouve le contrôle de la boîte mail.
 *  - On change le mot de passe (verrouille quiconque avait l'ancien), on révoque
 *    les appareils de confiance et les demandes de connexion en attente, et on
 *    marque l'email comme vérifié (le clic prouve la possession).
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  verifySecureAccountToken,
  consumeSecureAccountToken,
} from "@/lib/auth/secure-account";

export async function POST(req: NextRequest) {
  const { token, newPassword } = (await req.json()) as {
    token?: string;
    newPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit faire au moins 8 caractères." },
      { status: 400 },
    );
  }

  const secure = token ? await verifySecureAccountToken(token) : null;
  if (!secure) {
    return NextResponse.json(
      { error: "Lien invalide ou expiré. Redemande un nouvel email." },
      { status: 400 },
    );
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: secure.userId },
      data: { password: hash, emailVerified: new Date() },
    }),
    prisma.trustedDevice.deleteMany({ where: { userId: secure.userId } }),
    prisma.loginRequest.deleteMany({ where: { userId: secure.userId } }),
  ]);
  await consumeSecureAccountToken(secure.id);

  return NextResponse.json({ ok: true });
}

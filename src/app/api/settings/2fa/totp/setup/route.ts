/**
 * POST /api/settings/2fa/totp/setup
 *
 * Generates a fresh TOTP secret (stored encrypted, not yet enabled) and returns
 * the otpauth URI + a QR-code data URL to scan. Confirm step enables it.
 */
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const existing = await prisma.totpSecret.findUnique({ where: { userId } });
  if (existing?.enabled) {
    return NextResponse.json(
      { error: "L'authentification par application est déjà activée." },
      { status: 409 },
    );
  }

  const secret = newTotpSecret();
  await prisma.totpSecret.upsert({
    where: { userId },
    create: { userId, secretEncrypted: encryptSecret(secret), enabled: false },
    update: { secretEncrypted: encryptSecret(secret), enabled: false, confirmedAt: null },
  });

  const uri = totpKeyUri(secret, session.user.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return NextResponse.json({ uri, qr, secret });
}

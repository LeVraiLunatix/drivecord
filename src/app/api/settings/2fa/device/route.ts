/**
 * POST /api/settings/2fa/device — activer la 2FA par approbation d'appareil.
 *
 * Le 2e facteur sera d'approuver la connexion depuis un autre appareil de
 * confiance (onglet « Approuver »). Nécessite donc d'avoir DÉJÀ au moins un
 * appareil de confiance, sinon on ne pourrait plus se connecter.
 * N'écrase pas les autres méthodes ; codes de récupération générés au 1er facteur.
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

  const [current, recoveryCount, trustedCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorMethod: true },
    }),
    prisma.recoveryCode.count({ where: { userId } }),
    prisma.trustedDevice.count({ where: { userId } }),
  ]);

  if (trustedCount === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun appareil de confiance. Connecte-toi d'abord sur un appareil (il devient de confiance), puis active cette méthode.",
      },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      deviceApprovalEnabled: true,
      twoFactorMethod: current?.twoFactorMethod ?? "device",
    },
  });

  const recoveryCodes =
    recoveryCount > 0 ? null : await replaceRecoveryCodes(userId);
  return NextResponse.json({ ok: true, recoveryCodes });
}

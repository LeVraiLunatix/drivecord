/**
 * POST /api/push/register   body: { token, platform? }
 *
 * Enregistre le jeton APNs de l'appareil natif pour le compte connecté (session
 * full). Le jeton est unique : s'il existait pour un autre compte (changement
 * d'utilisateur sur le même téléphone), il est réassigné au compte courant.
 *
 * DELETE /api/push/register   body: { token }
 *
 * Appelé à la déconnexion dans l'app : sans ça, le téléphone continuait de
 * recevoir les demandes de connexion (avec leur code) du compte qu'on venait
 * de quitter.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDeviceId } from "@/lib/auth/device";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const { token, platform } = (await req.json().catch(() => ({}))) as {
    token?: string;
    platform?: string;
  };
  if (!token || token.length < 16 || token.length > 512) {
    return NextResponse.json({ error: "Jeton invalide." }, { status: 400 });
  }

  const deviceId = readDeviceId(req);
  await prisma.pushToken.upsert({
    where: { token },
    create: {
      userId,
      token,
      platform: platform === "android" ? "android" : "ios",
      deviceId,
    },
    update: { userId, deviceId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || token.length > 512) {
    return NextResponse.json({ error: "Jeton invalide." }, { status: 400 });
  }
  // Only this account's copy: a token re-assigned to someone else stays theirs.
  await prisma.pushToken.deleteMany({ where: { token, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}

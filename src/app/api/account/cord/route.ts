/**
 * /api/account/cord — dissociate the Compte Cord from the current user.
 *
 * DELETE → 204. Refused (409) when Cord is the only way left to sign in
 * (no password, no passkey, no Google/Discord). Linking goes through the
 * normal Auth.js flow from Settings (see cordSignInGuard).
 *
 * Only Drivecord's side is removed: the Cord tokens stay valid until they
 * expire (5 min) — revoking the app is done in Compte Cord › Apps connectées.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUnlinkCord } from "@/lib/auth/cord-shared";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      accounts: { select: { provider: true } },
      _count: { select: { authenticators: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  if (!user.accounts.some((a) => a.provider === "cord")) {
    return new NextResponse(null, { status: 204 });
  }

  const allowed = canUnlinkCord({
    hasPassword: Boolean(user.password),
    passkeyCount: user._count.authenticators,
    providers: user.accounts.map((a) => a.provider).filter((p) => p !== "cord"),
  });
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Cord est ta seule méthode de connexion. Ajoute un mot de passe ou un passkey avant de le dissocier.",
      },
      { status: 409 },
    );
  }

  await prisma.account.deleteMany({ where: { userId, provider: "cord" } });
  return new NextResponse(null, { status: 204 });
}

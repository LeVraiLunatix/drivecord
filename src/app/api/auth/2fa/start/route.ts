/**
 * POST /api/auth/2fa/start
 *
 * For a pending(2fa) session: if the user's 2FA method is email, send the code;
 * for TOTP there's nothing to send. Returns the active method to the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createEmailCode } from "@/lib/auth/email-code";
import { sendVerificationEmail } from "@/lib/email";
import { loadTwoFactor } from "@/lib/auth/two-factor";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (session.level !== "pending" || session.pendingReason !== "2fa") {
    return NextResponse.json({ error: "Aucune 2FA en attente." }, { status: 400 });
  }
  const userId = session.user.id;
  const email = session.user.email;

  // Envoie un code email seulement si la méthode email est activée (peut
  // coexister avec le TOTP). Sinon il n'y a rien à envoyer.
  const state = await loadTwoFactor(userId);
  if (!state.emailEnabled) {
    return NextResponse.json({ ok: true, emailSent: false });
  }

  const ip = getClientIp(req);
  const byIp = await rateLimit(`2fa:email:ip:${ip}`, 10, 60 * 60);
  const byUser = await rateLimit(`2fa:email:user:${userId}`, 6, 60 * 60);
  if (!byIp.ok || !byUser.ok) {
    return NextResponse.json(
      { error: "Trop de demandes. Réessaie plus tard." },
      { status: 429 },
    );
  }

  const created = await createEmailCode({ email, purpose: "2fa", userId });
  if (!created.ok) {
    return NextResponse.json(
      { error: "Patiente avant de redemander un code.", cooldownSec: created.cooldownSec },
      { status: 429 },
    );
  }

  try {
    await sendVerificationEmail(email, created.code, "2fa");
  } catch (err) {
    console.error("[2fa/start]", err);
    return NextResponse.json({ error: "Échec de l'envoi de l'email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSent: true, cooldownSec: 60 });
}

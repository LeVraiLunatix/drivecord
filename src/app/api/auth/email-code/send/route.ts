/**
 * POST /api/auth/email-code/send
 *
 * Sends a 6-digit verification code for the current pending session. The
 * purpose is derived from the session's pending reason (never trusted from the
 * client). Rate-limited per IP and per user, with a 60s resend cooldown.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createEmailCode, emailPurposeFromReason } from "@/lib/auth/email-code";
import { createSecureAccountToken } from "@/lib/auth/secure-account";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const APP_URL = process.env.WEBAUTHN_ORIGIN ?? "https://drivecord.vercel.app";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
  if (session.level !== "pending") {
    return NextResponse.json(
      { error: "Aucune vérification requise." },
      { status: 400 },
    );
  }
  const purpose = emailPurposeFromReason(session.pendingReason ?? null);
  if (!purpose) {
    return NextResponse.json(
      { error: "Type de vérification non géré ici." },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const byIp = await rateLimit(`emailcode:send:ip:${ip}`, 10, 60 * 60);
  const byUser = await rateLimit(`emailcode:send:user:${user.id}`, 6, 60 * 60);
  if (!byIp.ok || !byUser.ok) {
    return NextResponse.json(
      {
        error: "Trop de demandes. Réessaie plus tard.",
        retryAfterSec: Math.max(byIp.retryAfterSec, byUser.retryAfterSec),
      },
      { status: 429 },
    );
  }

  const created = await createEmailCode({
    email: user.email,
    purpose,
    userId: user.id,
  });
  if (!created.ok) {
    return NextResponse.json(
      {
        error: "Patiente avant de redemander un code.",
        cooldownSec: created.cooldownSec,
      },
      { status: 429 },
    );
  }

  // Lien « ce n'était pas moi » (sécuriser le compte) — best-effort, non bloquant.
  let secureUrl: string | undefined;
  try {
    const token = await createSecureAccountToken(user.id, user.email);
    secureUrl = `${APP_URL}/secure-account?token=${token}`;
  } catch (err) {
    console.error("[email-code/send] secure token", err);
  }

  try {
    await sendVerificationEmail(user.email, created.code, purpose, 10, secureUrl);
  } catch (err) {
    console.error("[email-code/send]", err);
    return NextResponse.json(
      { error: "Échec de l'envoi de l'email." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, cooldownSec: 60 });
}

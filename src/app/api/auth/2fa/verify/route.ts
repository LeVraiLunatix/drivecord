/**
 * POST /api/auth/2fa/verify   body: { code, recovery? }
 *
 * Second factor for a pending(2fa) session: TOTP token, email code, or recovery
 * code. On success, promotes the session to full.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifySecondFactor } from "@/lib/auth/second-factor";
import { consumeRecoveryCode } from "@/lib/auth/recovery-codes";
import { verifyEmailCode } from "@/lib/auth/email-code";
import { markFullSession } from "@/lib/auth/login";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (session.level !== "pending" || session.pendingReason !== "2fa") {
    return NextResponse.json({ error: "Aucune 2FA en attente." }, { status: 400 });
  }
  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };

  const rl = await rateLimit(`2fa:verify:${user.id}`, 15, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie plus tard." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    recovery?: boolean;
  };
  const code = body.code?.trim() ?? "";
  if (!code) {
    return NextResponse.json({ error: "Code requis." }, { status: 400 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorMethod: true },
  });
  const method = profile?.twoFactorMethod ?? "totp";

  let ok = false;
  if (body.recovery) {
    ok = await consumeRecoveryCode(user.id, code);
  } else if (method === "email") {
    const r = await verifyEmailCode({ email: user.email, purpose: "2fa", code });
    ok = r.ok;
  } else {
    ok = (await verifySecondFactor(user.id, code, false)) !== null;
  }
  // Recovery code also accepted without the explicit flag.
  if (!ok && !body.recovery) {
    ok = await consumeRecoveryCode(user.id, code);
  }

  if (!ok) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  await markFullSession(req, res, user);
  return res;
}

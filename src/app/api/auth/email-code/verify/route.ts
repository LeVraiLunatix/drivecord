/**
 * POST /api/auth/email-code/verify   body: { code }
 *
 * Verifies the code for the current pending session, applies the per-purpose
 * effects (mark email verified, slide the 24h window, trust this device), then
 * promotes the session JWT to its new level (usually "full").
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyEmailCode, emailPurposeFromReason } from "@/lib/auth/email-code";
import { evaluateUserLevel } from "@/lib/auth/auth-level";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, isSecureRequest } from "@/lib/auth/session-token";
import {
  readDeviceId,
  generateDeviceId,
  recordTrustedDevice,
  deviceCookieOptions,
  DEVICE_COOKIE,
} from "@/lib/auth/device";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const ERROR_MESSAGES: Record<string, string> = {
  expired: "Code expiré — demandes-en un nouveau.",
  invalid: "Code incorrect.",
  too_many: "Trop de tentatives. Demande un nouveau code.",
  not_found: "Aucun code en attente. Demande un nouveau code.",
};

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

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = body.code?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Code à 6 chiffres requis." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = await rateLimit(`emailcode:verify:user:${user.id}`, 15, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie plus tard.", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  const result = await verifyEmailCode({ email: user.email, purpose, code });
  if (!result.ok) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[result.error] ?? "Code invalide." },
      { status: 400 },
    );
  }

  // Per-purpose effects. signup also proves the email address.
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: purpose === "signup" ? { emailVerified: now, lastLoginAt: now } : { lastLoginAt: now },
  });

  // Trust this device (creates the device-id cookie on first sight).
  let deviceId = readDeviceId(req);
  const isNewDevice = !deviceId;
  if (!deviceId) deviceId = generateDeviceId();
  await recordTrustedDevice({
    userId: user.id,
    deviceId,
    ip,
    ua: req.headers.get("user-agent"),
  });

  // Recompute and promote the session.
  const level = await evaluateUserLevel(user.id);
  const secure = isSecureRequest(req);
  const res = NextResponse.json({
    ok: true,
    level: level?.level ?? "full",
    reason: level?.reason ?? null,
  });
  await setSessionCookie(
    res,
    { id: user.id, name: user.name, email: user.email, image: user.image },
    level?.level ?? "full",
    level?.reason ?? null,
    secure,
  );
  if (isNewDevice) {
    res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions(secure));
  }
  return res;
}

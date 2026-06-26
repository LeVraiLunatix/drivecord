/**
 * Finalize a login that was authenticated outside the Auth.js credentials flow
 * (passkey today; reused by 2FA promotion and cross-device approval).
 *
 * `markFullSession` opens a full session (slides the 24h window, trusts the
 * device, writes the cookie). `finalizeLogin` computes the step-up level first
 * and only marks full when no further factor is required.
 */
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateUserLevel, type LevelResult } from "@/lib/auth/auth-level";
import {
  setSessionCookie,
  isSecureRequest,
  type SessionUser,
} from "@/lib/auth/session-token";
import {
  readDeviceId,
  generateDeviceId,
  recordTrustedDevice,
  deviceCookieOptions,
  DEVICE_COOKIE,
} from "@/lib/auth/device";
import { getClientIp } from "@/lib/rate-limit";

/** Open a full session: slide the 24h window, trust the device, set the cookie. */
export async function markFullSession(
  req: NextRequest,
  res: NextResponse,
  user: SessionUser,
): Promise<void> {
  const secure = isSecureRequest(req);
  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  let deviceId = readDeviceId(req);
  const isNewDevice = !deviceId;
  if (!deviceId) deviceId = generateDeviceId();
  await recordTrustedDevice({
    userId: user.id,
    deviceId,
    ip: getClientIp(req),
    ua: req.headers.get("user-agent"),
  });
  if (isNewDevice) {
    res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions(secure));
  }

  await setSessionCookie(res, user, "full", null, secure);
}

export async function finalizeLogin(
  req: NextRequest,
  res: NextResponse,
  user: SessionUser,
): Promise<LevelResult> {
  const level = (await evaluateUserLevel(user.id)) ?? {
    level: "full" as const,
    reason: null,
  };

  if (level.level === "full") {
    await markFullSession(req, res, user);
  } else {
    await setSessionCookie(
      res,
      user,
      level.level,
      level.reason,
      isSecureRequest(req),
    );
  }
  return level;
}

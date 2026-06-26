/**
 * Finalize a login that was authenticated outside the Auth.js credentials flow
 * (passkey today; reused by cross-device approval in Phase 5).
 *
 * Computes the step-up level, and — only when the session opens fully — slides
 * the 24h window and trusts the device. Always (re)writes the session cookie.
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

export async function finalizeLogin(
  req: NextRequest,
  res: NextResponse,
  user: SessionUser,
): Promise<LevelResult> {
  const secure = isSecureRequest(req);
  const level = (await evaluateUserLevel(user.id)) ?? {
    level: "full" as const,
    reason: null,
  };

  if (level.level === "full") {
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
  }

  await setSessionCookie(res, user, level.level, level.reason, secure);
  return level;
}

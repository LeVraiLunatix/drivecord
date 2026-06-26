/**
 * Per-device identification via a persistent httpOnly cookie (`dvc_did`).
 *
 * Used to recognise "known" devices for the 24h re-verification rule and as the
 * basis for cross-device login approval (Phase 5). The cookie is opaque random;
 * trust is established only after a successful, fully-verified login.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const DEVICE_COOKIE = "dvc_did";
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/** Read the device id from the request cookies, if present. */
export function readDeviceId(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/(?:^|;\s*)dvc_did=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function generateDeviceId(): string {
  return crypto.randomUUID();
}

export function deviceCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  };
}

/** Human-readable label inferred from the User-Agent (best effort, no deps). */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "un appareil";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navigateur";
  return `${browser} sur ${os}`;
}

/** True if this (user, device) pair has been seen and trusted before. */
export async function isKnownDevice(
  userId: string,
  deviceId: string | null,
): Promise<boolean> {
  if (!deviceId) return false;
  const d = await prisma.trustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
  });
  return Boolean(d);
}

/** Record (or refresh) a trusted device after a fully-verified login. */
export async function recordTrustedDevice(params: {
  userId: string;
  deviceId: string;
  ip?: string | null;
  ua?: string | null;
}): Promise<void> {
  const { userId, deviceId, ip = null, ua = null } = params;
  await prisma.trustedDevice.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: {
      userId,
      deviceId,
      deviceLabel: deviceLabel(ua),
      userAgent: ua,
      ip,
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date(), ip, userAgent: ua },
  });
}

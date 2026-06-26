/**
 * Step-up authentication level.
 *
 * A session JWT carries `level: "pending" | "full"`. The first factor (password
 * or OAuth) opens a session, but if a second factor is still required the level
 * stays "pending" and the proxy redirects every protected route to the
 * challenge screen until it's resolved.
 *
 * The level is computed purely from DB state (no request context needed here),
 * so it works identically for Credentials and OAuth.
 */
import { prisma } from "@/lib/prisma";

export type AuthLevel = "pending" | "full";
export type PendingReason =
  | "email_verify"
  | "login_24h"
  | "2fa"
  | "device_approval"
  | null;

/** Email re-verification is required past this delay since the last login. */
export const LOGIN_REVERIFY_MS = 24 * 60 * 60 * 1000;

export type LevelInput = {
  emailVerified: Date | null;
  lastLoginAt: Date | null;
  twoFactorEnabled: boolean;
};

export type LevelResult = { level: AuthLevel; reason: PendingReason };

/**
 * Required level for a user, given its row fields. Order matters: the first
 * unmet requirement wins (it's the next challenge to present).
 */
export function levelFromUser(u: LevelInput): LevelResult {
  // 1) Email never proven (typically a password sign-up) → verify email.
  if (!u.emailVerified) return { level: "pending", reason: "email_verify" };
  // 2) 2FA enabled → second factor. Takes precedence over the 24h rule so a 2FA
  //    user isn't asked for BOTH an email code and their 2FA on the same login.
  if (u.twoFactorEnabled) return { level: "pending", reason: "2fa" };
  // 3) Never logged in, or last login older than 24h → email login code.
  if (
    !u.lastLoginAt ||
    Date.now() - u.lastLoginAt.getTime() > LOGIN_REVERIFY_MS
  ) {
    return { level: "pending", reason: "login_24h" };
  }
  return { level: "full", reason: null };
}

/** Load the user and compute its level. Null if the user no longer exists. */
export async function evaluateUserLevel(
  userId: string,
): Promise<LevelResult | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, lastLoginAt: true, twoFactorEnabled: true },
  });
  if (!u) return null;
  return levelFromUser(u);
}

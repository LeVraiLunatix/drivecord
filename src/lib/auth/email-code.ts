/**
 * Email verification codes (6 digits, hashed at rest).
 *
 * Codes are single-use, expire after 10 minutes, allow at most 5 attempts, and
 * enforce a 60-second resend cooldown per (email, purpose). Only the SHA-256
 * hash is stored — the plaintext code only ever exists in the email.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { PendingReason } from "./auth-level";

export type EmailPurpose = "signup" | "login_24h" | "2fa" | "email_change";

/** Map a session's pending reason to the email code purpose, if email-based. */
export function emailPurposeFromReason(
  reason: PendingReason,
): EmailPurpose | null {
  if (reason === "email_verify") return "signup";
  if (reason === "login_24h") return "login_24h";
  if (reason === "2fa") return "2fa";
  return null;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Cryptographically-random 6-digit code, zero-padded. */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export type CreateResult =
  | { ok: true; code: string }
  | { ok: false; cooldownSec: number };

/**
 * Create a code for (email, purpose). Enforces the resend cooldown. Returns the
 * plaintext code to send, or the remaining cooldown.
 */
export async function createEmailCode(params: {
  email: string;
  purpose: EmailPurpose;
  userId?: string | null;
}): Promise<CreateResult> {
  const { email, purpose, userId = null } = params;

  const last = await prisma.emailVerificationToken.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const cooldownSec = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000,
    );
    return { ok: false, cooldownSec };
  }

  const code = generateCode();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      email,
      codeHash: hashCode(code),
      purpose,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return { ok: true, code };
}

export type VerifyResult =
  | { ok: true; userId: string | null }
  | { ok: false; error: "expired" | "invalid" | "too_many" | "not_found" };

/**
 * Verify a code. Increments attempts, enforces the attempt limit, and marks the
 * token consumed on success.
 */
export async function verifyEmailCode(params: {
  email: string;
  purpose: EmailPurpose;
  code: string;
}): Promise<VerifyResult> {
  const { email, purpose, code } = params;

  const token = await prisma.emailVerificationToken.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!token) return { ok: false, error: "not_found" };
  if (token.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }
  if (token.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too_many" };

  // Constant-time compare of the hashes.
  const expected = Buffer.from(token.codeHash);
  const got = Buffer.from(hashCode(code));
  const match =
    expected.length === got.length && crypto.timingSafeEqual(expected, got);

  if (!match) {
    await prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "invalid" };
  }

  await prisma.emailVerificationToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true, userId: token.userId };
}

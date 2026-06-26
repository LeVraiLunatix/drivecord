/**
 * 2FA recovery codes (single-use, hashed at rest).
 *
 * Displayed once at generation; only SHA-256 hashes are stored. Input is
 * normalised (dashes stripped, lowercased) so users can type them either way.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const COUNT = 10;

export function generateRecoveryCodes(count = COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`.toUpperCase());
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/-/g, "").toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Replace all of a user's recovery codes; returns the new plaintext codes. */
export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
    }),
  ]);
  return codes;
}

/** Consume a matching unused recovery code. Returns true if one was spent. */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const match = await prisma.recoveryCode.findFirst({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
  });
  if (!match) return false;
  await prisma.recoveryCode.update({
    where: { id: match.id },
    data: { usedAt: new Date() },
  });
  return true;
}

export async function countRemainingRecoveryCodes(
  userId: string,
): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}

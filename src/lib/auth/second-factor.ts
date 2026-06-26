/**
 * Verify a second factor that is NOT an email code: a TOTP token or a recovery
 * code. (Email 2FA codes go through verifyEmailCode with purpose "2fa".)
 */
import { prisma } from "@/lib/prisma";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { consumeRecoveryCode } from "@/lib/auth/recovery-codes";

export type SecondFactorKind = "totp" | "recovery" | null;

export async function verifySecondFactor(
  userId: string,
  code: string,
  allowRecovery = true,
): Promise<SecondFactorKind> {
  const cleaned = code.trim();

  const totp = await prisma.totpSecret.findUnique({ where: { userId } });
  if (totp?.enabled && /^\d{6}$/.test(cleaned)) {
    const ok = await verifyTotp(decryptSecret(totp.secretEncrypted), cleaned);
    if (ok) return "totp";
  }

  if (allowRecovery && (await consumeRecoveryCode(userId, cleaned))) {
    return "recovery";
  }

  return null;
}

/**
 * État 2FA multi-méthodes.
 *
 * Une 2FA peut combiner plusieurs méthodes :
 *  - TOTP  : actif si `TotpSecret.enabled`.
 *  - email : actif si `User.emailOtpEnabled`.
 * `User.twoFactorMethod` est la méthode **préférée** (présentée en premier au
 * login). `User.twoFactorEnabled` est vrai dès qu'au moins une méthode est active.
 */
import { prisma } from "@/lib/prisma";

export type TwoFactorMethod = "totp" | "email";

export type TwoFactorState = {
  totpEnabled: boolean;
  emailEnabled: boolean;
  enabled: boolean;
  preferred: TwoFactorMethod | null;
};

/** Lit l'état 2FA complet d'un utilisateur. */
export async function loadTwoFactor(userId: string): Promise<TwoFactorState> {
  const [user, totp] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorMethod: true, emailOtpEnabled: true },
    }),
    prisma.totpSecret.findUnique({
      where: { userId },
      select: { enabled: true },
    }),
  ]);
  const totpEnabled = totp?.enabled ?? false;
  const emailEnabled = user?.emailOtpEnabled ?? false;
  const preferred = (user?.twoFactorMethod as TwoFactorMethod | null) ?? null;
  return { totpEnabled, emailEnabled, enabled: totpEnabled || emailEnabled, preferred };
}

/**
 * Calcule la méthode préférée valide : garde la préférence actuelle si la
 * méthode est encore active, sinon retombe sur une méthode active, sinon null.
 */
export function resolvePreferred(
  current: TwoFactorMethod | null,
  totpEnabled: boolean,
  emailEnabled: boolean,
): TwoFactorMethod | null {
  if (current === "totp" && totpEnabled) return "totp";
  if (current === "email" && emailEnabled) return "email";
  if (totpEnabled) return "totp";
  if (emailEnabled) return "email";
  return null;
}

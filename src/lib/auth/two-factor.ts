/**
 * État 2FA multi-méthodes.
 *
 * Une 2FA peut combiner plusieurs méthodes :
 *  - TOTP   : actif si `TotpSecret.enabled`.
 *  - email  : actif si `User.emailOtpEnabled`.
 *  - device : approbation depuis un autre appareil de confiance
 *             (`User.deviceApprovalEnabled`) — le 2e facteur = approuver la
 *             connexion via l'onglet « Approuver » d'un appareil déjà connecté.
 * `User.twoFactorMethod` est la méthode **préférée** (présentée en premier au
 * login). `User.twoFactorEnabled` est vrai dès qu'au moins une méthode est active.
 */
import { prisma } from "@/lib/prisma";

export type TwoFactorMethod = "totp" | "email" | "device";

export type TwoFactorState = {
  totpEnabled: boolean;
  emailEnabled: boolean;
  deviceEnabled: boolean;
  enabled: boolean;
  preferred: TwoFactorMethod | null;
};

/** Lit l'état 2FA complet d'un utilisateur. */
export async function loadTwoFactor(userId: string): Promise<TwoFactorState> {
  const [user, totp] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorMethod: true,
        emailOtpEnabled: true,
        deviceApprovalEnabled: true,
      },
    }),
    prisma.totpSecret.findUnique({
      where: { userId },
      select: { enabled: true },
    }),
  ]);
  const totpEnabled = totp?.enabled ?? false;
  const emailEnabled = user?.emailOtpEnabled ?? false;
  const deviceEnabled = user?.deviceApprovalEnabled ?? false;
  const preferred = (user?.twoFactorMethod as TwoFactorMethod | null) ?? null;
  return {
    totpEnabled,
    emailEnabled,
    deviceEnabled,
    enabled: totpEnabled || emailEnabled || deviceEnabled,
    preferred,
  };
}

/**
 * Calcule la méthode préférée valide : garde la préférence actuelle si la
 * méthode est encore active, sinon retombe sur une méthode active, sinon null.
 */
export function resolvePreferred(
  current: TwoFactorMethod | null,
  totpEnabled: boolean,
  emailEnabled: boolean,
  deviceEnabled: boolean,
): TwoFactorMethod | null {
  if (current === "totp" && totpEnabled) return "totp";
  if (current === "email" && emailEnabled) return "email";
  if (current === "device" && deviceEnabled) return "device";
  if (totpEnabled) return "totp";
  if (emailEnabled) return "email";
  if (deviceEnabled) return "device";
  return null;
}

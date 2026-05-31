"use client";

import { isNativeApp } from "@/lib/use-platform";

/**
 * Whether device biometrics (Face ID / Touch ID) are available in the app.
 * Always false on the web (no native API).
 */
export async function biometryAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    return Boolean(info.isAvailable);
  } catch {
    return false;
  }
}

/**
 * Prompt for biometric authentication. Resolves true on success, false on
 * cancel / failure / unavailable.
 */
export async function runBiometric(reason = "Déverrouiller le coffre-fort"): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Annuler",
      allowDeviceCredential: true,
      iosFallbackTitle: "Utiliser le code",
    });
    return true;
  } catch {
    return false;
  }
}

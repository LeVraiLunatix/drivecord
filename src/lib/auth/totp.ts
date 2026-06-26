/**
 * TOTP helpers (otplib v13 functional API).
 *
 * The base32 secret is encrypted at rest with the existing server key
 * (encryptUrl / AES-256-GCM). ±1 time-step tolerance via epochTolerance (30s).
 */
import { generateSecret, generateURI, verify } from "otplib";
import { encryptUrl, decryptUrl } from "@/lib/auth/encrypt";

const ISSUER = process.env.TOTP_ISSUER ?? "Drivecord";

export function newTotpSecret(): string {
  return generateSecret();
}

/** otpauth:// URI to render as a QR code in the authenticator app. */
export function totpKeyUri(secret: string, accountLabel: string): string {
  return generateURI({ issuer: ISSUER, label: accountLabel, secret });
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  const result = await verify({ secret, token, epochTolerance: 30 });
  return result.valid;
}

export function encryptSecret(secret: string): string {
  return encryptUrl(secret);
}

export function decryptSecret(encrypted: string): string {
  return decryptUrl(encrypted);
}

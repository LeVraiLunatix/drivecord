"use client";

/**
 * Local biometric gate for a trusted device (Face ID / Touch ID / fingerprint / Windows Hello).
 *
 * A platform WebAuthn credential is created once and only ever *asserted locally* with
 * userVerification "required": nothing is sent to or checked by the server. It decides whether
 * the app may use this device's silent-unlock key — it is a lock on the device, not a new secret
 * (the key itself stays a non-extractable IndexedDB key).
 */
import { b64urlDecode, b64urlEncode, bs } from "@/lib/crypto/e2ee";
import { passkeysAvailable } from "./passkey-prf";

export async function biometricAvailable(): Promise<boolean> {
  if (!passkeysAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Ask the OS to enrol a platform credential; returns its id (base64url). */
export async function createBiometricCredential(userId: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: bs(crypto.getRandomValues(new Uint8Array(32))),
      rp: { id: window.location.hostname, name: "Drivecord" },
      user: { id: bs(new TextEncoder().encode(`device-lock:${userId}`.slice(0, 64))), name: "cet-appareil", displayName: "Cet appareil" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biométrie non activée.");
  return b64urlEncode(new Uint8Array(cred.rawId));
}

/** Prompt for the biometric. Throws (NotAllowedError) when cancelled or refused. */
export async function assertBiometric(credentialId: string): Promise<void> {
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: bs(crypto.getRandomValues(new Uint8Array(32))),
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: bs(b64urlDecode(credentialId)) }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!res) throw new Error("Vérification biométrique annulée.");
}

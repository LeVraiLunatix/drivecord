"use client";

/**
 * WebAuthn PRF: a passkey can derive a stable secret that never leaves the
 * authenticator — we turn it (HKDF) into the key that wraps the Master Key.
 *
 * This is a LOCAL ceremony (no server round-trip, nothing to verify server-side):
 * the secret is the output itself. Not every browser / authenticator supports
 * PRF; callers fall back to passphrase or recovery key.
 */
import { b64urlDecode, b64urlEncode, PRF_SALT, bs } from "@/lib/crypto/e2ee";
import { isNativeApp } from "@/lib/use-platform";

export function passkeysAvailable(): boolean {
  // The iOS app's WebView exposes the WebAuthn API but every call fails: the
  // app (sideloaded) has no associated domain for drivecord.app. Offering
  // « Avec ma passkey » there was a dead end.
  if (isNativeApp()) return false;
  return typeof window !== "undefined" && typeof PublicKeyCredential !== "undefined" && !!navigator.credentials?.get;
}

type PrfResult = { credentialId: string; output: Uint8Array };

/**
 * Ask the user to touch one of `credentialIds` (any of their passkeys when empty)
 * and return its PRF output. Returns `null` when the authenticator doesn't support PRF.
 */
export async function getPrfOutput(credentialIds: string[]): Promise<PrfResult | null> {
  if (!passkeysAvailable()) throw new Error("Les passkeys ne sont pas disponibles sur cet appareil.");
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: bs(crypto.getRandomValues(new Uint8Array(32))),
      rpId: window.location.hostname,
      allowCredentials: credentialIds.map((id) => ({ type: "public-key" as const, id: bs(b64urlDecode(id)) })),
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: bs(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) return null;

  const ext = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const first = ext.prf?.results?.first;
  if (!first) return null;
  return { credentialId: b64urlEncode(new Uint8Array(assertion.rawId)), output: new Uint8Array(first) };
}

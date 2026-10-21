/**
 * PIN unlock. A 6-digit PIN has only 10^6 values, so an offline attack on a wrapped key would
 * fall in seconds. The PIN therefore never protects anything the server can hand out freely:
 *
 *   Argon2id(PIN, salt) ──HKDF──► auth  : proof sent to the server (it keeps only SHA-256(auth))
 *                       └─HKDF──► KEK   : wraps the Master Key
 *
 * The server releases the wrapped key only for a matching proof, and wipes the PIN after a few
 * wrong tries. Trade-off (documented in SECURITY.md): whoever controls the SERVER can still
 * brute-force 10^6 PINs offline, unlike the passphrase / recovery key / passkey — a PIN is a
 * convenience for devices you'll reconnect often, not a replacement for those.
 */
import { b64encode } from "./encoding";
import { deriveRawFromSecret, hkdf, kekFromHkdf, newPhraseKdf, type PhraseKdf } from "./kdf";
import { aad, unwrap, wrap } from "./wrap";

import { PIN_LENGTH } from "./pin-policy";

export { PIN_LENGTH, PIN_MAX_ATTEMPTS } from "./pin-policy";

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

async function derivePin(pin: string, kdf: PhraseKdf) {
  if (!isValidPin(pin)) throw new Error(`Le PIN doit faire ${PIN_LENGTH} chiffres.`);
  const raw = await deriveRawFromSecret(pin, kdf);
  return { auth: b64encode(await hkdf(raw, "drivecord:pin:auth:v1")), kek: await kekFromHkdf(raw, "drivecord:kek:pin:v1") };
}

export async function addPin(userId: string, mk: Uint8Array, pin: string) {
  const pinKdf = newPhraseKdf();
  const { auth, kek } = await derivePin(pin, pinKdf);
  return { pinKdf, pinAuth: auth, mkWrappedPin: await wrap(kek, mk, aad.mk(userId)) };
}

/** Step 1 of an unlock: the proof to send to the server. */
export async function pinProof(pin: string, kdf: PhraseKdf): Promise<string> {
  return (await derivePin(pin, kdf)).auth;
}

/** Step 2: the server answered with the wrapped key. */
export async function unlockWithPin(userId: string, pin: string, kdf: PhraseKdf, mkWrappedPin: string): Promise<Uint8Array> {
  return unwrap((await derivePin(pin, kdf)).kek, mkWrappedPin, aad.mk(userId));
}

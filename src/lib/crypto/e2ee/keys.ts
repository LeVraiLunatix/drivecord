/**
 * Key hierarchy.
 *
 *   Master Key (MK)   32 random bytes, generated on the device, never sent in clear
 *    ├─ wrapped by KEK_passkey   (WebAuthn PRF → HKDF)
 *    ├─ wrapped by KEK_phrase    (Argon2id of a passphrase, optional)
 *    ├─ wrapped by KEK_recovery  (random 256-bit key, shown once)
 *    └─ wrapped by KEK_device    (non-extractable key kept in IndexedDB on trusted devices)
 *   Drive Key (DK)    per drive, wrapped by MK
 *   File Key (FK)     per file,  wrapped by DK
 *
 * The server only ever stores wrapped blobs it cannot open.
 */
import nacl from "tweetnacl";
import { b64decode, b64encode, bs, bytesEqual, concat, enc, randomBytes } from "./encoding";
import { hkdf, newPhraseKdf, deriveKekFromPhrase, passkeyKek, recoveryKek, generateRecoveryKey, parseRecoveryKey, type PhraseKdf } from "./kdf";
import { aad, importAesKey, unwrap, wrap } from "./wrap";
import { NONCE_PREFIX_LEN } from "./file-cipher";

export const KEYS_VERSION = 1;

/** What the server stores for a user (all blobs are opaque to it). */
export type UserKeysBundle = {
  version: number;
  mkWrappedRecovery: string;
  mkWrappedPhrase: string | null;
  phraseKdf: PhraseKdf | null;
  /** credentialId (base64url) → wrapped MK */
  mkWrappedPasskey: Record<string, string>;
  publicKeyX25519: string;
  privateKeyWrapped: string;
  /** Vault key, wrapped by MK, so recovery doesn't lose the vault. */
  vaultKeyWrapped: string | null;
};

const mkKey = (mk: Uint8Array) => importAesKey(mk);

// ── Creation / unlock ────────────────────────────────────────────────────────

export async function createUserKeys(userId: string): Promise<{ mk: Uint8Array; bundle: UserKeysBundle; recovery: ReturnType<typeof generateRecoveryKey> }> {
  const mk = randomBytes(32);
  const recovery = generateRecoveryKey();
  const pair = nacl.box.keyPair();
  const mkAes = await mkKey(mk);
  return {
    mk,
    recovery,
    bundle: {
      version: KEYS_VERSION,
      mkWrappedRecovery: await wrap(await recoveryKek(recovery.bytes), mk, aad.mk(userId)),
      mkWrappedPhrase: null,
      phraseKdf: null,
      mkWrappedPasskey: {},
      publicKeyX25519: b64encode(pair.publicKey),
      privateKeyWrapped: await wrap(mkAes, pair.secretKey, aad.priv(userId)),
      vaultKeyWrapped: null,
    },
  };
}

export async function unlockWithRecovery(userId: string, bundle: UserKeysBundle, recoveryInput: string): Promise<Uint8Array> {
  return unwrap(await recoveryKek(parseRecoveryKey(recoveryInput)), bundle.mkWrappedRecovery, aad.mk(userId));
}

export async function unlockWithPhrase(userId: string, bundle: UserKeysBundle, phrase: string): Promise<Uint8Array> {
  if (!bundle.mkWrappedPhrase || !bundle.phraseKdf) throw new Error("Aucune phrase de chiffrement n'est configurée.");
  return unwrap(await deriveKekFromPhrase(phrase, bundle.phraseKdf), bundle.mkWrappedPhrase, aad.mk(userId));
}

export async function unlockWithPasskey(userId: string, bundle: UserKeysBundle, credentialId: string, prfOutput: Uint8Array): Promise<Uint8Array> {
  const blob = bundle.mkWrappedPasskey[credentialId];
  if (!blob) throw new Error("Cette passkey n'est pas enregistrée pour le chiffrement.");
  return unwrap(await passkeyKek(prfOutput), blob, aad.mk(userId));
}

/** Add (or replace) the passphrase. Returns the fields to merge into the bundle. */
export async function addPhrase(userId: string, mk: Uint8Array, phrase: string) {
  const phraseKdf = newPhraseKdf();
  return { phraseKdf, mkWrappedPhrase: await wrap(await deriveKekFromPhrase(phrase, phraseKdf), mk, aad.mk(userId)) };
}

export async function addPasskey(userId: string, mk: Uint8Array, prfOutput: Uint8Array): Promise<string> {
  return wrap(await passkeyKek(prfOutput), mk, aad.mk(userId));
}

/** A fresh recovery key for an existing MK (old one is then useless). */
export async function rotateRecovery(userId: string, mk: Uint8Array) {
  const recovery = generateRecoveryKey();
  return { recovery, mkWrappedRecovery: await wrap(await recoveryKek(recovery.bytes), mk, aad.mk(userId)) };
}

export async function unwrapPrivateKey(userId: string, mk: Uint8Array, bundle: UserKeysBundle): Promise<Uint8Array> {
  return unwrap(await mkKey(mk), bundle.privateKeyWrapped, aad.priv(userId));
}

// ── Trusted device (silent unlock) ───────────────────────────────────────────

/** Non-extractable: meant to live in IndexedDB and never leave the device. */
export function createDeviceKek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const wrapForDevice = (kek: CryptoKey, userId: string, mk: Uint8Array) => wrap(kek, mk, `drivecord:device:v1:${userId}`);
export const unwrapForDevice = (kek: CryptoKey, userId: string, blob: string) => unwrap(kek, blob, `drivecord:device:v1:${userId}`);

// ── Drive / file keys ────────────────────────────────────────────────────────

export const generateDriveKey = () => randomBytes(32);
export const wrapDriveKey = async (mk: Uint8Array, driveId: string, dk: Uint8Array) => wrap(await mkKey(mk), dk, aad.dk(driveId));
export const unwrapDriveKey = async (mk: Uint8Array, driveId: string, blob: string) => unwrap(await mkKey(mk), blob, aad.dk(driveId));

export const generateFileKey = () => ({ fk: randomBytes(32), noncePrefix: randomBytes(NONCE_PREFIX_LEN) });
export const wrapFileKey = async (dk: Uint8Array, fileId: string, fk: Uint8Array) => wrap(await importAesKey(dk), fk, aad.fk(fileId));
export const unwrapFileKey = async (dk: Uint8Array, fileId: string, blob: string) => unwrap(await importAesKey(dk), blob, aad.fk(fileId));

export const wrapVaultKey = async (mk: Uint8Array, userId: string, vaultKey: Uint8Array) => wrap(await mkKey(mk), vaultKey, aad.vault(userId));
export const unwrapVaultKey = async (mk: Uint8Array, userId: string, blob: string) => unwrap(await mkKey(mk), blob, aad.vault(userId));

// ── Sharing a file key through a password (Argon2id, server never sees the password) ──

export async function wrapFileKeyForShare(fk: Uint8Array, token: string, password: string) {
  const kdf = newPhraseKdf();
  return { kdf, blob: await wrap(await deriveKekFromPhrase(password, kdf), fk, aad.share(token)) };
}
export async function unwrapFileKeyFromShare(blob: string, kdf: PhraseKdf, token: string, password: string) {
  return unwrap(await deriveKekFromPhrase(password, kdf), blob, aad.share(token));
}

// ── New-device approval: X25519 ECDH + HKDF + AES-GCM, with a commit-reveal SAS ──
//
// A signed-in device that lacks MK asks an unlocked device for it. The server
// only relays public keys, nonces and one sealed blob.
//
// A plain "show a code derived from the public key" is NOT enough against a
// server that swaps keys: it can grind key pairs until the 6 digits collide
// (~10^6 tries, seconds). So the code is a short authentication string agreed
// by commit-reveal, which leaves an active attacker a 1-in-10^6 guess per try:
//
//   1. requester → server : C = H(K_req ‖ r1)            (commitment; K_req, r1 stay secret)
//   2. approver  → server : r2 (random)                  (after seeing C)
//   3. requester → server : K_req, r1                    (reveal, after seeing r2)
//   4. both compute  SAS = H(r1 ‖ r2 ‖ K_req) mod 10^6 ; approver also checks H(K_req ‖ r1) = C
//   5. the USER compares the two screens; only then does the approver seal MK to K_req.
//
// The attacker must fix (K, r1) before r2 exists, and r1 stays hidden from the
// server until step 3 — it can't steer the digits.

export function createApprovalRequest() {
  const pair = nacl.box.keyPair();
  return { publicKey: pair.publicKey, secretKey: pair.secretKey, nonce: randomBytes(16) };
}

const sha256 = async (...parts: Uint8Array[]) => new Uint8Array(await crypto.subtle.digest("SHA-256", bs(concat(...parts))));

export async function approvalCommitment(requesterPublicKey: Uint8Array, requesterNonce: Uint8Array): Promise<string> {
  return b64encode(await sha256(enc.encode("drivecord:commit:v1"), requesterPublicKey, requesterNonce));
}

export async function verifyApprovalCommitment(commitment: string, requesterPublicKey: Uint8Array, requesterNonce: Uint8Array): Promise<boolean> {
  return bytesEqual(b64decode(commitment), b64decode(await approvalCommitment(requesterPublicKey, requesterNonce)));
}

export const createApproverNonce = () => randomBytes(16);

/** The 6 digits both screens show. */
export async function sasCode(requesterNonce: Uint8Array, approverNonce: Uint8Array, requesterPublicKey: Uint8Array): Promise<string> {
  const digest = await sha256(enc.encode("drivecord:sas:v1"), requesterNonce, approverNonce, requesterPublicKey);
  return String(new DataView(digest.buffer).getUint32(0, false) % 1_000_000).padStart(6, "0");
}

async function sharedKek(secret: Uint8Array, theirPublic: Uint8Array, pubA: Uint8Array, pubB: Uint8Array): Promise<CryptoKey> {
  const shared = nacl.scalarMult(secret, theirPublic);
  // Public keys in a canonical order → both sides derive the same key.
  const salt = concat(...[pubA, pubB].sort((x, y) => b64encode(x).localeCompare(b64encode(y))));
  return importAesKey(await hkdf(shared, "drivecord:device-approval:v1", salt));
}

const approvalContext = (userId: string) => `drivecord:approval:v1:${userId}`;

/** Only call this AFTER the user confirmed the SAS and the commitment verified. */
export async function approveDevice(userId: string, mk: Uint8Array, requesterPublicKey: Uint8Array) {
  if (requesterPublicKey.length !== 32) throw new Error("Clé publique invalide.");
  const eph = nacl.box.keyPair();
  const kek = await sharedKek(eph.secretKey, requesterPublicKey, eph.publicKey, requesterPublicKey);
  return { approverPublicKey: eph.publicKey, sealedMk: await wrap(kek, mk, approvalContext(userId)) };
}

export async function completeApproval(userId: string, secretKey: Uint8Array, requesterPublicKey: Uint8Array, approverPublicKey: Uint8Array, sealedMk: string) {
  if (approverPublicKey.length !== 32) throw new Error("Clé publique invalide.");
  const kek = await sharedKek(secretKey, approverPublicKey, approverPublicKey, requesterPublicKey);
  return unwrap(kek, sealedMk, approvalContext(userId));
}

export { b64decode };

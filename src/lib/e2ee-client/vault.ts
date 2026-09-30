"use client";

/**
 * Vault v2 (see app/api/account/vault-pin/route.ts):
 *  - the PIN is stretched with Argon2id and NEVER sent to the server — only a verifier derived from it;
 *  - the vault master key is wrapped under a PIN-derived key, and ALSO under the user's Master Key
 *    (stored in UserKeys), so restoring an account on a new device doesn't lose the vault.
 */
import { authFetch } from "@/lib/api-base";
import {
  aad,
  b64urlEncode,
  deriveRawFromSecret,
  hkdf,
  importAesKey,
  newPhraseKdf,
  unwrap,
  unwrapVaultKey,
  wrap,
  wrapVaultKey,
  type PhraseKdf,
} from "@/lib/crypto/e2ee";
import { deriveVaultKey, generateMasterKeyBytes, importMasterKey, unwrapMasterKeyRaw } from "@/lib/crypto/vault-crypto";
import { setVaultKey } from "@/lib/crypto/vault-key-store";
import { getKeyringSnapshot, getMk, isUnlocked, storeVaultKeyWrapped } from "./keyring";

export type VaultInfo = { hasPin: boolean; kdf: PhraseKdf | null; salt?: string | null };

async function pinMaterial(pin: string, kdf: PhraseKdf) {
  const k = await deriveRawFromSecret(pin, kdf);
  return {
    kek: await importAesKey(await hkdf(k, "drivecord:vault:kek:v1")),
    verifier: b64urlEncode(await hkdf(k, "drivecord:vault:verify:v1")),
  };
}

function userId(): string {
  const id = getKeyringSnapshot().userId;
  if (!id) throw new Error("Non connecté.");
  return id;
}

async function call(method: "PATCH" | "POST", body: unknown) {
  const res = await authFetch("/api/account/vault-pin", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && method === "PATCH") throw new Error(data.error ?? "Échec");
  return data as Record<string, unknown> & { ok?: boolean };
}

/** Keep a copy of the vault key under MK so it survives losing every device's PIN memory. */
async function backupUnderMk(raw: Uint8Array) {
  if (!isUnlocked()) return;
  await storeVaultKeyWrapped(await wrapVaultKey(getMk(), userId(), raw));
}

/** Create the vault: random master key, wrapped under the PIN and under MK. */
export async function createVault(pin: string): Promise<void> {
  const raw = generateMasterKeyBytes();
  const kdf = newPhraseKdf();
  const { kek, verifier } = await pinMaterial(pin, kdf);
  await call("PATCH", { newVerifier: verifier, kdf, wrappedKey: await wrap(kek, raw, aad.vault(userId())) });
  setVaultKey(await importMasterKey(raw));
  await backupUnderMk(raw).catch(() => {});
}

/** Change the PIN of a v2 vault: same master key, new wrapping. */
export async function changeVaultPin(current: string, next: string, info: VaultInfo): Promise<void> {
  if (!info.kdf) throw new Error("Déverrouille d'abord le coffre pour le mettre à niveau.");
  const old = await pinMaterial(current, info.kdf);
  const verified = await call("POST", { verifier: old.verifier });
  if (!verified.ok) throw new Error("Code actuel incorrect.");
  const raw = await unwrap(old.kek, verified.wrappedKey as string, aad.vault(userId()));
  const kdf = newPhraseKdf();
  const fresh = await pinMaterial(next, kdf);
  await call("PATCH", { currentVerifier: old.verifier, newVerifier: fresh.verifier, kdf, wrappedKey: await wrap(fresh.kek, raw, aad.vault(userId())) });
}

/** Verify the PIN and load the vault key. Returns false for a wrong PIN. */
export async function unlockVault(pin: string, info: VaultInfo): Promise<boolean> {
  if (info.kdf) {
    const { kek, verifier } = await pinMaterial(pin, info.kdf);
    const d = await call("POST", { verifier });
    if (!d.ok) return false;
    const raw = await unwrap(kek, d.wrappedKey as string, aad.vault(userId()));
    setVaultKey(await importMasterKey(raw));
    // Older v2 vaults (or a fresh MK) may lack the MK backup: add it now.
    if (!getKeyringSnapshot().bundle?.vaultKeyWrapped) await backupUnderMk(raw).catch(() => {});
    return true;
  }

  // Legacy vault (PBKDF2, plain PIN checked server-side): unlock, then upgrade to v2 right away.
  const d = await call("POST", { pin });
  if (!d.ok) return false;
  let raw: Uint8Array;
  if (d.wrappedKey && d.wrappedKeyIv && d.salt) {
    raw = await unwrapMasterKeyRaw(d.wrappedKey as string, d.wrappedKeyIv as string, await deriveVaultKey(pin, d.salt as string));
  } else if (d.salt) {
    // Even older: the PIN-derived key encrypted the files directly. Same bytes → same key.
    const { deriveVaultKeyRaw } = await import("@/lib/crypto/vault-crypto");
    raw = await deriveVaultKeyRaw(pin, d.salt as string);
  } else {
    throw new Error("Clé de coffre indisponible.");
  }
  setVaultKey(await importMasterKey(raw));
  void upgradeLegacyVault(pin, raw).catch(() => {}); // the vault works either way; retried at the next unlock
  return true;
}

async function upgradeLegacyVault(pin: string, raw: Uint8Array) {
  const kdf = newPhraseKdf();
  const { kek, verifier } = await pinMaterial(pin, kdf);
  await call("PATCH", { currentPin: pin, newVerifier: verifier, kdf, wrappedKey: await wrap(kek, raw, aad.vault(userId())) });
  await backupUnderMk(raw).catch(() => {});
}

/** Open the vault without the PIN, from the MK-wrapped copy (Face ID path / PIN forgotten while unlocked). */
export async function unlockVaultWithMk(): Promise<boolean> {
  const blob = getKeyringSnapshot().bundle?.vaultKeyWrapped;
  if (!blob || !isUnlocked()) return false;
  setVaultKey(await importMasterKey(await unwrapVaultKey(getMk(), userId(), blob)));
  return true;
}

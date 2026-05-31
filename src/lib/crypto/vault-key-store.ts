"use client";

/**
 * In-memory holder for the derived vault key.
 *
 * Set when the user unlocks the vault with their PIN. Cleared when the vault
 * re-locks (leaving the section, switching drive, reload). Never persisted.
 */
let vaultKey: CryptoKey | null = null;

export function setVaultKey(key: CryptoKey | null): void {
  vaultKey = key;
}

export function getVaultKey(): CryptoKey | null {
  return vaultKey;
}

export function clearVaultKey(): void {
  vaultKey = null;
}

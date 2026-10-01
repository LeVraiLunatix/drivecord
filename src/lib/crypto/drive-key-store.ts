"use client";

/**
 * In-memory holder for the active drive's file-encryption key.
 *
 * Set when a drive is opened (imported from `drive.encKey`), cleared on
 * sign-out or when no key is available. Mirrors vault-key-store, but for
 * regular (non-vault) files. Never persisted in plain form.
 */
let driveKey: CryptoKey | null = null;

export function setDriveKey(key: CryptoKey | null): void {
  driveKey = key;
}

export function getDriveKey(): CryptoKey | null {
  return driveKey;
}

export function clearDriveKey(): void {
  driveKey = null;
}

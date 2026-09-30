"use client";

/**
 * The client-side keyring: holds the Master Key in memory once the user has
 * unlocked, and drives every way of unlocking (trusted device, passkey PRF,
 * passphrase, recovery key, approval from another device).
 *
 * MK never leaves this module in clear, is never persisted in clear, and is
 * dropped on `lock()`. On a trusted device a copy wrapped by a NON-EXTRACTABLE
 * device key lives in IndexedDB (silent unlock).
 */
import { mutate } from "swr";
import { authFetch } from "@/lib/api-base";
import {
  addPasskey,
  addPhrase,
  createDeviceKek,
  createUserKeys,
  rotateRecovery,
  unlockWithPasskey,
  unlockWithPhrase,
  unlockWithRecovery,
  unwrapForDevice,
  wrapForDevice,
  type UserKeysBundle,
} from "@/lib/crypto/e2ee";
import { idbDel, idbGet, idbSet } from "./idb";
import { getPrfOutput } from "./passkey-prf";

export type KeyringStatus = "idle" | "loading" | "needs-setup" | "locked" | "unlocked" | "error";

export type KeyringSnapshot = {
  status: KeyringStatus;
  userId: string | null;
  bundle: UserKeysBundle | null;
  passkeys: { credentialId: string; name: string }[];
  /** This device holds a silent-unlock key. */
  trusted: boolean;
  /** First-time setup is showing: stays true after the keys are committed, until the user leaves the last screen. */
  setupInProgress: boolean;
  error: string | null;
};

const initial: KeyringSnapshot = { status: "idle", userId: null, bundle: null, passkeys: [], trusted: false, setupInProgress: false, error: null };

let snapshot: KeyringSnapshot = initial;
let mk: Uint8Array | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<KeyringSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

export const subscribeKeyring = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const getKeyringSnapshot = () => snapshot;
export const getServerSnapshot = () => initial;

export function isUnlocked(): boolean {
  return mk !== null;
}

/** The Master Key — throws when locked. Callers must not keep it around. */
export function getMk(): Uint8Array {
  if (!mk) throw new Error("Stockage verrouillé : déverrouille-le pour continuer.");
  return mk;
}

function requireUser(): string {
  if (!snapshot.userId) throw new Error("Non connecté.");
  return snapshot.userId;
}

async function api(path: string, init?: RequestInit) {
  const res = await authFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erreur serveur.");
  return data;
}

// ── Loading ──────────────────────────────────────────────────────────────────

const deviceKey = (u: string) => `device:${u}`;

async function fetchKeys() {
  const d = await api("/api/e2ee/keys");
  return { bundle: (d.keys as UserKeysBundle | null) ?? null, passkeys: d.passkeys as KeyringSnapshot["passkeys"] };
}

/** Load the account's key material and try a silent unlock on a trusted device. */
export async function initKeyring(userId: string): Promise<void> {
  if (snapshot.userId === userId && snapshot.status !== "idle" && snapshot.status !== "error") return;
  if (snapshot.userId && snapshot.userId !== userId) lock();
  set({ status: "loading", userId, error: null });
  try {
    const { bundle, passkeys } = await fetchKeys();
    if (!bundle) return set({ status: "needs-setup", bundle: null, passkeys, setupInProgress: true });

    const dev = await idbGet<{ kek: CryptoKey; wrapped: string }>(deviceKey(userId)).catch(() => undefined);
    set({ bundle, passkeys, trusted: Boolean(dev) });
    if (dev) {
      try {
        mk = await unwrapForDevice(dev.kek, userId, dev.wrapped);
        return set({ status: "unlocked" });
      } catch {
        // Stale / mismatching blob (e.g. after a key reset): forget it, fall back to a manual unlock.
        await idbDel(deviceKey(userId)).catch(() => {});
        set({ trusted: false });
      }
    }
    set({ status: "locked" });
  } catch (err) {
    set({ status: "error", error: (err as Error).message });
  }
}

/** The user left the last onboarding screen. */
export function finishSetup(): void {
  set({ setupInProgress: false });
}

export function lock(): void {
  mk = null;
  snapshot = { ...initial, userId: snapshot.userId };
  for (const l of listeners) l();
  // Decrypted names live in the SWR cache: drop them with the key.
  void mutate(() => true, undefined, { revalidate: false });
}

/** Forget everything about the account (sign-out). */
export function reset(): void {
  mk = null;
  snapshot = initial;
  for (const l of listeners) l();
  void mutate(() => true, undefined, { revalidate: false });
}

function unlockedWith(key: Uint8Array) {
  mk = key;
  set({ status: "unlocked", error: null });
}

// ── Setup ────────────────────────────────────────────────────────────────────

export type PreparedKeys = Awaited<ReturnType<typeof prepareAccountKeys>>;

/**
 * First-time setup, step 1: create MK + recovery key (+ optional passphrase) IN MEMORY ONLY.
 * Nothing is sent yet: the account is only committed once the user has proven they saved the
 * recovery key — otherwise closing the tab would leave keys nobody can ever open.
 */
export async function prepareAccountKeys(opts: { phrase?: string } = {}) {
  const userId = requireUser();
  const created = await createUserKeys(userId);
  let bundle = created.bundle;
  if (opts.phrase) bundle = { ...bundle, ...(await addPhrase(userId, created.mk, opts.phrase)) };
  return { mk: created.mk, bundle, recovery: created.recovery };
}

/** Step 2: store the wrapped blobs and unlock. */
export async function commitAccountKeys(prepared: PreparedKeys): Promise<void> {
  const res = await api("/api/e2ee/keys", { method: "POST", body: JSON.stringify(prepared.bundle) });
  set({ bundle: res.keys });
  unlockedWith(prepared.mk);
}

// ── Unlock methods ───────────────────────────────────────────────────────────

export async function unlockRecovery(input: string): Promise<void> {
  unlockedWith(await unlockWithRecovery(requireUser(), needBundle(), input));
}

export async function unlockPhrase(phrase: string): Promise<void> {
  unlockedWith(await unlockWithPhrase(requireUser(), needBundle(), phrase));
}

/** Touch a passkey: its PRF output unwraps MK. Returns false if the authenticator lacks PRF. */
export async function unlockPasskey(): Promise<boolean> {
  const b = needBundle();
  const ids = Object.keys(b.mkWrappedPasskey);
  if (ids.length === 0) throw new Error("Aucune passkey n'est configurée pour le chiffrement.");
  const r = await getPrfOutput(ids);
  if (!r) return false;
  unlockedWith(await unlockWithPasskey(requireUser(), b, r.credentialId, r.output));
  return true;
}

/** MK obtained from another device (see transfer.ts). */
export function unlockWithTransferredKey(key: Uint8Array) {
  unlockedWith(key);
}

function needBundle(): UserKeysBundle {
  if (!snapshot.bundle) throw new Error("Chiffrement non configuré.");
  return snapshot.bundle;
}

// ── Trusted device ───────────────────────────────────────────────────────────

export async function trustThisDevice(): Promise<void> {
  const userId = requireUser();
  const kek = await createDeviceKek();
  await idbSet(deviceKey(userId), { kek, wrapped: await wrapForDevice(kek, userId, getMk()) });
  set({ trusted: true });
}

export async function forgetThisDevice(): Promise<void> {
  await idbDel(deviceKey(requireUser()));
  set({ trusted: false });
}

// ── Managing unlock methods (needs to be unlocked) ───────────────────────────

async function patch(body: unknown) {
  const res = await api("/api/e2ee/keys", { method: "PATCH", body: JSON.stringify(body) });
  set({ bundle: res.keys });
}

export async function setPassphrase(phrase: string) {
  await patch({ phrase: await addPhrase(requireUser(), getMk(), phrase) });
}

export async function removePassphrase() {
  await patch({ phrase: null });
}

/** Enrol a passkey for unlocking: touches it once to read its PRF output. */
export async function enrollPasskey(credentialId: string): Promise<boolean> {
  const r = await getPrfOutput([credentialId]);
  if (!r) return false;
  await patch({ setPasskey: { credentialId: r.credentialId, mkWrapped: await addPasskey(requireUser(), getMk(), r.output) } });
  return true;
}

export async function removePasskey(credentialId: string) {
  await patch({ removePasskey: credentialId });
}

/** New recovery key (the old one stops working). Returns it to be shown once. */
export async function regenerateRecoveryKey() {
  const r = await rotateRecovery(requireUser(), getMk());
  await patch({ mkWrappedRecovery: r.mkWrappedRecovery });
  return r.recovery;
}

export async function storeVaultKeyWrapped(blob: string | null) {
  await patch({ vaultKeyWrapped: blob });
}

export async function refreshPasskeys() {
  const { bundle, passkeys } = await fetchKeys();
  set({ bundle, passkeys });
}

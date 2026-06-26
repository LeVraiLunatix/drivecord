"use client";

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

export type PasskeyResult = { ok: boolean; error?: string };

function friendlyError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Opération annulée.";
  if (name === "InvalidStateError")
    return "Ce passkey est déjà enregistré sur cet appareil.";
  return "Le passkey n'a pas pu être utilisé.";
}

/** Register a new passkey for the current (fully-authenticated) account. */
export async function registerPasskey(name?: string): Promise<PasskeyResult> {
  const optRes = await fetch("/api/auth/passkey/register/options", {
    method: "POST",
  });
  if (!optRes.ok) {
    const d = await optRes.json().catch(() => ({}));
    return { ok: false, error: d.error ?? "Impossible de démarrer l'enregistrement." };
  }
  const options = await optRes.json();

  let attResp;
  try {
    attResp = await startRegistration(options);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }

  const verRes = await fetch("/api/auth/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: attResp, name }),
  });
  const data = await verRes.json().catch(() => ({}));
  return verRes.ok
    ? { ok: true }
    : { ok: false, error: data.error ?? "Enregistrement échoué." };
}

/** Sign in using a discoverable passkey (no email needed). */
export async function loginWithPasskey(): Promise<PasskeyResult> {
  const optRes = await fetch("/api/auth/passkey/login/options", {
    method: "POST",
  });
  if (!optRes.ok) {
    return { ok: false, error: "Impossible de démarrer la connexion." };
  }
  const options = await optRes.json();

  let asseResp;
  try {
    asseResp = await startAuthentication(options);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }

  const verRes = await fetch("/api/auth/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asseResp),
  });
  const data = await verRes.json().catch(() => ({}));
  return verRes.ok
    ? { ok: true }
    : { ok: false, error: data.error ?? "Connexion échouée." };
}

"use client";

import { takeNativeNonce } from "@/lib/auth/native-nonce";

type AuthWindow = Window & {
  __drivecordAuthCallback?: (url: string | null) => void;
  webkit?: { messageHandlers?: { nativeAuth?: { postMessage: (msg: unknown) => void } } };
};

/**
 * Start a sign-in from the iOS app (URL = /native-login?…&n=nonce).
 *
 * Current builds run it in the system sign-in sheet over the app
 * (ASWebAuthenticationSession, see AppDelegate.swift): the drivecord://auth
 * link ending the flow comes back to `__drivecordAuthCallback` below. Older
 * builds leave for Safari and come back through the drivecord:// deep link.
 * Must run in the tap itself (window.open fallback).
 */
export function openNativeSignIn(url: string): void {
  const handler = (window as AuthWindow).webkit?.messageHandlers?.nativeAuth;
  if (handler) {
    handler.postMessage({ url });
    return;
  }
  // Capacitor routes target "_system" to the external browser.
  window.open(url, "_system");
}

/**
 * Finish a sign-in from its drivecord://auth?code=… link (sheet callback or
 * deep link): exchange the code, with the nonce this app kept, for the
 * WebView's session. Ignores any other drivecord:// URL.
 */
export async function completeNativeSignIn(link: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return;
  }
  // drivecord://auth?code=XXX → host "auth"
  if (u.protocol !== "drivecord:" || u.host !== "auth") return;
  const code = u.searchParams.get("code");
  if (!code) return;
  // Without the nonce the server refuses the code (a link replayed by another app).
  const n = await takeNativeNonce(code);
  window.location.href = `/api/native-auth/exchange?${new URLSearchParams({ code, n: n ?? "" })}`;
}

/** Receive the sign-in sheet's result (null = closed by the user). */
export function listenNativeSignIn(): () => void {
  const w = window as AuthWindow;
  w.__drivecordAuthCallback = (url) => {
    if (url) void completeNativeSignIn(url);
  };
  return () => {
    delete w.__drivecordAuthCallback;
  };
}

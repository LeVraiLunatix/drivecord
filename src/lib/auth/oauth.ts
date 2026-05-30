"use client";

import { signIn } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

export type OAuthProvider = "google" | "discord";

/**
 * Start an OAuth sign-in.
 *  - Web: normal in-page NextAuth redirect.
 *  - Native app: open the flow in the SYSTEM browser (where passkeys/Google
 *    work), which deep-links back into the app via /native-handoff →
 *    drivecord://auth?code=… → session exchange.
 */
export function oauthSignIn(provider: OAuthProvider, callbackUrl = "/drive") {
  if (isNativeApp()) {
    const url = `https://drivecord.vercel.app/native-login?provider=${provider}`;
    // Capacitor routes target "_system" to the external browser.
    window.open(url, "_system");
  } else {
    signIn(provider, { callbackUrl });
  }
}

"use client";

import { signIn, signOut } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

export type OAuthProvider = "google" | "discord";

/**
 * Start an OAuth sign-in.
 *  - Web: clear any current session FIRST, then run the normal NextAuth
 *    redirect. Without the sign-out, logging in with a different OAuth account
 *    while already authenticated kept the old account (NextAuth links to the
 *    current session instead of switching).
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
    // Sign out the current session, then start OAuth — guarantees a clean
    // switch to whatever account the user picks.
    signOut({ redirect: false })
      .catch(() => {})
      .finally(() => signIn(provider, { callbackUrl }));
  }
}

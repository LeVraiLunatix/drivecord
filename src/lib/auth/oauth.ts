"use client";

import { signIn, signOut } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

export type OAuthProvider = "google" | "discord" | "cord";

const LAST_PROVIDER_KEY = "drivecord:oauth-provider";

/**
 * Auth.js' `?error=` doesn't say which provider failed; remember the one we
 * just started so /login can explain Cord-specific errors.
 */
export function rememberOAuthProvider(provider: string): void {
  try {
    sessionStorage.setItem(LAST_PROVIDER_KEY, provider);
  } catch {
    /* private mode: the generic message is shown instead */
  }
}

export function lastOAuthProvider(): string | null {
  try {
    return sessionStorage.getItem(LAST_PROVIDER_KEY);
  } catch {
    return null;
  }
}

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
    // Domaine courant du WebView (drivecord.app sur les builds récents) : le
    // navigateur système reste sur le même domaine que l'app → cookies et
    // redirect URIs OAuth cohérents.
    const url = `${window.location.origin}/native-login?provider=${provider}`;
    // Capacitor routes target "_system" to the external browser.
    window.open(url, "_system");
  } else {
    rememberOAuthProvider(provider);
    // Sign out the current session, then start OAuth — guarantees a clean
    // switch to whatever account the user picks.
    signOut({ redirect: false })
      .catch(() => {})
      .finally(() => signIn(provider, { callbackUrl }));
  }
}

/**
 * Lier un compte Patreon à la session COURANTE (déblocage des paliers).
 * Contrairement à `oauthSignIn`, on ne se déconnecte PAS avant : on veut
 * rattacher Patreon à l'utilisateur déjà connecté, pas changer de compte.
 * Au retour, l'événement `linkAccount` (auth.ts) synchronise le palier.
 */
export function linkPatreon(callbackUrl = "/settings") {
  if (isNativeApp()) {
    // Dans l'app native, on ouvre les réglages dans le navigateur système où
    // la session web est active, pour y faire le linking.
    window.open(`${window.location.origin}${callbackUrl}`, "_system");
    return;
  }
  signIn("patreon", { callbackUrl });
}

/**
 * Lier un compte Discord à la session COURANTE (ex : pour la configuration
 * automatique de drive). Même logique que `linkPatreon` : pas de déconnexion
 * préalable, on veut rattacher Discord au compte déjà connecté.
 */
export function linkDiscord(callbackUrl = "/setup") {
  if (isNativeApp()) {
    window.open(`${window.location.origin}${callbackUrl}`, "_system");
    return;
  }
  signIn("discord", { callbackUrl });
}

"use client";

import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Déconnexion.
 *
 * - App desktop (Tauri) : on vide le token du trousseau puis on renvoie la
 *   fenêtre sur l'écran d'accueil (navigation JS — plus fiable qu'un navigate
 *   déclenché depuis Rust).
 * - Web : on délègue à `/logout`, qui vide la session + les données locales et
 *   affiche un écran de confirmation. `replace` pour sortir la page protégée de
 *   la pile d'historique (cf. BfcacheAuthGuard).
 */
export async function fullSignOut(): Promise<void> {
  if (isDesktopApp()) {
    await tauriInvoke("clear_token").catch(() => {});
    window.location.href = "https://drivecord.app/desktop-welcome";
    return;
  }
  window.location.replace("/logout");
}

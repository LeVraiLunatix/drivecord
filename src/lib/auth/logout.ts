"use client";

import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Déconnexion.
 *
 * - App desktop (Tauri) : la commande `logout` vide le token du trousseau et
 *   renvoie la fenêtre sur l'écran d'accueil.
 * - Web : on délègue à `/logout`, qui vide la session + les données locales et
 *   affiche un écran de confirmation. `replace` pour sortir la page protégée de
 *   la pile d'historique (sinon le bouton Retour la restaurerait depuis le
 *   bfcache dans un état « connecté » périmé — cf. BfcacheAuthGuard).
 */
export async function fullSignOut(): Promise<void> {
  if (isDesktopApp()) {
    await tauriInvoke("logout").catch(() => {});
    return;
  }
  window.location.replace("/logout");
}

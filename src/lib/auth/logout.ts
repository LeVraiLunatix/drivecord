"use client";

/**
 * Déconnexion : on délègue à la page dédiée `/logout`, qui réalise réellement la
 * déconnexion (vide la session + les données locales) et affiche un écran de
 * confirmation.
 *
 * On utilise `replace` (et non `href`) pour que la page protégée que l'on quitte
 * (/drive, …) sorte de la pile d'historique — sinon le bouton Retour la
 * restaurerait depuis le bfcache dans un état « connecté » périmé. Le
 * BfcacheAuthGuard (layout) couvre les autres pages restaurées du cache.
 */
export async function fullSignOut(): Promise<void> {
  window.location.replace("/logout");
}

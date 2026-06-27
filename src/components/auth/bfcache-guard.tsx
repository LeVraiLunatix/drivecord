"use client";

import * as React from "react";
import { getSession } from "next-auth/react";

/**
 * Garde-fou contre le « back-forward cache » (bfcache).
 *
 * Quand l'utilisateur se déconnecte puis appuie sur Retour, le navigateur peut
 * restaurer une page protégée (/drive, …) depuis son instantané mémoire — qui
 * affiche encore un état « connecté » périmé, sans refaire de requête réseau.
 *
 * Au `pageshow` avec `persisted === true` (= page restaurée depuis le bfcache),
 * on revalide la session côté serveur. Si elle a disparu, on recharge la page :
 * le proxy (source unique de vérité) renvoie alors les pages protégées vers
 * /login et laisse les pages publiques s'afficher. Tant que l'utilisateur est
 * connecté, rien ne se passe (la navigation Retour normale n'est pas perturbée).
 */
export function BfcacheAuthGuard() {
  React.useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      void getSession()
        .then((session) => {
          // Restaurée depuis le cache alors que la session a disparu → reload,
          // pour que le proxy réévalue l'accès (protégée → /login).
          if (!session) window.location.reload();
        })
        .catch(() => {});
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}

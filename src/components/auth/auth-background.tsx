"use client";

import { Glow } from "@/kitcord";

/**
 * Fond des écrans d'authentification (connexion, inscription, 2FA…) : la lumière
 * du bas de KitCord, en version calme (sans étincelles ni halo du curseur) pour
 * ne pas gêner les formulaires. Le thème clair garde une lueur douce et fixe.
 * Le conteneur à `-z-10` garde la lumière (fixe) derrière le contenu.
 */
export function AuthBackground() {
  return (
    <div className="auth-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      <div className="hidden dark:block">
        <Glow calm sparks={false} cursor={false} />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-[55%] dark:hidden"
        style={{ background: "radial-gradient(70% 80% at 50% 110%, color-mix(in srgb, var(--cord-light-mid) 22%, transparent), transparent 75%)" }}
      />
    </div>
  );
}

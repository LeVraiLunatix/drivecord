"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Bonus Patreon : les fonds animés (par-dessus le fond choisi dans Réglages › Apparence), leur
 * intensité et vitesse, le dégradé à deux couleurs et le halo du curseur. La couleur d'accent, le
 * fond, l'arrondi et la densité sont gratuits (voir appearance.ts).
 *
 * Les réglages sont stockés localement par appareil ; `effectiveStudio` les borne au palier courant,
 * donc un palier perdu ou un localStorage modifié à la main n'ouvre rien : au pire, le fond reste
 * l'uni de tout le monde.
 */

export type BackdropStyle = "particles" | "constellation" | "grid" | "ribbons" | "stars";

export const BACKDROPS: { value: BackdropStyle; label: string; hint: string; minTier: 1 | 2 | 3 }[] = [
  { value: "particles", label: "Poussière", hint: "Particules lumineuses", minTier: 1 },
  { value: "constellation", label: "Constellation", hint: "Points reliés, réagit au curseur", minTier: 2 },
  { value: "grid", label: "Grille néon", hint: "Horizon synthwave en perspective", minTier: 2 },
  { value: "ribbons", label: "Rubans", hint: "Aurore ondulante", minTier: 3 },
  { value: "stars", label: "Étoiles filantes", hint: "Ciel étoilé animé", minTier: 3 },
];

export type Studio = {
  /** Fond animé choisi ; null = aucun (le fond fixe de tout le monde). */
  backdrop: BackdropStyle | null;
  /** Intensité du fond animé 0.3-1.6 (Premium+). */
  intensity: number;
  /** Vitesse de l'animation 0.4-2 (Premium+). */
  speed: number;
  /** Seconde teinte pour les dégradés (VIP). null = dégradé automatique. */
  hue2: number | null;
  /** Halo qui suit le curseur (VIP). */
  cursorGlow: boolean;
};

export const DEFAULT_STUDIO: Studio = {
  backdrop: null,
  intensity: 1,
  speed: 1,
  hue2: null,
  cursorGlow: false,
};

export const useStudio = create<{ studio: Studio; set: (p: Partial<Studio>) => void; reset: () => void }>()(
  persist(
    (set) => ({
      studio: DEFAULT_STUDIO,
      set: (p) => set((s) => ({ studio: { ...s.studio, ...p } })),
      reset: () => set({ studio: DEFAULT_STUDIO }),
    }),
    {
      name: "drivecord-theme-studio",
      version: 2,
      // v1 : accent, arrondi, « enabled »… ont déménagé dans appearance.ts. On ne garde que ce qui reste.
      migrate: (old) => {
        const s = ((old as { studio?: Partial<Studio> } | undefined)?.studio ?? {}) as Partial<Studio>;
        return {
          studio: {
            backdrop: BACKDROPS.some((b) => b.value === s.backdrop) ? (s.backdrop as BackdropStyle) : null,
            intensity: s.intensity ?? 1,
            speed: s.speed ?? 1,
            hue2: s.hue2 ?? null,
            cursorGlow: !!s.cursorGlow,
          },
        };
      },
    },
  ),
);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

/** Réglages réellement applicables avec ce palier (0 = gratuit : aucun fond animé). */
export function effectiveStudio(s: Studio, tier: number): Studio & { backdropStyle: BackdropStyle | null } {
  const allowed = s.backdrop && BACKDROPS.find((b) => b.value === s.backdrop && b.minTier <= tier);
  return {
    backdrop: s.backdrop,
    backdropStyle: allowed ? allowed.value : null,
    intensity: tier >= 2 ? clamp(s.intensity, 0.3, 1.6) : 1,
    speed: tier >= 2 ? clamp(s.speed, 0.4, 2) : 1,
    hue2: tier >= 3 && s.hue2 != null ? clamp(s.hue2, 0, 360) : null,
    cursorGlow: tier >= 3 && s.cursorGlow,
  };
}

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Studio de thème (Patreon). Les réglages sont stockés localement par appareil ;
 * `effectiveStudio` les borne au palier courant, donc un palier perdu ou un
 * localStorage modifié à la main n'ouvre rien : au pire le rendu retombe sur le
 * style gratuit.
 */

export type BackdropStyle = "blobs" | "particles" | "constellation" | "grid" | "ribbons" | "stars";

export const BACKDROPS: { value: BackdropStyle; label: string; hint: string; minTier: 0 | 1 | 2 | 3 }[] = [
  { value: "blobs", label: "Nappes", hint: "Couleurs qui dérivent", minTier: 0 },
  { value: "particles", label: "Poussière", hint: "Particules lumineuses", minTier: 1 },
  { value: "constellation", label: "Constellation", hint: "Points reliés, réagit au curseur", minTier: 2 },
  { value: "grid", label: "Grille néon", hint: "Horizon synthwave en perspective", minTier: 2 },
  { value: "ribbons", label: "Rubans", hint: "Aurore ondulante + poussière", minTier: 3 },
  { value: "stars", label: "Étoiles filantes", hint: "Ciel étoilé animé", minTier: 3 },
];

export type Studio = {
  enabled: boolean;
  /** Teinte d'accent 0-360 (Gold+). */
  hue: number;
  /** Éclat de l'accent 0.06-0.22 (Gold+). */
  chroma: number;
  /** Seconde teinte pour les dégradés (VIP). null = dégradé automatique. */
  hue2: number | null;
  backdrop: BackdropStyle | null;
  /** Intensité du fond 0.3-1.6 (Premium+). */
  intensity: number;
  /** Vitesse de l'animation 0.4-2 (Premium+). */
  speed: number;
  /** Arrondi des angles en rem 0.25-1.1 (Premium+). */
  radius: number;
  /** Halo qui suit le curseur (VIP). */
  cursorGlow: boolean;
};

export const DEFAULT_STUDIO: Studio = {
  enabled: false,
  hue: 285,
  chroma: 0.16,
  hue2: null,
  backdrop: null,
  intensity: 1,
  speed: 1,
  radius: 0.625,
  cursorGlow: false,
};

export const ACCENT_PRESETS: { name: string; hue: number }[] = [
  { name: "Violet", hue: 285 },
  { name: "Indigo", hue: 265 },
  { name: "Océan", hue: 225 },
  { name: "Glace", hue: 200 },
  { name: "Menthe", hue: 165 },
  { name: "Citron", hue: 120 },
  { name: "Or", hue: 85 },
  { name: "Mandarine", hue: 55 },
  { name: "Corail", hue: 25 },
  { name: "Rose", hue: 350 },
  { name: "Magenta", hue: 320 },
];

export const useStudio = create<{ studio: Studio; set: (p: Partial<Studio>) => void; reset: () => void }>()(
  persist(
    (set) => ({
      studio: DEFAULT_STUDIO,
      set: (p) => set((s) => ({ studio: { ...s.studio, ...p } })),
      reset: () => set({ studio: DEFAULT_STUDIO }),
    }),
    { name: "drivecord-theme-studio", version: 1 },
  ),
);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

/** Réglages réellement applicables avec ce palier (0 = gratuit, rien d'appliqué). */
export function effectiveStudio(s: Studio, tier: number): Studio & { backdropStyle: BackdropStyle } {
  const base = tier >= 1 && s.enabled ? s : DEFAULT_STUDIO;
  const defaultBackdrop: BackdropStyle = tier >= 3 ? "ribbons" : tier >= 2 ? "constellation" : tier >= 1 ? "particles" : "blobs";
  const wanted = tier >= 1 && s.enabled ? s.backdrop : null;
  const allowed = wanted && BACKDROPS.find((b) => b.value === wanted && b.minTier <= tier);
  return {
    enabled: tier >= 1 && s.enabled,
    hue: clamp(base.hue, 0, 360),
    chroma: clamp(base.chroma, 0.06, 0.22),
    hue2: tier >= 3 && base.hue2 != null ? clamp(base.hue2, 0, 360) : null,
    backdrop: base.backdrop,
    backdropStyle: allowed ? allowed.value : defaultBackdrop,
    intensity: tier >= 2 ? clamp(base.intensity, 0.3, 1.6) : 1,
    speed: tier >= 2 ? clamp(base.speed, 0.4, 2) : 1,
    radius: tier >= 2 ? clamp(base.radius, 0.25, 1.1) : DEFAULT_STUDIO.radius,
    cursorGlow: tier >= 3 && base.cursorGlow,
  };
}

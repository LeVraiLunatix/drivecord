"use client";

import * as React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Personnalisation du drive, gratuite pour tout le monde. Tout est enregistré sur l'appareil
 * (localStorage) : rien ne part sur un serveur. Par défaut, tout le monde a le même fond :
 * un noir uni, sans animation. Les styles animés restent un bonus Patreon (theme-studio.ts).
 */

export type BgKind = "solid" | "gradient" | "image";
export type RadiusStyle = "round" | "soft" | "square";
export type Density = "compact" | "normal" | "airy";
export type ThumbSize = "s" | "m" | "l";
export type StartPage = "files" | "home";

export type Appearance = {
  bgKind: BgKind;
  /** Couleur du fond uni (hex). */
  bgColor: string;
  /** Identifiant d'un dégradé de GRADIENTS. */
  gradient: string;
  /** Voile noir sur l'image, 0 à 0.85. */
  dim: number;
  /** Flou de l'image en px, 0 à 24. */
  blur: number;
  /** Teinte d'accent 0-360 ; null = le violet KitCord d'origine. */
  hue: number | null;
  radius: RadiusStyle;
  density: Density;
  thumbs: ThumbSize;
  /** Panneaux en verre dépoli (sinon, panneaux pleins : plus sobre, plus lisible). */
  glass: boolean;
  startPage: StartPage;
};

export const DEFAULT_BG = "#060509";

export const DEFAULT_APPEARANCE: Appearance = {
  bgKind: "solid",
  bgColor: DEFAULT_BG,
  gradient: "minuit",
  dim: 0.45,
  blur: 0,
  hue: null,
  radius: "round",
  density: "normal",
  thumbs: "m",
  glass: true,
  startPage: "files",
};

/** Fonds unis proposés (le premier est celui de tout le monde au départ). */
export const SOLID_COLORS: { name: string; value: string }[] = [
  { name: "Noir", value: DEFAULT_BG },
  { name: "Graphite", value: "#101114" },
  { name: "Ardoise", value: "#0d1218" },
  { name: "Nuit", value: "#0a0d1f" },
  { name: "Pin", value: "#08130f" },
  { name: "Prune", value: "#14091a" },
  { name: "Bordeaux", value: "#1a0a0e" },
  { name: "Café", value: "#15100b" },
];

/** Dégradés fixes : jamais animés, toujours très sombres pour garder les textes lisibles. */
export const GRADIENTS: { id: string; name: string; css: string }[] = [
  { id: "minuit", name: "Minuit", css: "radial-gradient(120% 90% at 50% 0%, #1b1740 0%, #0a0916 55%, #060509 100%)" },
  { id: "aurore", name: "Aurore", css: "radial-gradient(110% 80% at 20% 0%, #2a1458 0%, transparent 60%), radial-gradient(90% 70% at 90% 100%, #4a1530 0%, transparent 60%), #08060d" },
  { id: "ocean", name: "Océan", css: "radial-gradient(120% 90% at 50% 0%, #0b2a45 0%, #07121f 60%, #050a12 100%)" },
  { id: "foret", name: "Forêt", css: "radial-gradient(120% 90% at 50% 0%, #0f3326 0%, #07140f 60%, #050c09 100%)" },
  { id: "braise", name: "Braise", css: "radial-gradient(120% 90% at 50% 100%, #4a1d0c 0%, #150a06 60%, #0a0604 100%)" },
  { id: "graphite", name: "Graphite", css: "linear-gradient(180deg, #1a1b20 0%, #0c0c0f 100%)" },
];

export const ACCENTS: { name: string; hue: number | null }[] = [
  { name: "Violet", hue: null },
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

export const RADII: Record<RadiusStyle, { label: string; pill: string; card: string; panel: string; base: string }> = {
  round: { label: "Arrondi", pill: "999px", card: "16px", panel: "22px", base: "0.625rem" },
  soft: { label: "Doux", pill: "16px", card: "12px", panel: "18px", base: "0.5rem" },
  square: { label: "Net", pill: "8px", card: "6px", panel: "10px", base: "0.25rem" },
};

const clamp = (v: unknown, a: number, b: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : fallback;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Une valeur lue du stockage n'est jamais crue : on la ramène à quelque chose de valide. */
export function sanitize(a: Partial<Appearance> | undefined): Appearance {
  const d = DEFAULT_APPEARANCE;
  const x = a ?? {};
  return {
    bgKind: pick(x.bgKind, ["solid", "gradient", "image"], d.bgKind),
    bgColor: typeof x.bgColor === "string" && /^#[0-9a-f]{6}$/i.test(x.bgColor) ? x.bgColor : d.bgColor,
    gradient: GRADIENTS.some((g) => g.id === x.gradient) ? (x.gradient as string) : d.gradient,
    dim: clamp(x.dim, 0, 0.85, d.dim),
    blur: clamp(x.blur, 0, 24, d.blur),
    hue: x.hue == null ? null : clamp(x.hue, 0, 360, 285),
    radius: pick(x.radius, ["round", "soft", "square"], d.radius),
    density: pick(x.density, ["compact", "normal", "airy"], d.density),
    thumbs: pick(x.thumbs, ["s", "m", "l"], d.thumbs),
    glass: typeof x.glass === "boolean" ? x.glass : d.glass,
    startPage: pick(x.startPage, ["files", "home"], d.startPage),
  };
}

export const useAppearance = create<{
  appearance: Appearance;
  set: (p: Partial<Appearance>) => void;
  reset: () => void;
}>()(
  persist(
    (set) => ({
      appearance: DEFAULT_APPEARANCE,
      set: (p) => set((s) => ({ appearance: sanitize({ ...s.appearance, ...p }) })),
      reset: () => set({ appearance: DEFAULT_APPEARANCE }),
    }),
    {
      name: "drivecord-appearance",
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        appearance: sanitize((persisted as { appearance?: Partial<Appearance> } | undefined)?.appearance),
      }),
    },
  ),
);

// ── Image de fond ───────────────────────────────────────────────────────────────

const IMAGE_KEY = "drivecord-bg-image";
const MAX_SIDE = 1920;

function readImage(): string | null {
  try {
    const v = localStorage.getItem(IMAGE_KEY);
    return v && v.startsWith("data:image/") ? v : null;
  } catch {
    return null;
  }
}

/** L'image est gardée à part (elle pèse plus que les réglages) et réduite avant d'être stockée. */
export const useBgImage = create<{
  url: string | null;
  loaded: boolean;
  load: () => void;
  setFile: (file: File) => Promise<void>;
  clear: () => void;
}>()((set, get) => ({
  url: null,
  loaded: false,
  load: () => {
    if (get().loaded) return;
    set({ url: readImage(), loaded: true });
  },
  setFile: async (file) => {
    if (!file.type.startsWith("image/")) throw new Error("Choisis une image (JPG, PNG, WebP…).");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Impossible de lire cette image.");
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", 0.8);
    try {
      localStorage.setItem(IMAGE_KEY, url);
    } catch {
      throw new Error("Image trop lourde pour être gardée sur cet appareil. Essaie-en une plus petite.");
    }
    set({ url, loaded: true });
  },
  clear: () => {
    try {
      localStorage.removeItem(IMAGE_KEY);
    } catch {
      /* rien */
    }
    set({ url: null, loaded: true });
  },
}));

/** Le CSS du fond choisi (sans le voile ni le flou de l'image). */
export function backgroundCss(a: Appearance): string {
  if (a.bgKind === "gradient") return GRADIENTS.find((g) => g.id === a.gradient)?.css ?? DEFAULT_BG;
  return a.bgColor;
}

/** Hook pratique : les réglages, sans décalage d'hydratation (valeurs par défaut avant le montage). */
export function useAppearanceValue(): Appearance {
  const a = useAppearance((s) => s.appearance);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted ? a : DEFAULT_APPEARANCE;
}

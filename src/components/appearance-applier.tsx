"use client";

import * as React from "react";
import { RADII, useAppearance } from "@/lib/appearance";

/** Variables posées sur <html> (toutes retirées quand le réglage revient à l'origine). */
const VARS = [
  "--primary", "--primary-foreground", "--ring", "--accent", "--accent-foreground",
  "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-accent", "--sidebar-ring", "--chart-1",
  "--cord-light-core", "--cord-light-mid", "--cord-light-warm",
  "--radius", "--cord-radius-pill", "--cord-radius-card", "--cord-radius-panel",
];

/**
 * Applique la personnalisation de l'utilisateur à toute l'interface : couleur d'accent, arrondi,
 * densité, taille des vignettes, verre ou panneaux pleins. Le fond est dessiné par DriveBackdrop.
 */
export function AppearanceApplier() {
  const a = useAppearance((s) => s.appearance);

  React.useEffect(() => {
    const root = document.documentElement;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    VARS.forEach((v) => root.style.removeProperty(v));

    if (a.hue != null) {
      const h = a.hue;
      set("--cord-light-core", `oklch(0.95 0.035 ${h})`);
      set("--cord-light-mid", `oklch(0.68 0.17 ${h})`);
      set("--cord-light-warm", `oklch(0.82 0.11 ${(h + 55) % 360})`);
      set("--primary", `oklch(0.74 0.16 ${h})`);
      set("--primary-foreground", `oklch(0.17 0.04 ${h})`);
      set("--ring", `oklch(0.66 0.16 ${h})`);
      set("--accent", `oklch(0.3 0.07 ${h})`);
      set("--accent-foreground", "oklch(0.985 0 0)");
      set("--sidebar-primary", `oklch(0.62 0.16 ${h})`);
      set("--sidebar-primary-foreground", "oklch(0.985 0 0)");
      set("--sidebar-accent", `oklch(0.3 0.07 ${h})`);
      set("--sidebar-ring", `oklch(0.66 0.16 ${h})`);
      set("--chart-1", `oklch(0.72 0.16 ${h})`);
    }

    if (a.radius !== "round") {
      const r = RADII[a.radius];
      set("--cord-radius-pill", r.pill);
      set("--cord-radius-card", r.card);
      set("--cord-radius-panel", r.panel);
      set("--radius", r.base);
    }

    root.dataset.density = a.density;
    root.dataset.thumbs = a.thumbs;
    root.dataset.glass = a.glass ? "on" : "off";

    return () => {
      VARS.forEach((v) => root.style.removeProperty(v));
      delete root.dataset.density;
      delete root.dataset.thumbs;
      delete root.dataset.glass;
    };
  }, [a]);

  return null;
}

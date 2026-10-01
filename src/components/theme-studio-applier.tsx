"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { useTier } from "@/components/patreon/tier";
import { effectiveStudio, useStudio } from "@/lib/theme-studio";

/** Variables posées sur <html> par le studio (toutes retirées quand il est inactif). */
const VARS = [
  "--primary", "--primary-foreground", "--ring", "--accent", "--accent-foreground",
  "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-accent", "--sidebar-ring",
  "--chart-1", "--radius", "--studio-hue", "--studio-hue2", "--studio-speed",
];

/**
 * Applique le studio de thème Patreon : accent de couleur sur TOUTE l'interface
 * (boutons, focus, sélections, barres), arrondi des angles et halo de curseur.
 * N'agit que connecté avec un palier ≥ Gold ; sinon tout est retiré.
 */
export function ThemeStudioApplier() {
  const { status } = useSession();
  const { tier } = useTier();
  const { resolvedTheme } = useTheme();
  const raw = useStudio((s) => s.studio);
  const eff = React.useMemo(
    () => effectiveStudio(raw, status === "authenticated" ? tier : 0),
    [raw, tier, status],
  );

  React.useEffect(() => {
    const root = document.documentElement;
    const clear = () => VARS.forEach((v) => root.style.removeProperty(v));
    if (!eff.enabled) {
      clear();
      return;
    }
    const light = resolvedTheme === "light";
    const { hue, chroma: c } = eff;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set("--primary", light ? `oklch(0.55 ${c} ${hue})` : `oklch(0.74 ${c} ${hue})`);
    set("--primary-foreground", light ? "oklch(0.985 0.01 " + hue + ")" : `oklch(0.17 0.04 ${hue})`);
    set("--ring", `oklch(0.66 ${c} ${hue})`);
    set("--accent", light ? `oklch(0.94 0.04 ${hue})` : `oklch(0.3 ${c * 0.45} ${hue})`);
    set("--accent-foreground", light ? `oklch(0.25 0.06 ${hue})` : "oklch(0.985 0 0)");
    set("--sidebar-primary", `oklch(0.62 ${c} ${hue})`);
    set("--sidebar-primary-foreground", "oklch(0.985 0 0)");
    set("--sidebar-accent", light ? `oklch(0.94 0.04 ${hue})` : `oklch(0.3 ${c * 0.45} ${hue})`);
    set("--sidebar-ring", `oklch(0.66 ${c} ${hue})`);
    set("--chart-1", `oklch(0.72 ${c} ${hue})`);
    set("--radius", `${eff.radius}rem`);
    set("--studio-hue", String(hue));
    set("--studio-hue2", String(eff.hue2 ?? (hue + 55) % 360));
    set("--studio-speed", String(eff.speed));
    return clear;
  }, [eff, resolvedTheme]);

  return <>{eff.cursorGlow && <CursorGlow hue={eff.hue2 ?? eff.hue} />}</>;
}

/** VIP : halo doux qui suit le curseur (en dessous des clics, sans bloquer). */
function CursorGlow({ hue }: { hue: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const tick = () => {
      cx += (x - cx) * 0.14;
      cy += (y - cy) * 0.14;
      if (ref.current) ref.current.style.transform = `translate3d(${cx - 160}px, ${cy - 160}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[1] size-80 rounded-full"
      style={{
        background: `radial-gradient(circle, oklch(0.75 0.17 ${hue} / 0.22), transparent 65%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}

"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { useTier } from "@/components/patreon/tier";
import { effectiveStudio, useStudio, type BackdropStyle } from "@/lib/theme-studio";

/**
 * Fond animé du drive.
 *  - Gratuit : trois nappes de couleur qui dérivent lentement (CSS pur, léger).
 *  - Patreon : le style est choisi dans le studio de thème (Réglages › Apparence) :
 *    poussière (Gold), constellation / grille néon (Premium), rubans / étoiles
 *    filantes (VIP), avec couleur, intensité et vitesse réglables (Premium+).
 * Palette : thème Aurora / Or nocturne, ou la teinte choisie dans le studio.
 */

type Palette = { blobs: [string, string, string]; dots: string[]; line: string };

const hsl = (h: number, s: number, l: number, a = 1) => `hsl(${Math.round(h) % 360} ${s}% ${l}% / ${a})`;

function paletteFromHue(h1: number, h2: number, k: number): Palette {
  return {
    blobs: [hsl(h1, 85, 60, 0.2 * k), hsl(h2, 85, 60, 0.15 * k), hsl(h1 + 150, 80, 60, 0.1 * k)],
    dots: [hsl(h1, 90, 78), hsl(h2, 90, 75), hsl(h1 + 40, 90, 80)],
    line: hsl(h1, 85, 70),
  };
}

function paletteFor(theme: string | undefined, studio: { enabled: boolean; hue: number; hue2: number | null; intensity: number }): Palette {
  if (studio.enabled) return paletteFromHue(studio.hue, studio.hue2 ?? studio.hue + 55, studio.intensity);
  if (theme === "or-nocturne")
    return {
      blobs: ["rgba(234,179,8,0.20)", "rgba(217,119,6,0.16)", "rgba(250,204,21,0.12)"],
      dots: ["#fde68a", "#fbbf24", "#f59e0b"],
      line: "rgb(251,191,36)",
    };
  if (theme === "aurora")
    return {
      blobs: ["rgba(99,102,241,0.24)", "rgba(56,189,248,0.16)", "rgba(168,85,247,0.2)"],
      dots: ["#a5b4fc", "#7dd3fc", "#c4b5fd"],
      line: "rgb(129,140,248)",
    };
  return {
    blobs: ["rgba(99,102,241,0.17)", "rgba(217,70,239,0.13)", "rgba(34,211,238,0.10)"],
    dots: ["#a5b4fc", "#f0abfc", "#67e8f9"],
    line: "rgb(168,85,247)",
  };
}

export function DriveBackdrop({ forceTier, previewStyle }: { forceTier?: number; previewStyle?: BackdropStyle } = {}) {
  const { resolvedTheme } = useTheme();
  const { status } = useSession();
  const { tier: realTier } = useTier();
  const raw = useStudio((s) => s.studio);
  const tier = forceTier ?? (status === "authenticated" ? realTier : 0);
  const eff = React.useMemo(() => effectiveStudio(raw, tier), [raw, tier]);
  const style = previewStyle ?? eff.backdropStyle;
  const pal = React.useMemo(
    () => paletteFor(resolvedTheme, eff),
    [resolvedTheme, eff],
  );
  const dur = (s: number) => `${s / eff.speed}s`;
  const k = eff.intensity;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="dc-blob left-[-10vw] top-[-12vh] size-[48vw] min-h-72 min-w-72"
        style={{ background: pal.blobs[0], animation: `dc-drift-a ${dur(26)} ease-in-out infinite` }}
      />
      <div
        className="dc-blob bottom-[-14vh] right-[-8vw] size-[44vw] min-h-72 min-w-72"
        style={{ background: pal.blobs[1], animation: `dc-drift-b ${dur(32)} ease-in-out infinite` }}
      />
      <div
        className="dc-blob left-[30vw] top-[35vh] size-[34vw] min-h-60 min-w-60"
        style={{ background: pal.blobs[2], animation: `dc-drift-c ${dur(38)} ease-in-out infinite` }}
      />
      {style === "ribbons" && <Ribbons hue={eff.enabled ? eff.hue : 45} speed={eff.speed} k={k} />}
      {style === "grid" && <NeonGrid pal={pal} speed={eff.speed} k={k} />}
      {style !== "blobs" && style !== "grid" && (
        <Particles style={style} pal={pal} speed={eff.speed} k={k} />
      )}
    </div>
  );
}

/** VIP : rubans lumineux ondulants, façon aurore. */
function Ribbons({ hue, speed, k }: { hue: number; speed: number; k: number }) {
  const c1 = hsl(hue, 95, 70, 0.6 * k);
  const c2 = hsl(hue + 60, 95, 70, 0.5 * k);
  return (
    <svg className="absolute inset-x-0 top-0 h-[55vh] w-full" viewBox="0 0 1200 400" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dc-rib" x1="0" x2="1">
          <stop offset="0" stopColor={c1} stopOpacity="0" />
          <stop offset="0.5" stopColor={c1} />
          <stop offset="1" stopColor={c2} stopOpacity="0" />
        </linearGradient>
        <filter id="dc-rib-blur"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <g filter="url(#dc-rib-blur)" fill="none" stroke="url(#dc-rib)" strokeWidth="26" strokeLinecap="round">
        <path d="M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150">
          <animate attributeName="d" dur={`${14 / speed}s`} repeatCount="indefinite"
            values="M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150;M-50 150 C 250 240, 450 40, 750 170 S 1150 220, 1250 100;M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150" />
        </path>
        <path d="M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210" strokeWidth="18" opacity="0.75">
          <animate attributeName="d" dur={`${19 / speed}s`} repeatCount="indefinite"
            values="M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210;M-50 200 C 300 120, 500 320, 800 200 S 1100 120, 1250 260;M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210" />
        </path>
      </g>
    </svg>
  );
}

/** Premium : horizon synthwave — grille en perspective qui avance vers l'écran. */
function NeonGrid({ pal, speed, k }: { pal: Palette; speed: number; k: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let off = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const horizon = h * 0.52;
      const glow = g.createLinearGradient(0, horizon - 90, 0, horizon + 10);
      glow.addColorStop(0, "transparent");
      glow.addColorStop(1, pal.dots[1]);
      g.globalAlpha = 0.25 * k;
      g.fillStyle = glow;
      g.fillRect(0, horizon - 90, w, 100);
      g.globalAlpha = 0.5 * k;
      g.strokeStyle = pal.line;
      g.lineWidth = 1;
      g.shadowColor = pal.line;
      g.shadowBlur = 6;
      // lignes verticales convergeant vers le point de fuite
      const cx = w / 2;
      for (let i = -24; i <= 24; i++) {
        g.beginPath();
        g.moveTo(cx + i * 22, horizon);
        g.lineTo(cx + i * 140, h);
        g.stroke();
      }
      // lignes horizontales qui défilent (espacement croissant)
      off = (off + 0.006 * speed) % 1;
      for (let i = 0; i < 14; i++) {
        const t = (i + off) / 14;
        const y = horizon + Math.pow(t, 2.2) * (h - horizon);
        g.globalAlpha = (0.12 + t * 0.5) * k;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    draw();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("resize", draw); };
  }, [pal, speed, k]);
  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}

type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number; ph: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number };

function Particles({ style, pal, speed, k }: { style: BackdropStyle; pal: Palette; speed: number; k: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lines = style === "constellation";
    const stars = style === "stars";
    const mouse = { x: -9999, y: -9999 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let parts: P[] = [];
    let shots: Shot[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = stars ? 150 : lines ? 90 : 70;
      const count = Math.round(Math.min(base * 1.6, (w * h) / (stars ? 9000 : 16000)) * Math.max(0.5, k));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25 * speed,
        vy: (Math.random() - 0.5) * 0.25 * speed - (style === "ribbons" ? 0.08 : 0),
        r: 0.7 + Math.random() * (stars ? 1.6 : 2),
        c: pal.dots[Math.floor(Math.random() * pal.dots.length)],
        a: 0.3 + Math.random() * 0.6,
        ph: Math.random() * 6.28,
      }));
    };

    const frame = (t: number) => {
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        if (lines) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            const f = (1 - d2 / 14000) * 0.9;
            p.x += (dx / Math.sqrt(d2 + 1)) * f;
            p.y += (dy / Math.sqrt(d2 + 1)) * f;
          }
        }
        const tw = stars ? 0.3 + 0.7 * Math.abs(Math.sin(t / 700 + p.ph)) : 0.55 + 0.45 * Math.sin(t / 900 + p.ph);
        g.globalAlpha = Math.min(1, p.a * tw * k);
        g.fillStyle = p.c;
        g.shadowColor = p.c;
        g.shadowBlur = stars ? 10 : 6;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, 6.2832);
        g.fill();
      }
      g.shadowBlur = 0;
      if (lines) {
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const dx = parts[i].x - parts[j].x;
            const dy = parts[i].y - parts[j].y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 11000) {
              g.globalAlpha = (1 - d2 / 11000) * 0.24 * k;
              g.strokeStyle = pal.line;
              g.lineWidth = 0.8;
              g.beginPath();
              g.moveTo(parts[i].x, parts[i].y);
              g.lineTo(parts[j].x, parts[j].y);
              g.stroke();
            }
          }
        }
      }
      if (stars) {
        if (Math.random() < 0.012 * speed) {
          shots.push({ x: Math.random() * w, y: Math.random() * h * 0.5, vx: (4 + Math.random() * 4) * speed, vy: (2 + Math.random() * 2) * speed, life: 1 });
        }
        shots = shots.filter((s) => s.life > 0);
        for (const s of shots) {
          s.x += s.vx;
          s.y += s.vy;
          s.life -= 0.016;
          const grad = g.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
          grad.addColorStop(0, pal.dots[0]);
          grad.addColorStop(1, "transparent");
          g.globalAlpha = Math.max(0, s.life) * k;
          g.strokeStyle = grad;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(s.x, s.y);
          g.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [style, pal, speed, k]);

  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}

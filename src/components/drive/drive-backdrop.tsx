"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useTier } from "@/components/patreon/tier";

/**
 * Fond animé du drive.
 *  - Gratuit : trois nappes de couleur qui dérivent lentement (CSS pur, léger).
 *  - Gold : + poussière lumineuse qui flotte.
 *  - Premium : + constellation (les points proches se relient) qui réagit à la souris.
 *  - VIP : + rubans d'aurore et traînées dorées.
 * Palette suivant le thème (Aurora = bleu/violet, Or nocturne = doré).
 */

type Palette = { blobs: [string, string, string]; dots: string[]; line: string };

function paletteFor(theme: string | undefined): Palette {
  if (theme === "or-nocturne")
    return {
      blobs: ["rgba(234,179,8,0.20)", "rgba(217,119,6,0.16)", "rgba(250,204,21,0.12)"],
      dots: ["#fde68a", "#fbbf24", "#f59e0b"],
      line: "251,191,36",
    };
  if (theme === "aurora")
    return {
      blobs: ["rgba(99,102,241,0.24)", "rgba(56,189,248,0.16)", "rgba(168,85,247,0.2)"],
      dots: ["#a5b4fc", "#7dd3fc", "#c4b5fd"],
      line: "129,140,248",
    };
  return {
    blobs: ["rgba(99,102,241,0.17)", "rgba(217,70,239,0.13)", "rgba(34,211,238,0.10)"],
    dots: ["#a5b4fc", "#f0abfc", "#67e8f9"],
    line: "168,85,247",
  };
}

export function DriveBackdrop({ forceTier }: { forceTier?: number } = {}) {
  const { resolvedTheme } = useTheme();
  const { tier: realTier } = useTier();
  const tier = forceTier ?? realTier;
  const pal = React.useMemo(() => paletteFor(resolvedTheme), [resolvedTheme]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="dc-blob left-[-10vw] top-[-12vh] size-[48vw] min-h-72 min-w-72"
        style={{ background: pal.blobs[0], animation: "dc-drift-a 26s ease-in-out infinite" }}
      />
      <div
        className="dc-blob bottom-[-14vh] right-[-8vw] size-[44vw] min-h-72 min-w-72"
        style={{ background: pal.blobs[1], animation: "dc-drift-b 32s ease-in-out infinite" }}
      />
      <div
        className="dc-blob left-[30vw] top-[35vh] size-[34vw] min-h-60 min-w-60"
        style={{ background: pal.blobs[2], animation: "dc-drift-c 38s ease-in-out infinite" }}
      />
      {tier >= 3 && <Ribbons />}
      {tier >= 1 && <Particles tier={tier} pal={pal} />}
    </div>
  );
}

/** VIP : deux rubans lumineux ondulants, façon aurore, en haut de l'écran. */
function Ribbons() {
  return (
    <svg className="absolute inset-x-0 top-0 h-[55vh] w-full opacity-60" viewBox="0 0 1200 400" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dc-rib" x1="0" x2="1">
          <stop offset="0" stopColor="#f59e0b" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
        <filter id="dc-rib-blur"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <g filter="url(#dc-rib-blur)" fill="none" stroke="url(#dc-rib)" strokeWidth="26" strokeLinecap="round">
        <path d="M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150">
          <animate attributeName="d" dur="14s" repeatCount="indefinite"
            values="M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150;M-50 150 C 250 240, 450 40, 750 170 S 1150 220, 1250 100;M-50 120 C 250 20, 450 240, 750 110 S 1150 40, 1250 150" />
        </path>
        <path d="M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210" strokeWidth="18" opacity="0.7">
          <animate attributeName="d" dur="19s" repeatCount="indefinite"
            values="M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210;M-50 200 C 300 120, 500 320, 800 200 S 1100 120, 1250 260;M-50 230 C 300 330, 500 130, 800 240 S 1100 300, 1250 210" />
        </path>
      </g>
    </svg>
  );
}

type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number; ph: number };

function Particles({ tier, pal }: { tier: number; pal: Palette }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: -9999, y: -9999 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let parts: P[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, (w * h) / 16000) * (tier >= 2 ? 1 : 0.6));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25 - (tier >= 3 ? 0.08 : 0),
        r: 0.8 + Math.random() * (tier >= 3 ? 2.2 : 1.6),
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
        // Premium+ : les points fuient doucement le curseur.
        if (tier >= 2) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            const f = (1 - d2 / 14000) * 0.9;
            p.x += (dx / Math.sqrt(d2 + 1)) * f;
            p.y += (dy / Math.sqrt(d2 + 1)) * f;
          }
        }
        const tw = 0.55 + 0.45 * Math.sin(t / 900 + p.ph);
        g.globalAlpha = p.a * tw;
        g.fillStyle = p.c;
        g.shadowColor = p.c;
        g.shadowBlur = tier >= 3 ? 12 : 6;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, 6.2832);
        g.fill();
      }
      g.shadowBlur = 0;
      // Constellation (Premium + VIP).
      if (tier >= 2) {
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const dx = parts[i].x - parts[j].x;
            const dy = parts[i].y - parts[j].y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 11000) {
              g.globalAlpha = (1 - d2 / 11000) * 0.22;
              g.strokeStyle = `rgb(${pal.line})`;
              g.lineWidth = 0.8;
              g.beginPath();
              g.moveTo(parts[i].x, parts[i].y);
              g.lineTo(parts[j].x, parts[j].y);
              g.stroke();
            }
          }
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
  }, [tier, pal]);

  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}

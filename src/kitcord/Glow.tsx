"use client";

import { useEffect, useRef } from "react";

export type GlowProps = {
  /** Version discrète, pour les pages de lecture (docs, articles). */
  calm?: boolean;
  /** Des étincelles qui montent de la lumière. */
  sparks?: boolean;
  /** Un halo qui suit le curseur (souris et trackpad seulement). */
  cursor?: boolean;
};

type Spark = {
  x: number;
  y: number;
  vy: number;
  r: number;
  phase: number;
  sway: number;
  warm: boolean;
};

function hexToRgb(value: string, fallback: [number, number, number]): [number, number, number] {
  const h = value.trim().replace("#", "");
  if (h.length < 6 || /[^0-9a-f]/i.test(h.slice(0, 6))) return fallback;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * La lumière du bas. À poser une fois, en haut du <body>.
 * Elle porte aussi deux effets facultatifs : les étincelles et le halo du curseur.
 */
export function Glow({ calm = false, sparks = true, cursor = true }: GlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = sparks ? canvasRef.current : null;
    const spot = cursor ? spotRef.current : null;
    const ctx = canvas?.getContext("2d") ?? null;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const css = getComputedStyle(document.documentElement);
    const core = hexToRgb(css.getPropertyValue("--cord-light-core"), [242, 237, 255]);
    const warm = hexToRgb(css.getPropertyValue("--cord-light-warm"), [255, 176, 138]);

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    let boost = 1;
    let boostTarget = 1;
    const particles: Spark[] = [];

    function spawn(p: Spark, initial: boolean) {
      // répartition en cloche : plus d'étincelles au centre, là où la lumière est la plus forte
      const bell = (Math.random() + Math.random() + Math.random()) / 3;
      p.x = bell * w;
      p.y = initial ? h * (0.3 + Math.random() * 0.7) : h + 10 + Math.random() * 60;
      p.vy = 14 + Math.random() * 34;
      p.r = 0.5 + Math.random() * 1.7;
      p.phase = Math.random() * Math.PI * 2;
      p.sway = 6 + Math.random() * 16;
      p.warm = Math.random() < 0.22;
    }

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(24, Math.min(70, Math.round(w / 22)));
      while (particles.length < count) {
        const p = {} as Spark;
        spawn(p, true);
        particles.push(p);
      }
      particles.length = count;
    }

    // halo du curseur
    let tx = 0;
    let ty = 0;
    let sx = 0;
    let sy = 0;
    function onMove(e: PointerEvent) {
      if (!spot) return;
      if (!spot.hasAttribute("data-on")) {
        sx = tx = e.clientX;
        sy = ty = e.clientY;
        spot.setAttribute("data-on", "");
      }
      tx = e.clientX;
      ty = e.clientY;
    }

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frame++;

      // quand on cherche, la lumière monte et les étincelles aussi
      if (frame % 10 === 0) {
        boostTarget = document.querySelector("[data-cord-lights]:focus-within") ? 2.4 : 1;
      }
      boost += (boostTarget - boost) * Math.min(1, dt * 3);

      if (spot && finePointer) {
        const k = Math.min(1, dt * 7);
        sx += (tx - sx) * k;
        sy += (ty - sy) * k;
        spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      }

      if (ctx && canvas) {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        const reach = h * 0.8;
        const t = now / 1000;

        for (const p of particles) {
          p.y -= p.vy * dt * boost;
          const progress = (h - p.y) / reach;
          if (progress > 1) {
            spawn(p, false);
            continue;
          }
          const rise = Math.min(1, Math.max(0, (h - p.y + 10) / 40));
          const alpha = rise * Math.pow(1 - Math.max(progress, 0), 1.6) * 0.9;
          if (alpha <= 0.01) continue;

          const x = p.x + Math.sin(t * 0.6 + p.phase) * p.sway;
          const [r, g, b] = p.warm ? warm : core;

          ctx.fillStyle = `rgba(${r},${g},${b},${(alpha * 0.16).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, p.y, p.r * 4.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    if (spot && finePointer) window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [sparks, cursor]);

  return (
    <>
      <div className="cord-glow" data-calm={calm ? "" : undefined} aria-hidden="true" />
      {cursor && <div className="cord-spot" ref={spotRef} aria-hidden="true" />}
      {sparks && <canvas className="cord-sparks" ref={canvasRef} aria-hidden="true" />}
    </>
  );
}

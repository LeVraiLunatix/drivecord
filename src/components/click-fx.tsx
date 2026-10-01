"use client";

import * as React from "react";

const COLORS = ["#6366f1", "#a855f7", "#ec4899", "#22d3ee", "#f59e0b", "#34d399"];
const CLICKABLE = 'button, a[href], [role="button"], [role="menuitem"], [role="tab"], summary, [data-fx]';

/**
 * Animation de clic globale : un anneau qui s'étend + une gerbe d'éclats colorés
 * au point d'impact, sur tout élément cliquable. Désactivée avec
 * prefers-reduced-motion ou `data-fx="off"` (élément ou ancêtre).
 */
export function ClickFX() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.createElement("div");
    layer.className = "dc-fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    const burst = (x: number, y: number) => {
      const c = COLORS[Math.floor(Math.random() * COLORS.length)];
      const ring = document.createElement("span");
      ring.className = "dc-fx-ring";
      ring.style.cssText = `--c:${c};left:${x - 14}px;top:${y - 14}px;width:28px;height:28px`;
      layer.appendChild(ring);
      ring
        .animate(
          [
            { transform: "scale(0.2)", opacity: 0.9 },
            { transform: "scale(2.6)", opacity: 0 },
          ],
          { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        )
        .finished.then(() => ring.remove(), () => ring.remove());

      const n = 9;
      for (let i = 0; i < n; i++) {
        const dot = document.createElement("span");
        const size = 3 + Math.random() * 4;
        const col = COLORS[(i + Math.floor(Math.random() * COLORS.length)) % COLORS.length];
        dot.className = "dc-fx-dot";
        dot.style.cssText = `--c:${col};left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px`;
        layer.appendChild(dot);
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const dist = 26 + Math.random() * 30;
        dot
          .animate(
            [
              { transform: "translate(0,0) scale(1)", opacity: 1 },
              { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(0)`, opacity: 0 },
            ],
            { duration: 480 + Math.random() * 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          )
          .finished.then(() => dot.remove(), () => dot.remove());
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as Element | null;
      const el = t?.closest?.(CLICKABLE);
      if (!el || el.closest('[data-fx="off"]')) return;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      burst(e.clientX, e.clientY);
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      layer.remove();
    };
  }, []);

  return null;
}

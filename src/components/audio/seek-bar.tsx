"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Barre de progression / volume : clic + glisser, au pointeur et au clavier.
 * `commitOnRelease` (position de lecture) : pendant le glisser, seul le curseur
 * bouge et la valeur n'est appliquée qu'au relâcher — repositionner l'audio à
 * chaque mouvement hachait le son sur iPhone et le curseur sautait en arrière.
 */
export function SeekBar({
  value,
  max,
  onChange,
  className,
  label,
  commitOnRelease = false,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
  label: string;
  commitOnRelease?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState(false);
  // Synchronous twin of `drag`/`preview`: pointerup and lostpointercapture
  // fire back to back, before a re-render — commit only once.
  const dragging = React.useRef(false);
  const previewRef = React.useRef<number | null>(null);
  // Value shown while dragging a commit-on-release bar.
  const [preview, setPreview] = React.useState<number | null>(null);
  const shown = drag && preview != null ? preview : value;
  const pct = max > 0 ? Math.min(100, (shown / max) * 100) : 0;

  const valueAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max;
  };
  const fromEvent = (e: React.PointerEvent) => {
    const v = valueAt(e);
    if (commitOnRelease) { previewRef.current = v; setPreview(v); }
    else onChange(v);
  };
  const end = (e?: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setDrag(false);
    if (commitOnRelease) {
      const v = e ? valueAt(e) : previewRef.current;
      if (v != null) onChange(v);
      previewRef.current = null;
      setPreview(null);
    }
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        setDrag(true);
        fromEvent(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) fromEvent(e);
      }}
      onPointerUp={(e) => end(e)}
      // iOS cancels the gesture (scroll, system swipe): it used to stay "dragging".
      onPointerCancel={() => { dragging.current = false; previewRef.current = null; setDrag(false); setPreview(null); }}
      onLostPointerCapture={() => end()}
      onKeyDown={(e) => {
        const step = max / 50;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.stopPropagation();
          onChange(Math.min(max, value + step));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.stopPropagation();
          onChange(Math.max(0, value - step));
        }
      }}
      className={cn("group relative flex h-7 cursor-pointer touch-none items-center", className)}
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15 transition-[height] group-hover:h-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={cn(
          "absolute size-3.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(168,85,247,0.8)] transition-transform",
          drag ? "scale-125" : "scale-0 group-hover:scale-100 group-focus-visible:scale-100",
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

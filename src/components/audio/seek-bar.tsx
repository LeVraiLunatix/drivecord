"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Barre de progression / volume : clic + glisser, au pointeur et au clavier. */
export function SeekBar({
  value,
  max,
  onChange,
  className,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState(false);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max);
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
        setDrag(true);
        fromEvent(e);
      }}
      onPointerMove={(e) => {
        if (drag) fromEvent(e);
      }}
      onPointerUp={() => setDrag(false)}
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
      className={cn("group relative flex h-5 cursor-pointer touch-none items-center", className)}
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

"use client";

import * as React from "react";
import { getAnalyser, useAudioPlayer } from "@/lib/audio-player";
import { cn } from "@/lib/utils";

/** Barres de spectre réactives (canvas), dégradé indigo → fuchsia. */
export function Visualizer({ className, bars = 48 }: { className?: string; bars?: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const playing = useAudioPlayer((s) => s.playing);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const analyser = playing ? getAnalyser() : null;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 0);
    const smooth = new Float32Array(bars);
    let raf = 0;
    let t = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < bars * 4 || h < 4) { raf = requestAnimationFrame(draw); return; }
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      t += 0.03;
      if (analyser) analyser.getByteFrequencyData(data);
      const gap = 3;
      const bw = (w - gap * (bars - 1)) / bars;
      const grad = g.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, "#6366f1");
      grad.addColorStop(0.5, "#a855f7");
      grad.addColorStop(1, "#ec4899");
      g.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        // Les graves au centre, les aigus vers les bords (symétrique).
        const k = Math.abs(i - bars / 2) / (bars / 2);
        const bin = Math.floor(Math.pow(k, 1.2) * (data.length * 0.7));
        const target = analyser
          ? (data[bin] ?? 0) / 255
          : 0.08 + 0.05 * Math.sin(t * 2 + i * 0.5); // au repos : léger souffle
        smooth[i] += (target - smooth[i]) * 0.35;
        const bh = Math.max(3, smooth[i] * h);
        const x = i * (bw + gap);
        g.beginPath();
        g.roundRect(x, (h - bh) / 2, bw, bh, Math.max(0, Math.min(bw / 2, 4)));
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, bars]);

  return <canvas ref={ref} className={cn("h-24 w-full", className)} aria-hidden />;
}

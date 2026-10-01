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
      // Spectre en miroir : graves au centre, aigus vers les bords, renforcés pour que la
      // silhouette reste pleine (courbe en cloche) comme un vrai waveform symétrique.
      const half = Math.ceil(bars / 2);
      const mid = (bars - 1) / 2;
      for (let i = 0; i < bars; i++) {
        const k = Math.abs(i - mid) / (half - 1 || 1); // 0 au centre → 1 aux bords
        let target: number;
        if (analyser) {
          const lo = Math.floor(Math.pow(k, 1.3) * data.length * 0.5);
          const hi = Math.max(lo + 1, Math.floor(Math.pow(Math.min(1, k + 1 / half), 1.3) * data.length * 0.5));
          let sum = 0;
          for (let j = lo; j < hi; j++) sum += data[j] ?? 0;
          const v = sum / (hi - lo) / 255;
          target = Math.min(1, Math.pow(v, 0.85) * (1.4 + k * 1.0));
        } else {
          target = 0.1 + 0.05 * Math.sin(t * 2 + k * 6) + (1 - k) * 0.12; // repos : cloche discrète
        }
        smooth[i] += (target - smooth[i]) * 0.38;
        const bh = Math.max(4, smooth[i] * h);
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

"use client";

import * as React from "react";
import {
  Music,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatClock, useAudioPlayer } from "@/lib/audio-player";
import { cn } from "@/lib/utils";
import { SeekBar } from "./seek-bar";
import { Visualizer } from "./visualizer";

const RATES = [0.75, 1, 1.25, 1.5, 2];

/** Lecteur plein format affiché dans l'aperçu d'un fichier audio. */
export function AudioStage({
  name,
  onPrev,
  onNext,
}: {
  name: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const s = useAudioPlayer();
  const VolIcon = s.muted || s.volume === 0 ? VolumeX : s.volume < 0.5 ? Volume1 : Volume2;
  const clean = name.replace(/\.[^.]+$/, "");

  return (
    <div className="relative flex w-[min(26rem,calc(100vw-2rem))] flex-col items-center gap-5">
      {/* Halo qui pulse avec la lecture */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-10 left-1/2 size-72 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/40 via-fuchsia-500/30 to-transparent blur-3xl transition-opacity duration-700",
          s.playing ? "animate-pulse opacity-100" : "opacity-40",
        )}
      />

      <div
        className={cn(
          "relative flex size-40 items-center justify-center rounded-[2rem] border border-white/15 bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-fuchsia-500/30 shadow-2xl shadow-violet-500/20 backdrop-blur transition-transform duration-500 sm:size-48",
          s.playing && "scale-105",
        )}
      >
        <Music
          className={cn(
            "size-14 text-white/80 transition-transform duration-700",
            s.playing && "rotate-[8deg] scale-110",
          )}
        />
      </div>

      <div className="relative w-full text-center">
        <p className="truncate text-base font-semibold text-white">{clean}</p>
        <p className="text-xs text-white/40">Drivecord · {s.rate !== 1 ? `${s.rate}×` : "lecture"}</p>
      </div>

      <Visualizer className="relative" />

      <div className="relative w-full space-y-1">
        <SeekBar label="Position" value={s.currentTime} max={s.duration || 1} onChange={s.seek} />
        <div className="flex justify-between text-[11px] tabular-nums text-white/45">
          <span>{formatClock(s.currentTime)}</span>
          <span>-{formatClock(Math.max(0, s.duration - s.currentTime))}</span>
        </div>
      </div>

      <div className="relative flex items-center gap-2 sm:gap-3">
        <RoundBtn label="Précédent" onClick={onPrev} disabled={!onPrev}>
          <SkipBack className="size-5" />
        </RoundBtn>
        <RoundBtn label="Reculer de 10 s" onClick={() => s.skip(-10)}>
          <RotateCcw className="size-5" />
        </RoundBtn>
        <button
          onClick={s.toggle}
          aria-label={s.playing ? "Pause" : "Lecture"}
          className="group/play relative flex size-16 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-fuchsia-500/30 transition-transform hover:scale-105 active:scale-90"
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 via-violet-400 to-fuchsia-400 opacity-0 transition-opacity group-hover/play:opacity-100"
          />
          {s.playing ? (
            <Pause className="relative size-7 fill-current" />
          ) : (
            <Play className="relative size-7 translate-x-0.5 fill-current" />
          )}
        </button>
        <RoundBtn label="Avancer de 10 s" onClick={() => s.skip(10)}>
          <RotateCw className="size-5" />
        </RoundBtn>
        <RoundBtn label="Suivant" onClick={onNext} disabled={!onNext}>
          <SkipForward className="size-5" />
        </RoundBtn>
      </div>

      <div className="relative flex w-full items-center justify-between gap-4">
        <div className="flex w-36 items-center gap-2">
          <button
            onClick={s.toggleMute}
            aria-label="Muet"
            className="text-white/60 transition-colors hover:text-fuchsia-300"
          >
            <VolIcon className="size-4" />
          </button>
          <SeekBar label="Volume" value={s.muted ? 0 : s.volume} max={1} onChange={s.setVolume} className="flex-1" />
        </div>
        <button
          onClick={() => s.setRate(RATES[(RATES.indexOf(s.rate) + 1) % RATES.length])}
          className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium tabular-nums text-white/70 transition-all hover:border-fuchsia-400/60 hover:text-fuchsia-300 active:scale-90"
        >
          {s.rate}×
        </button>
      </div>
    </div>
  );
}

function RoundBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-10 items-center justify-center rounded-full text-white/60 transition-all hover:bg-white/10 hover:text-fuchsia-300 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

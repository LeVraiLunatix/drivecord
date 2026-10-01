"use client";

import { create } from "zustand";

/**
 * Lecteur audio global. L'élément <audio> vit dans <GlobalAudioPlayer /> (monté
 * dans le layout), pas dans l'aperçu : fermer l'aperçu ou naviguer dans le drive
 * ne coupe donc pas le son.
 */

export type AudioTrack = { id: string; name: string; driveId?: string | null };

type AudioState = {
  track: AudioTrack | null;
  url: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** L'aperçu plein écran affiche déjà ce morceau → le mini-lecteur se cache. */
  stageOpen: boolean;
  /** Incrémenté à chaque fin de morceau (l'aperçu enchaîne sur le suivant). */
  endedTick: number;
  /** Incrémenté quand le mini-lecteur demande à rouvrir la page du lecteur. */
  pendingOpen: boolean;
  clearOpen: () => void;
  requestOpen: () => void;
  /** Charge un morceau (le store possède son URL blob). Lance la lecture. */
  load: (track: AudioTrack, blob: Blob) => void;
  toggle: () => void;
  seek: (t: number) => void;
  skip: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setRate: (r: number) => void;
  setStageOpen: (open: boolean) => void;
  stop: () => void;
  _patch: (p: Partial<AudioState>) => void;
};

let el: HTMLAudioElement | null = null;
export function registerAudioElement(node: HTMLAudioElement | null) {
  el = node;
}

// ── Analyseur (visualiseur) ────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

/** Branche l'élément sur un AnalyserNode (une seule fois : l'API l'impose). */
export function getAnalyser(): AnalyserNode | null {
  if (!el || typeof window === "undefined") return null;
  if (analyser) return analyser;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    const src = ctx.createMediaElementSource(el);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    ctx.onstatechange = () => resumeAudioContext();
    void ctx.resume().catch(() => {});
  } catch {
    analyser = null;
  }
  return analyser;
}

export function resumeAudioContext() {
  if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
}

const FADE_MS = 350;
let fadeRaf = 0;

/** Fondu du volume de l'élément (le volume choisi par l'utilisateur reste dans le store). */
function fade(to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(fadeRaf);
  if (!el) { done?.(); return; }
  const node = el;
  const from = node.volume;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    node.volume = Math.max(0, Math.min(1, from + (to - from) * (p * p * (3 - 2 * p))));
    if (p < 1) fadeRaf = requestAnimationFrame(step);
    else done?.();
  };
  fadeRaf = requestAnimationFrame(step);
}

export const useAudioPlayer = create<AudioState>((set, get) => ({
  track: null,
  url: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  rate: 1,
  stageOpen: false,
  endedTick: 0,
  pendingOpen: false,
  clearOpen: () => set({ pendingOpen: false }),
  requestOpen: () => set({ pendingOpen: true }),

  load: (track, blob) => {
    const prev = get().url;
    // Même morceau déjà chargé : on ne relance pas.
    if (get().track?.id === track.id && prev) return;
    if (prev) URL.revokeObjectURL(prev);
    set({ track, url: URL.createObjectURL(blob), currentTime: 0, duration: 0, playing: false });
  },
  toggle: () => {
    if (!el) return;
    getAnalyser();
    resumeAudioContext();
    const node = el;
    if (node.paused) {
      node.volume = 0;
      void node.play().then(() => fade(get().volume, FADE_MS)).catch(() => { node.volume = get().volume; });
    } else {
      set({ playing: false });
      fade(0, FADE_MS, () => {
        node.pause();
        node.volume = get().volume; // prêt pour la prochaine lecture
      });
    }
  },
  seek: (t) => {
    if (!el || !Number.isFinite(t)) return;
    el.currentTime = Math.max(0, Math.min(t, el.duration || t));
    set({ currentTime: el.currentTime });
  },
  skip: (d) => get().seek((el?.currentTime ?? 0) + d),
  setVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v));
    if (el) { el.volume = vol; el.muted = false; }
    set({ volume: vol, muted: false });
  },
  toggleMute: () => {
    const m = !get().muted;
    if (el) el.muted = m;
    set({ muted: m });
  },
  setRate: (r) => {
    if (el) el.playbackRate = r;
    set({ rate: r });
  },
  setStageOpen: (open) => set({ stageOpen: open }),
  stop: () => {
    const url = get().url;
    set({ playing: false });
    const finish = () => {
      if (el) { el.pause(); el.removeAttribute("src"); el.load(); el.volume = get().volume; }
      if (url) URL.revokeObjectURL(url);
      set({ track: null, url: null, playing: false, currentTime: 0, duration: 0, stageOpen: false });
    };
    if (el && !el.paused) fade(0, FADE_MS, finish);
    else finish();
  },
  _patch: (p) => set(p),
}));

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

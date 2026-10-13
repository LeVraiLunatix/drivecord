"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Music, Pause, Play, X } from "lucide-react";
import { fade, formatClock, registerAudioElement, resumeAudioContext, useAudioPlayer } from "@/lib/audio-player";

/** Lock screen / Control Center scrubber, in sync with the element. */
function syncPosition(el: HTMLAudioElement) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const d = el.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: d,
      position: Math.min(el.currentTime, d),
      playbackRate: el.playbackRate || 1,
    });
  } catch { /* unsupported */ }
}

function syncPlaybackState(state: MediaSessionPlaybackState) {
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}
import { cn } from "@/lib/utils";

/**
 * Élément <audio> unique de l'app + mini-lecteur flottant. Monté dans le layout :
 * la musique continue quand on ferme l'aperçu ou qu'on change de page.
 */
export function GlobalAudioPlayer() {
  const ref = React.useRef<HTMLAudioElement>(null);
  const s = useAudioPlayer();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    registerAudioElement(ref.current);
    return () => registerAudioElement(null);
  }, []);

  // Nouveau morceau → lecture automatique.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !s.url) return;
    el.src = s.url;
    el.playbackRate = s.rate;
    const target = useAudioPlayer.getState().volume;
    el.volume = 0;
    // fade() is immediate when hidden: a track chained in a background tab
    // used to stay at volume 0 (requestAnimationFrame doesn't run there).
    void el
      .play()
      .then(() => fade(target, 350))
      .catch(() => {
        el.volume = target;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.url]);

  // Écran verrouillé / touches média.
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!s.track) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }
    try {
      ms.metadata = new MediaMetadata({
        title: s.track.name.replace(/\.[^.]+$/, ""),
        artist: "Drivecord",
        artwork: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
      });
      // Explicit actions: toggling flipped the wrong way whenever the state
      // was out of sync (interrupted by a call, paused by iOS…).
      ms.setActionHandler("play", () => useAudioPlayer.getState().play());
      ms.setActionHandler("pause", () => useAudioPlayer.getState().pause());
      ms.setActionHandler("stop", () => useAudioPlayer.getState().stop());
      ms.setActionHandler("seekbackward", () => useAudioPlayer.getState().skip(-10));
      ms.setActionHandler("seekforward", () => useAudioPlayer.getState().skip(10));
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) useAudioPlayer.getState().seek(d.seekTime);
      });
    } catch {
      /* MediaSession partiel */
    }
  }, [s.track]);

  const openFromMini = () => {
    useAudioPlayer.getState().requestOpen();
    // Hors du drive : on y retourne, la page rouvre alors le lecteur (demande en attente).
    if (!pathname.startsWith("/drive")) router.push("/drive");
  };

  const patch = s._patch;
  const show = s.track && !s.stageOpen;
  const pct = s.duration > 0 ? (s.currentTime / s.duration) * 100 : 0;

  return (
    <>
      <audio
        ref={ref}
        preload="auto"
        onPlay={(e) => {
          resumeAudioContext();
          patch({ playing: true });
          syncPlaybackState("playing");
          syncPosition(e.currentTarget);
        }}
        onPause={(e) => {
          patch({ playing: false });
          syncPlaybackState("paused");
          syncPosition(e.currentTarget);
        }}
        onTimeUpdate={(e) => patch({ currentTime: e.currentTarget.currentTime })}
        onSeeked={(e) => syncPosition(e.currentTarget)}
        onRateChange={(e) => syncPosition(e.currentTarget)}
        onDurationChange={(e) => {
          patch({ duration: e.currentTarget.duration || 0 });
          syncPosition(e.currentTarget);
        }}
        onError={() => patch({ playing: false })}
        onEnded={() => patch({ playing: false, endedTick: useAudioPlayer.getState().endedTick + 1 })}
      />

      {show && (
        <div
          className={cn(
            "fixed left-1/2 z-[90] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-6 duration-300",
            "bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-4",
          )}
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 p-2.5 pr-3 text-white shadow-2xl shadow-violet-500/10 backdrop-blur-xl">
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute -left-8 -top-8 size-28 rounded-full bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30 blur-2xl",
                s.playing && "animate-pulse",
              )}
            />
            <div className="relative flex items-center gap-3">
              <button
                onClick={openFromMini}
                aria-label="Ouvrir le lecteur"
                title="Ouvrir le lecteur"
                className="group/open flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/40 transition-transform group-hover/open:scale-105">
                  {s.playing ? <Equalizer /> : <Music className="size-4 text-white/80" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium transition-colors group-hover/open:text-fuchsia-300">
                    {s.track!.name.replace(/\.[^.]+$/, "")}
                  </span>
                  <span className="block text-[11px] tabular-nums text-white/45">
                    {formatClock(s.currentTime)} / {formatClock(s.duration)}
                  </span>
                </span>
              </button>
              <button
                onClick={s.toggle}
                aria-label={s.playing ? "Pause" : "Lecture"}
                className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-110 active:scale-90"
              >
                {s.playing ? (
                  <Pause className="size-4 fill-current" />
                ) : (
                  <Play className="size-4 translate-x-px fill-current" />
                )}
              </button>
              <button
                onClick={s.stop}
                aria-label="Fermer le lecteur"
                className="flex size-8 items-center justify-center rounded-full text-white/50 transition-all hover:bg-white/10 hover:text-rose-300 active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div className="h-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-bottom rounded-full bg-white"
          style={{ animation: `dc-eq 0.9s ease-in-out ${i * 0.18}s infinite` }}
        />
      ))}
    </span>
  );
}

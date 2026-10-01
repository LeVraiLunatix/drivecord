"use client";

type ShellWindow = Window & {
  webkit?: { messageHandlers?: { nativeShell?: { postMessage: (msg: unknown) => void } } };
};

/**
 * Keep the screen from auto-locking while a long job runs (camera-roll
 * backup): once the iPhone locks, iOS suspends the web view and the job dies.
 * The iOS shell disables its idle timer; the Screen Wake Lock API covers the
 * browser (and older app builds). Returns the release function.
 */
export function keepScreenAwake(): () => void {
  const shell = (window as ShellWindow).webkit?.messageHandlers?.nativeShell;
  shell?.postMessage({ keepAwake: true });

  let released = false;
  let lock: WakeLockSentinel | null = null;
  const acquire = () => {
    navigator.wakeLock
      ?.request("screen")
      .then((l) => {
        if (released) void l.release();
        else lock = l;
      })
      .catch(() => { /* unsupported / denied */ });
  };
  // The browser drops the lock whenever the page is hidden: take it back.
  const onVisible = () => {
    if (document.visibilityState === "visible" && !released) acquire();
  };
  acquire();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
    shell?.postMessage({ keepAwake: false });
  };
}

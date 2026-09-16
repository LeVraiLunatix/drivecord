"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Discreet "update ready" toast for the desktop shell. The native engine
 * (`src-tauri/src/update.rs`) checks `plugins.updater.endpoints` on a timer
 * and silently downloads a newer build in the background; this banner shows
 * up once it's staged, and `install_update` applies it (the app restarts on
 * its own — no confirmation dialog needed beyond the click itself).
 */

type UpdateStatus = {
  state: "idle" | "checking" | "downloading" | "ready" | "error" | string;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
};

const POLL_MS = 5000;

export function UpdateBanner() {
  const [status, setStatus] = React.useState<UpdateStatus | null>(null);
  const [installing, setInstalling] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    if (window.location.pathname.startsWith("/desktop-uploads")) return;

    const tick = () =>
      tauriInvoke<UpdateStatus>("update_status")
        .then(setStatus)
        .catch(() => {});
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const install = async () => {
    setInstalling(true);
    try {
      // On success this never resolves — the app restarts into the new build.
      await tauriInvoke("install_update");
    } catch {
      setInstalling(false);
    }
  };

  const ready = status?.state === "ready";

  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          initial={{ y: 32, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed bottom-4 left-1/2 z-[150] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_20px_60px_-12px_rgba(0,0,0,0.5)]"
        >
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500" />
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
              <Download className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Mise à jour prête</p>
              <p className="truncate text-xs text-muted-foreground">
                {status?.version ? `Drivecord v${status.version}` : "Nouvelle version disponible"}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={install}
              disabled={installing}
            >
              {installing && <RotateCw className="size-3.5 animate-spin" />}
              {installing ? "Installation…" : "Redémarrer"}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

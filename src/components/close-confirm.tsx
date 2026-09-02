"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minimize2, LogOut, PanelTopClose, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * In-app "Fermer Drivecord ?" modal for the desktop shell. The native window
 * close is vetoed in Rust (`CloseRequested`), which dispatches a
 * `drivecord:close-request` DOM event; we answer with `app_hide` (minimise to
 * tray, sync keeps running), `app_quit`, or just dismiss (cancel). The
 * hide/quit choice can be remembered.
 */

const REMEMBER_KEY = "drivecord:closeAction"; // "hide" | "quit"

export function CloseConfirm() {
  const [open, setOpen] = React.useState(false);
  const [remember, setRemember] = React.useState(false);
  const reduce = useReducedMotion();

  const act = React.useCallback((action: "hide" | "quit") => {
    void tauriInvoke(action === "hide" ? "app_hide" : "app_quit").catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    if (window.location.pathname.startsWith("/desktop-uploads")) return;

    const onRequest = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(REMEMBER_KEY);
      } catch {
        /* private mode */
      }
      if (saved === "hide" || saved === "quit") {
        act(saved);
        return;
      }
      setOpen(true);
    };

    window.addEventListener("drivecord:close-request", onRequest);
    return () => window.removeEventListener("drivecord:close-request", onRequest);
  }, [act]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const choose = (action: "hide" | "quit") => {
    if (remember) {
      try {
        localStorage.setItem(REMEMBER_KEY, action);
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    act(action);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 420, damping: 32, mass: 0.7 }
            }
          >
            {/* brand accent line */}
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500" />

            <button
              type="button"
              aria-label="Annuler"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3.5 grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="p-5">
              <div className="flex items-start gap-3">
                <motion.div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/25"
                  initial={reduce ? false : { rotate: -8, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.05, type: "spring", stiffness: 500, damping: 22 }}
                >
                  <PanelTopClose className="size-5" />
                </motion.div>
                <div className="min-w-0 flex-1 pr-6">
                  <h2 className="text-base font-semibold">Fermer Drivecord&nbsp;?</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    En réduisant dans la zone de notification, la synchro du
                    dossier reste active — imports et exports continuent sans la
                    fenêtre.
                  </p>
                </div>
              </div>

              <label className="mt-4 flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                Se souvenir de mon choix
              </label>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => choose("quit")}
                >
                  <LogOut className="size-4" />
                  Quitter
                </Button>
                <Button className="gap-1.5" onClick={() => choose("hide")}>
                  <Minimize2 className="size-4" />
                  Réduire
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

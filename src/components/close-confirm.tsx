"use client";

import * as React from "react";
import { Minimize2, LogOut, PanelTopClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * In-app "Fermer Drivecord ?" modal for the desktop shell. The native window
 * close is vetoed in Rust (`CloseRequested`), which dispatches a
 * `drivecord:close-request` DOM event; we answer with `app_hide` (minimise to
 * tray, sync keeps running) or `app_quit`. The choice can be remembered.
 */

const REMEMBER_KEY = "drivecord:closeAction"; // "hide" | "quit"

export function CloseConfirm() {
  const [open, setOpen] = React.useState(false);
  const [remember, setRemember] = React.useState(false);

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

  if (!open) return null;

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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
            <PanelTopClose className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Fermer Drivecord ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              En réduisant dans la zone de notification, la synchro du dossier
              reste active — les imports et exports continuent sans la fenêtre.
            </p>
          </div>
        </div>

        <label className="mt-4 flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-border accent-primary"
          />
          Se souvenir de mon choix
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="gap-1.5" onClick={() => choose("quit")}>
            <LogOut className="size-4" />
            Quitter
          </Button>
          <Button className="gap-1.5" onClick={() => choose("hide")}>
            <Minimize2 className="size-4" />
            Réduire
          </Button>
        </div>
      </div>
    </div>
  );
}

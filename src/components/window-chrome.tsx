"use client";

import * as React from "react";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Window controls for the Tauri desktop shell (OS title bar hidden —
 * `decorations: false`). macOS-style traffic lights, vertically centred in the
 * band the drive topbar occupies, floating in the top-right corner. The window
 * is dragged from `[data-tauri-drag-region]` (the topbar). Nothing on the web.
 */
export function WindowChrome() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    // The standalone "Import Drivecord" window keeps its native title bar —
    // no traffic lights there (they'd drive the main window anyway).
    if (window.location.pathname.startsWith("/desktop-uploads")) return;
    setShow(true);
    document.documentElement.classList.add("is-desktop");
  }, []);

  if (!show) return null;

  const dot = (color: string, label: string, cmd: string, glyph: string) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => void tauriInvoke(cmd).catch(() => {})}
      className="relative grid size-3 shrink-0 place-items-center rounded-full"
      style={{ background: color }}
    >
      <span className="pointer-events-none absolute text-[8px] font-bold leading-none text-black/55 opacity-0 transition-opacity group-hover/wc:opacity-100">
        {glyph}
      </span>
    </button>
  );

  return (
    <div className="group/wc fixed right-0 top-0 z-[60] flex h-[52px] select-none items-center gap-[9px] pr-4">
      {dot("#febc2e", "Réduire", "win_minimize", "−")}
      {dot("#28c840", "Agrandir", "win_toggle_maximize", "+")}
      {dot("#ff5f57", "Fermer", "win_close", "×")}
    </div>
  );
}

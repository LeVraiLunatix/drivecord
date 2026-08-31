"use client";

import * as React from "react";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Window controls for the Tauri desktop shell (OS title bar hidden —
 * `decorations: false`). macOS-style traffic lights floating in the top-right
 * corner over the content — no reserved strip, so the UI reaches the top edge.
 * The window is dragged from `[data-tauri-drag-region]` (the drive topbar).
 * Renders nothing on the web.
 */
export function WindowChrome() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    setShow(true);
    document.documentElement.classList.add("is-desktop");
  }, []);

  if (!show) return null;

  const dot = (
    color: string,
    label: string,
    cmd: string,
    glyph: string,
  ) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => void tauriInvoke(cmd).catch(() => {})}
      className="grid size-[13px] place-items-center rounded-full ring-inset ring-black/10 ring-1"
      style={{ background: color }}
    >
      <span className="text-[9px] font-semibold leading-none text-black/60 opacity-0 transition-opacity group-hover/wc:opacity-100">
        {glyph}
      </span>
    </button>
  );

  return (
    <div className="group/wc fixed right-3.5 top-[9px] z-[60] flex select-none items-center gap-2">
      {dot("#febc2e", "Réduire", "win_minimize", "−")}
      {dot("#28c840", "Agrandir", "win_toggle_maximize", "+")}
      {dot("#ff5f57", "Fermer", "win_close", "×")}
    </div>
  );
}

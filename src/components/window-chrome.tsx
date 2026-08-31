"use client";

import * as React from "react";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Window controls for the Tauri desktop shell (the OS title bar is hidden —
 * `decorations: false`). Just the three Windows-11-style caption buttons in the
 * top-right corner, floating over the app content — no reserved strip, so the
 * UI reaches the top edge. The window is dragged from `[data-tauri-drag-region]`
 * elements (the drive topbar). Renders nothing on the web.
 */
export function WindowChrome() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    setShow(true);
    document.documentElement.classList.add("is-desktop");
  }, []);

  if (!show) return null;

  const btn =
    "grid h-8 w-[44px] place-items-center text-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground focus:outline-none";

  return (
    <div className="fixed right-0 top-0 z-[60] flex select-none">
      <button
        type="button"
        aria-label="Réduire"
        className={btn}
        onClick={() => void tauriInvoke("win_minimize").catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Agrandir"
        className={btn}
        onClick={() => void tauriInvoke("win_toggle_maximize").catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Fermer"
        className={`${btn} hover:bg-[#e81123] hover:text-white`}
        onClick={() => void tauriInvoke("win_close").catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}

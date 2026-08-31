"use client";

import * as React from "react";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Custom title bar for the Tauri desktop shell (the OS bar is hidden —
 * `decorations: false`). A slim draggable strip with minimise / maximise /
 * close on the right, styled like the Windows 11 caption buttons. Renders
 * nothing on the web.
 */
export function WindowChrome() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    setShow(true);
    // Lets viewport-height layouts subtract the title bar (see globals.css).
    document.documentElement.classList.add("is-desktop");
  }, []);

  if (!show) return null;

  const btn =
    "grid h-8 w-[46px] place-items-center text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground focus:outline-none";

  return (
    <div
      onMouseDown={() => {
        void tauriInvoke("win_start_drag").catch(() => {});
      }}
      className="flex h-8 shrink-0 select-none items-center justify-end bg-background/80 backdrop-blur"
    >
      <button
        type="button"
        aria-label="Réduire"
        className={btn}
        onMouseDown={(e) => e.stopPropagation()}
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
        onMouseDown={(e) => e.stopPropagation()}
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
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => void tauriInvoke("win_close").catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}

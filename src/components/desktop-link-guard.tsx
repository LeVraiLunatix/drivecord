"use client";

import * as React from "react";
import { IS_DESKTOP } from "@/lib/api-base";
import { SITE_ORIGIN, isShellRoute, openInBrowser } from "@/lib/site-link";

/**
 * Desktop shell only (embedded build). The shell bundles a subset of the site's
 * pages, so links shared with the web (`/docs`, `/developers`, `/supporters`,
 * external sites…) would otherwise land on a 404 or navigate the app window
 * away from the shell. They open in the user's browser instead:
 *  - clicks on `<a>` to a non-shell page or another origin;
 *  - `window.open(http…)` (WebView2 would pop a bare, chrome-less window).
 */
export function DesktopLinkGuard() {
  React.useEffect(() => {
    if (!IS_DESKTOP) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin === window.location.origin) {
        if (isShellRoute(url.pathname)) return;
        e.preventDefault();
        openInBrowser(`${SITE_ORIGIN}${url.pathname}${url.search}${url.hash}`);
        return;
      }
      e.preventDefault();
      openInBrowser(url.href);
    };

    const nativeOpen = window.open.bind(window);
    window.open = (target?: string | URL, ...rest) => {
      if (target) {
        try {
          const url = new URL(String(target), window.location.href);
          if (url.protocol === "http:" || url.protocol === "https:") {
            if (url.origin !== window.location.origin) {
              openInBrowser(url.href);
              return null;
            }
            if (!isShellRoute(url.pathname)) {
              openInBrowser(`${SITE_ORIGIN}${url.pathname}${url.search}${url.hash}`);
              return null;
            }
          }
        } catch {
          /* fall through */
        }
      }
      return nativeOpen(target, ...rest);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = nativeOpen;
    };
  }, []);

  return null;
}

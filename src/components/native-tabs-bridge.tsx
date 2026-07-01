"use client";

import * as React from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { hasNativeTabBar } from "@/lib/use-platform";

// Pages where the native bar should be hidden (auth / public / onboarding).
const HIDDEN_PREFIXES = ["/login", "/register", "/setup", "/s/", "/install", "/conditions", "/native"];

/** Map the current location to the native tab index (-1 = no selection). */
function activeIndex(pathname: string, section: string | null): number {
  if (pathname.startsWith("/drive")) return section === "vault" ? 1 : 0;
  if (pathname.startsWith("/backup")) return 2;
  if (pathname.startsWith("/approve")) return 3;
  // Partagés est désormais accessible depuis les Réglages → même onglet.
  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/stats") ||
    pathname.startsWith("/shares")
  )
    return 4;
  return -1;
}

type WebkitWindow = Window & {
  __drivecordNavigate?: (path: string) => void;
  webkit?: { messageHandlers?: { nativeTabs?: { postMessage: (msg: unknown) => void } } };
};

function Inner() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const section = search.get("section");

  // Expose a client-side navigation hook the native bar calls on tab tap, and
  // flag the document so CSS hides the web tab bar / adjusts padding.
  React.useEffect(() => {
    if (!hasNativeTabBar()) return;
    const w = window as WebkitWindow;
    w.__drivecordNavigate = (path: string) => router.push(path);
    document.documentElement.classList.add("native-tabs");
    return () => { delete w.__drivecordNavigate; };
  }, [router]);

  // Push the active tab + visibility to the native shell on every route change.
  React.useEffect(() => {
    if (!hasNativeTabBar()) return;
    const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
    const index = activeIndex(pathname, section);
    const w = window as WebkitWindow;
    w.webkit?.messageHandlers?.nativeTabs?.postMessage({ index, visible: !hidden });
  }, [pathname, section]);

  return null;
}

/**
 * Bridges the native iOS UITabBar with the web router: lets native tab taps
 * drive client-side navigation, and keeps the native bar's selection in sync.
 * No-op on the web and in the CSS-bar build.
 */
export function NativeTabsBridge() {
  return (
    <React.Suspense fallback={null}>
      <Inner />
    </React.Suspense>
  );
}

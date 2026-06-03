"use client";

import { useIsNativeApp } from "@/lib/use-platform";

/**
 * Ambient colour backdrop for the iOS app.
 *
 * Liquid glass (backdrop-filter: blur) is only *visible* when there is rich,
 * colourful content painted behind the translucent surface — on a flat black
 * canvas the blur produces the same flat black and the glass looks like a plain
 * card. This fixed, full-screen layer paints soft coloured glows behind the
 * whole app so every frosted surface (cards, menus, the tab bar) actually has
 * something to frost. Native-only; pointer-events disabled.
 */
export function NativeBackdrop() {
  const native = useIsNativeApp();
  if (!native) return null;

  return (
    <div aria-hidden className="native-backdrop">
      <span className="native-blob native-blob-1" />
      <span className="native-blob native-blob-2" />
      <span className="native-blob native-blob-3" />
      <span className="native-blob native-blob-4" />
    </div>
  );
}

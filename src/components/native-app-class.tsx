"use client";

import * as React from "react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * Adds `is-native` to <html> when running inside the Capacitor app.
 * globals.css uses this to lock the viewport (kills the iOS rubber-band
 * bounce) without affecting the scrollable web site.
 */
export function NativeAppClass() {
  React.useEffect(() => {
    if (isNativeApp()) {
      document.documentElement.classList.add("is-native");
    }
  }, []);
  return null;
}

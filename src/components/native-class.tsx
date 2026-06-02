"use client";

import * as React from "react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * Adds `is-native` to <html> when running inside the iOS app, so we can apply
 * the iOS "liquid glass" styling (in globals.css) only there — the web keeps
 * its normal look.
 */
export function NativeClass() {
  React.useEffect(() => {
    if (isNativeApp()) document.documentElement.classList.add("is-native");
  }, []);
  return null;
}

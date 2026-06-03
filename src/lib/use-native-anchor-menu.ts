"use client";

import * as React from "react";
import {
  nativeAnchorMenuAvailable,
  postAnchorMenu,
  removeAnchorMenu,
  type NativeMenuItem,
} from "./native-menu";

type Options = {
  /** Stable id for this anchor (e.g. "driveSwitcher", "sort"). */
  id: string;
  items: NativeMenuItem[];
  onSelect: (index: number) => void;
  title?: string;
  /** Disable (falls back to the web menu). */
  enabled?: boolean;
};

/**
 * Overlays a native iOS pull-down menu (real Liquid Glass on iOS 26) on top of
 * the returned ref'd element. Keeps it positioned and in sync with `items`.
 * Returns a ref to attach to the trigger button, and whether the native menu is
 * active (so the caller can skip its web fallback).
 */
export function useNativeAnchorMenu({ id, items, onSelect, title, enabled = true }: Options) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [active, setActive] = React.useState(false);

  // Keep the latest selection handler without re-registering.
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  const itemsKey = React.useMemo(
    () => items.map((i) => `${i.label}|${i.selected ? 1 : 0}|${i.destructive ? 1 : 0}`).join("¦"),
    [items],
  );

  React.useEffect(() => {
    setActive(enabled && nativeAnchorMenuAvailable());
  }, [enabled]);

  React.useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const post = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      postAnchorMenu(
        id,
        { x: r.left, y: r.top, width: r.width, height: r.height },
        items,
        (index) => onSelectRef.current(index),
        title,
      );
    };

    post();
    // Re-measure after layout settles (safe-area / fonts).
    const raf = requestAnimationFrame(post);
    const t = setTimeout(post, 250);
    window.addEventListener("resize", post);
    window.addEventListener("orientationchange", post);
    const ro = new ResizeObserver(post);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener("resize", post);
      window.removeEventListener("orientationchange", post);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id, title, itemsKey]);

  // Remove the native overlay when the anchor unmounts.
  React.useEffect(() => {
    return () => { removeAnchorMenu(id); };
  }, [id]);

  return { ref, active };
}

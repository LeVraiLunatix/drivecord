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

    // The native overlay is an invisible button sitting ABOVE the whole web
    // view. If it stays where the trigger used to be (page scrolled, layout
    // shifted) or while something covers the trigger (dialog, sheet, dropdown),
    // it swallows taps meant for the web UI. So it is only kept while the
    // trigger is really the thing under its centre, and pulled otherwise.
    let shown = false;
    let lastRect = "";
    const post = () => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const onScreen =
        r.width > 0 && r.height > 0 &&
        cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight;
      const hit = onScreen ? document.elementFromPoint(cx, cy) : null;
      if (!hit || !el.contains(hit)) {
        if (shown) { removeAnchorMenu(id); shown = false; }
        return;
      }
      // Animations mutate styles every frame: only message the shell on change.
      const key = `${r.left},${r.top},${r.width},${r.height}`;
      if (shown && key === lastRect) return;
      lastRect = key;
      postAnchorMenu(
        id,
        { x: r.left, y: r.top, width: r.width, height: r.height },
        items,
        (index) => onSelectRef.current(index),
        title,
      );
      shown = true;
    };

    // Coalesce bursts (scroll, DOM mutations) into one measure per frame.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; post(); });
    };

    post();
    // Re-measure after layout settles (safe-area / fonts).
    const raf = requestAnimationFrame(post);
    const t = setTimeout(post, 250);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    // Capture: also catches scrolls of inner containers, not just the window.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    ro.observe(el);
    // Dialogs/sheets/menus opening or closing over the trigger.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "hidden", "aria-hidden"],
    });

    return () => {
      cancelAnimationFrame(raf);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(t);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      ro.disconnect();
      mo.disconnect();
      // `active` can go true → false without the component unmounting (e.g.
      // the caller passes `enabled: false`) — without this, the native shell
      // would keep the previously-registered overlay/callback alive even
      // though this hook now reports `active: false`.
      removeAnchorMenu(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id, title, itemsKey]);

  // Remove the native overlay when the anchor unmounts.
  React.useEffect(() => {
    return () => { removeAnchorMenu(id); };
  }, [id]);

  return { ref, active };
}

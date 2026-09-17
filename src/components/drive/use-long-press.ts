"use client";

import * as React from "react";

/**
 * Detects a long press (hold left mouse button ≥ `delay` ms).
 *
 * Usage:
 *   const lp = useLongPress(() => startSelection());
 *   <div {...lp.handlers} onClick={(e) => { if (lp.didFire()) return; ... }} />
 *
 * - `handlers`  → spread onto the target element
 * - `didFire()` → call inside onClick to skip regular click after a long press
 */
export function useLongPress(
  onLongPress: () => void,
  delay = 450,
) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = React.useRef(false);

  const cancel = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = React.useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left button only
      start();
    },
    [start],
  );

  // Touch devices don't reliably follow up with synthetic mouse events on a
  // long hold (especially inside a scrollable container), so the
  // mouse-only handlers above leave tap-to-select unusable on touchscreens —
  // including the native iOS/Capacitor shell this app ships as. Mirror the
  // same start/cancel via touch events; cancel on move so a scroll gesture
  // doesn't get mistaken for a long press.
  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      start();
    },
    [start],
  );

  /** Returns true (and resets the flag) if a long press just fired. */
  const didFire = React.useCallback(() => {
    const was = firedRef.current;
    firedRef.current = false;
    return was;
  }, []);

  return {
    handlers: {
      onMouseDown,
      onMouseUp: cancel,
      onMouseLeave: cancel,
      onDragStart: cancel,
      onTouchStart,
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onTouchCancel: cancel,
    } as React.HTMLAttributes<HTMLElement>,
    didFire,
  };
}

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

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left button only
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay],
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
    } as React.HTMLAttributes<HTMLElement>,
    didFire,
  };
}

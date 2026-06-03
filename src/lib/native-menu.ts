import { hasNativeTabBar } from "./use-platform";

export type NativeMenuItem = {
  label: string;
  /** Renders the action in red (delete, etc.). */
  destructive?: boolean;
  /** Shows a checkmark next to the item. */
  selected?: boolean;
};

export type NativeMenuSpec = {
  title?: string;
  message?: string;
  items: NativeMenuItem[];
  /** Cancel button label (defaults to "Annuler"). */
  cancel?: string;
};

export type AnchorRect = { x: number; y: number; width: number; height: number };

type WebkitWindow = Window & {
  __drivecordMenuResult?: (id: string, index: number) => void;
  webkit?: {
    messageHandlers?: {
      nativeMenu?: { postMessage: (msg: unknown) => void };
      nativeAnchorMenu?: { postMessage: (msg: unknown) => void };
    };
  };
};

let counter = 0;
// One-shot callbacks (action sheets) — removed after firing.
const oneShot = new Map<string, (index: number) => void>();
// Persistent callbacks (anchored pull-down menus) — reused across opens.
const persistent = new Map<string, (index: number) => void>();

function ensureResultHandler() {
  const w = window as WebkitWindow;
  if (w.__drivecordMenuResult) return;
  w.__drivecordMenuResult = (id: string, index: number) => {
    const one = oneShot.get(id);
    if (one) { oneShot.delete(id); one(index); return; }
    persistent.get(id)?.(index);
  };
}

/** True when the native iOS shell can present a Liquid Glass action sheet. */
export function nativeMenuAvailable(): boolean {
  if (typeof window === "undefined" || !hasNativeTabBar()) return false;
  const w = window as WebkitWindow;
  return Boolean(w.webkit?.messageHandlers?.nativeMenu);
}

/** True when the native shell can host anchored pull-down menus. */
export function nativeAnchorMenuAvailable(): boolean {
  if (typeof window === "undefined" || !hasNativeTabBar()) return false;
  const w = window as WebkitWindow;
  return Boolean(w.webkit?.messageHandlers?.nativeAnchorMenu);
}

/**
 * Present a native iOS action sheet (real system Liquid Glass) and resolve with
 * the chosen item index, or -1 if cancelled.
 */
export function presentNativeMenu(spec: NativeMenuSpec): Promise<number> {
  return new Promise((resolve) => {
    if (!nativeMenuAvailable()) { resolve(-1); return; }
    ensureResultHandler();
    const id = `m${Date.now()}_${counter++}`;
    oneShot.set(id, resolve);
    const w = window as WebkitWindow;
    w.webkit!.messageHandlers!.nativeMenu!.postMessage({ id, ...spec });
  });
}

/**
 * Register/refresh a native pull-down menu anchored to a web element's rect.
 * The native shell overlays a transparent button there with a UIMenu; tapping
 * it shows the real iOS Liquid Glass menu. `onSelect` fires with the item index.
 * Call `removeAnchorMenu(id)` (or use the returned cleanup) when the anchor goes
 * away. Safe to call repeatedly to update the rect/items.
 */
export function postAnchorMenu(
  id: string,
  rect: AnchorRect,
  items: NativeMenuItem[],
  onSelect: (index: number) => void,
  title?: string,
): void {
  if (!nativeAnchorMenuAvailable()) return;
  ensureResultHandler();
  persistent.set(id, onSelect);
  const w = window as WebkitWindow;
  w.webkit!.messageHandlers!.nativeAnchorMenu!.postMessage({ id, rect, items, title });
}

/** Remove a previously-registered anchored menu. */
export function removeAnchorMenu(id: string): void {
  persistent.delete(id);
  if (!nativeAnchorMenuAvailable()) return;
  const w = window as WebkitWindow;
  w.webkit!.messageHandlers!.nativeAnchorMenu!.postMessage({ id, remove: true });
}

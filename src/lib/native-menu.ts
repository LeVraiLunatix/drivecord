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

type WebkitWindow = Window & {
  __drivecordMenuResult?: (id: string, index: number) => void;
  webkit?: { messageHandlers?: { nativeMenu?: { postMessage: (msg: unknown) => void } } };
};

let counter = 0;
const pending = new Map<string, (index: number) => void>();

function ensureResultHandler() {
  const w = window as WebkitWindow;
  if (w.__drivecordMenuResult) return;
  w.__drivecordMenuResult = (id: string, index: number) => {
    const cb = pending.get(id);
    if (cb) { pending.delete(id); cb(index); }
  };
}

/** True when the native iOS shell can present a Liquid Glass action sheet. */
export function nativeMenuAvailable(): boolean {
  if (typeof window === "undefined" || !hasNativeTabBar()) return false;
  const w = window as WebkitWindow;
  return Boolean(w.webkit?.messageHandlers?.nativeMenu);
}

/**
 * Present a native iOS action sheet (real system Liquid Glass) and resolve with
 * the chosen item index, or -1 if cancelled. Falls back to -1 if the native
 * bridge isn't available (callers should check nativeMenuAvailable() first).
 */
export function presentNativeMenu(spec: NativeMenuSpec): Promise<number> {
  return new Promise((resolve) => {
    if (!nativeMenuAvailable()) { resolve(-1); return; }
    ensureResultHandler();
    const id = `m${Date.now()}_${counter++}`;
    pending.set(id, resolve);
    const w = window as WebkitWindow;
    w.webkit!.messageHandlers!.nativeMenu!.postMessage({ id, ...spec });
  });
}

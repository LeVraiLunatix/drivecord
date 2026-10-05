"use client";

import * as React from "react";
import { IS_DESKTOP } from "@/lib/api-base";
import { b64encode } from "@/lib/crypto/e2ee";
import { getDriveKeyMaterial } from "@/lib/e2ee-client/drive-keys";
import { useAllDrives } from "@/lib/storage";
import { tauriInvoke } from "@/lib/use-platform";
import { useKeyring } from "./use-keyring";

/**
 * Windows app only. The folder-sync engine (Rust) can't open end-to-end
 * encrypted drives on its own — their keys are wrapped by the Master Key, which
 * only exists here once the storage is unlocked. Hand the drive keys over
 * (`sync_set_drive_keys`); the engine keeps them in the OS keychain-protected
 * store so sync also runs after a reboot, until sign-out.
 */
export function DesktopDriveKeysBridge() {
  const { status } = useKeyring();
  const drives = useAllDrives();
  const sent = React.useRef("");

  React.useEffect(() => {
    if (!IS_DESKTOP || status !== "unlocked" || !drives) return;
    const e2ee = drives.filter((d) => (d.e2eeVersion ?? 0) >= 1 && d.dkWrapped);
    const signature = e2ee.map((d) => d.id).sort().join(",");
    if (!signature || signature === sent.current) return;
    let cancelled = false;
    (async () => {
      const keys: Record<string, string> = {};
      for (const d of e2ee) {
        try {
          keys[d.id] = b64encode((await getDriveKeyMaterial(d)).raw);
        } catch {
          /* drive key not openable — skip it */
        }
      }
      if (cancelled || Object.keys(keys).length === 0) return;
      try {
        await tauriInvoke("sync_set_drive_keys", { keys });
        sent.current = signature;
      } catch (err) {
        console.warn("[sync] clés de drive non transmises :", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, drives]);

  return null;
}

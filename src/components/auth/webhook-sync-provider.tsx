"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { syncWebhooksFromServer } from "@/lib/auth/sync";

type SyncState = { synced: boolean };

const WebhookSyncContext = React.createContext<SyncState>({ synced: false });

/** Whether the initial webhook sync has settled (or there's nothing to sync). */
export function useWebhookSync(): SyncState {
  return React.useContext(WebhookSyncContext);
}

/**
 * Silently syncs server webhooks into local IndexedDB once per session load,
 * and exposes `synced` so consumers (e.g. the drive page) can wait for it
 * before deciding to show "add a webhook" — otherwise a freshly logged-in user
 * gets bounced to /setup before their drives arrive.
 */
export function WebhookSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [synced, setSynced] = React.useState(false);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (status === "loading" || ran.current) return;
    ran.current = true;
    if (status === "authenticated") {
      syncWebhooksFromServer()
        .catch(() => {
          // Non-fatal: user just won't have server webhooks pre-loaded.
        })
        .finally(() => setSynced(true));
    } else {
      // Logged-out: nothing to pull, local drives are authoritative.
      setSynced(true);
    }
  }, [status]);

  return (
    <WebhookSyncContext.Provider value={{ synced }}>
      {children}
    </WebhookSyncContext.Provider>
  );
}

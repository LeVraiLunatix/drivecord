"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { syncWebhooksFromServer } from "@/lib/auth/sync";

type SyncState = { synced: boolean };

const WebhookSyncContext = React.createContext<SyncState>({ synced: false });

/** Whether the webhook sync for the CURRENT account has settled. */
export function useWebhookSync(): SyncState {
  return React.useContext(WebhookSyncContext);
}

/**
 * Syncs server webhooks into local IndexedDB, re-running whenever the signed-in
 * account changes (not just once per load) — otherwise switching accounts leaves
 * the new account's drives unsynced and the page stuck. Exposes `synced` so the
 * drive page can wait before deciding to show "add a webhook".
 */
export function WebhookSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, status } = useSession();
  const account = data?.user?.email ?? null;
  const [synced, setSynced] = React.useState(false);
  const syncedFor = React.useRef<string | null | undefined>(undefined);

  React.useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && account) {
      if (syncedFor.current === account) return; // already synced this account
      syncedFor.current = account;
      setSynced(false);
      syncWebhooksFromServer()
        .catch(() => {
          // Non-fatal: user just won't have server webhooks pre-loaded.
        })
        .finally(() => setSynced(true));
    } else {
      // Logged-out: nothing to pull; reset so the next sign-in re-syncs.
      syncedFor.current = null;
      setSynced(true);
    }
  }, [status, account]);

  return (
    <WebhookSyncContext.Provider value={{ synced }}>
      {children}
    </WebhookSyncContext.Provider>
  );
}

"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { syncWebhooksFromServer } from "@/lib/auth/sync";

/**
 * Silently syncs server webhooks into local IndexedDB once per session load.
 * Runs in the background — no loading state exposed to the UI.
 */
export function WebhookSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const synced = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated" || synced.current) return;
    synced.current = true;
    syncWebhooksFromServer().catch(() => {
      // Non-fatal: user just won't have server webhooks pre-loaded.
    });
  }, [status]);

  return <>{children}</>;
}

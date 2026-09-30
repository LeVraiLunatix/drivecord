"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useWebhookSync } from "@/components/auth/webhook-sync-provider";
import { finishSetup } from "@/lib/e2ee-client/keyring";
import { migrateAllDrives } from "@/lib/e2ee-client/drive-keys";
import { encryptPlainFolderNames } from "@/lib/e2ee-client/convert";
import { db } from "@/lib/storage/db";
import { IncomingTransfers } from "./incoming-transfers";
import { Onboarding } from "./onboarding";
import { UnlockScreen } from "./unlock-screen";
import { useKeyring } from "./use-keyring";

/**
 * Wraps the pages that touch files. Until the keyring is unlocked it shows the onboarding
 * (first time) or the unlock screen; once unlocked it migrates any legacy drive and renders the app.
 */
export function E2eeGate({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useSession();
  const { status, error, setupInProgress } = useKeyring();
  const { synced } = useWebhookSync();
  const [migrated, setMigrated] = React.useState(false);

  // Legacy drives (server-held key) are moved under the Master Key as soon as we can.
  React.useEffect(() => {
    if (status !== "unlocked" || !synced || migrated) return;
    let cancelled = false;
    migrateAllDrives()
      .then(async (n) => {
        // Folders created before E2EE still have plaintext names on the server: encrypt them once per drive.
        for (const d of await db().drives.toArray()) {
          const flag = `drivecord:folder-names-encrypted:${d.id}`;
          try {
            if (localStorage.getItem(flag)) continue;
            await encryptPlainFolderNames(d.id);
            localStorage.setItem(flag, "1");
          } catch {
            /* retried at the next unlock */
          }
        }
        return n;
      })
      .then((n) => {
        if (n > 0 && !cancelled) toast.success(`${n} drive${n > 1 ? "s" : ""} passé${n > 1 ? "s" : ""} en chiffrement de bout en bout.`);
      })
      .catch((e) => !cancelled && toast.error(`Migration du chiffrement impossible : ${(e as Error).message}`))
      .finally(() => !cancelled && setMigrated(true));
    return () => { cancelled = true; };
  }, [status, synced, migrated]);

  // Session still loading: don't render the app yet — its first fetches would run before the keys
  // are unlocked and cache "unreadable" names.
  if (authStatus === "loading") {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  // Not signed in: nothing to guard here, the page's own auth logic applies.
  if (authStatus !== "authenticated") return <>{children}</>;

  if (setupInProgress) return <Onboarding onDone={finishSetup} />;
  if (status === "idle" || status === "loading") {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (status === "error") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 text-center text-sm text-destructive">
        Impossible de charger tes clés de chiffrement : {error}
      </div>
    );
  }
  if (status === "locked" || status === "needs-setup") return <UnlockScreen />;
  if (!migrated && synced) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  return (
    <>
      {children}
      <IncomingTransfers />
    </>
  );
}

"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { initKeyring, reset } from "@/lib/e2ee-client/keyring";
import { clearDriveKeyCache } from "@/lib/e2ee-client/drive-keys";
import { clearFileKeyCache } from "@/lib/e2ee-client/file-crypto";

/**
 * Loads the account's key material once signed in (and tries a silent unlock on a
 * trusted device), and forgets every key when the user signs out or switches account.
 */
export function E2eeProvider({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();
  const userId = data?.user?.id ?? null;
  const full = (data as { level?: string } | null)?.level === "full";

  React.useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated" && userId && full) {
      void initKeyring(userId);
    } else {
      reset();
      clearDriveKeyCache();
      clearFileKeyCache();
    }
  }, [status, userId, full]);

  return <>{children}</>;
}

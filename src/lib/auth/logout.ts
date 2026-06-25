"use client";

import { signOut } from "next-auth/react";
import { mutate } from "swr";
import { wipeLocalDrives } from "@/lib/storage/drives";

/**
 * Thorough sign-out: clears the SWR cache and all local drive data before
 * ending the session, so the next account starts from a clean slate
 * (no leftover webhooks / files from the previous account).
 */
export async function fullSignOut(): Promise<void> {
  // Drop every SWR cache entry (no revalidation).
  await mutate(() => true, undefined, { revalidate: false }).catch(() => {});
  // Wipe local IndexedDB drives + active selection.
  await wipeLocalDrives().catch(() => {});
  // Let next-auth clear the session cookie AND navigate in one shot. Doing the
  // redirect ourselves (window.location) used to race the session state: "/"
  // could load while still "authenticated" and bounce the user to /setup.
  await signOut({ redirectTo: "/" });
}

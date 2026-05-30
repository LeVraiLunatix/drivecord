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
  await mutate(() => true, undefined, { revalidate: false });
  // Wipe local IndexedDB drives + active selection.
  await wipeLocalDrives().catch(() => {});
  // End the session.
  await signOut({ callbackUrl: "/" });
}

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
  // Clear the session cookie FIRST (await → the signout request, with its
  // Set-Cookie, has completed), THEN hard-navigate to /login. We use
  // `replace`, not `href`, so the protected page we're leaving (/drive, …) is
  // dropped from the history stack — otherwise the browser Back button restores
  // it from the bfcache as a stale "logged-in" snapshot. The BfcacheAuthGuard
  // (mounted in the layout) catches any other bfcache-restored protected page.
  await signOut({ redirect: false }).catch(() => {});
  window.location.replace("/login");
}

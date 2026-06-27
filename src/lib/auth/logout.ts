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
  // Set-Cookie, has completed), THEN do a hard navigation to /login. Targeting
  // /login (not "/") avoids the home gate, which reads the client session state
  // and used to bounce to /drive while the sign-out was still settling — that
  // was the "need to click twice to log out" bug. A hard nav also guarantees a
  // fresh SessionProvider with the cookie already gone.
  await signOut({ redirect: false }).catch(() => {});
  window.location.href = "/login";
}

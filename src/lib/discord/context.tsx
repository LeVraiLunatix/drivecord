"use client";

import * as React from "react";
import { DiscordClient } from "./client";
import { useActiveDrive } from "@/lib/storage";

/**
 * React context exposing a DiscordClient bound to the currently-active drive.
 *
 * The client is automatically reconstructed when the active drive changes.
 * Components inside the provider use `useDiscordClient()` to access it.
 */

const Ctx = React.createContext<DiscordClient | null>(null);

export function DiscordClientProvider({ children }: { children: React.ReactNode }) {
  const drive = useActiveDrive();
  const client = React.useMemo(() => {
    if (!drive) return null;
    try {
      return DiscordClient.fromUrl(drive.webhookUrl);
    } catch {
      return null;
    }
  }, [drive?.id, drive?.webhookUrl]);

  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

/** Returns the DiscordClient for the active drive, or null if none active. */
export function useDiscordClient(): DiscordClient | null {
  return React.useContext(Ctx);
}

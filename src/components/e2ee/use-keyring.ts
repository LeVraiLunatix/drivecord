"use client";

import * as React from "react";
import {
  getKeyringSnapshot,
  getServerSnapshot,
  subscribeKeyring,
  type KeyringSnapshot,
} from "@/lib/e2ee-client/keyring";

export function useKeyring(): KeyringSnapshot {
  return React.useSyncExternalStore(subscribeKeyring, getKeyringSnapshot, getServerSnapshot);
}

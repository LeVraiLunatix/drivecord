"use client";

import { useSyncExternalStore } from "react";
import { formatDateTimeUtc } from "@/lib/format";
import { formatLocalAndUtc } from "@/lib/format-time";

const subscribe = () => () => {};

/**
 * A moment shown in the visitor's own time zone, with UTC next to it. The server (and the first client
 * render) only knows UTC, so both agree; the local time replaces it right after hydration.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatLocalAndUtc(iso),
    () => formatDateTimeUtc(iso),
  );
  return <time dateTime={iso}>{text}</time>;
}

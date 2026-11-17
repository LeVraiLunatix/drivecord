"use client";

import * as React from "react";
import { useUploadQueue } from "@/lib/upload-queue";

/** Progression globale des envois en cours (0–100) et leur nombre, ou null s'il n'y en a pas. */
export function useUploadPercent(): { count: number; percent: number } | null {
  const items = useUploadQueue((s) => s.items);
  return React.useMemo(() => {
    const live = items.filter((i) => i.status === "pending" || i.status === "uploading");
    if (live.length === 0) return null;
    let total = 0;
    let loaded = 0;
    for (const i of items) {
      if (i.status === "error" || i.status === "cancelled") continue;
      const size = Math.max(1, i.fileSize);
      total += size;
      if (i.status === "done") loaded += size;
      else if (i.progress) loaded += Math.min(size, (i.progress.loaded / Math.max(1, i.progress.total)) * size);
    }
    return { count: live.length, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 };
  }, [items]);
}

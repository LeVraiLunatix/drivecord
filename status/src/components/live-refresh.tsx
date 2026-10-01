"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 45_000;

/** Quietly re-renders the page when a newer probe cycle exists. Renders nothing. */
export function LiveRefresh({ checkedAt }: { checkedAt: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/status/summary", { signal: AbortSignal.timeout(8000) });
        const json = (await res.json()) as { page?: { updatedAt?: string | null } };
        if (!cancelled && json.page?.updatedAt && json.page.updatedAt !== checkedAt) router.refresh();
      } catch {
        /* the server-rendered content stays as it is; try again later */
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkedAt, router]);
  return null;
}

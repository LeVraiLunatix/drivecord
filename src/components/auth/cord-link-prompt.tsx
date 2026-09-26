"use client";

import * as React from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { apiFetcher } from "@/lib/api-base";
import { CordLogo, linkCordAccount, useCordEnabled, type CordAccountInfo } from "@/components/auth/cord-account";

const KEY = (userId: string) => `drivecord:cord-link-prompt:${userId}`;
const noopSubscribe = () => () => {};

function isDone(userId: string): boolean {
  try {
    return localStorage.getItem(KEY(userId)) !== null;
  } catch {
    return true; // no storage → don't nag on every visit
  }
}

function markDone(userId: string, how: "dismissed" | "linking") {
  try {
    localStorage.setItem(KEY(userId), how);
  } catch {
    /* private mode */
  }
}

/**
 * One-time, dismissible banner in the drive for accounts without Compte Cord:
 * link it (same flow as Settings › Compte Cord). Never shown again once
 * dismissed or used; Settings keeps the option.
 */
export function CordLinkPrompt() {
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const full = session?.level === "full";
  const enabled = useCordEnabled();
  const { data: account } = useSWR<CordAccountInfo>(
    enabled && full && userId ? "/api/account" : null,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  // localStorage is client-only: "done" on the server, read after hydration.
  const done = React.useSyncExternalStore(
    noopSubscribe,
    () => (userId ? isDone(userId) : true),
    () => true,
  );
  const [dismissed, setDismissed] = React.useState(false);

  const visible = Boolean(enabled && full && userId && account && !account.cord && !done && !dismissed);

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="cord-link"
          role="region"
          aria-label="Associer ton Compte Cord"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mb-3 overflow-hidden"
        >
          <div className="relative overflow-hidden rounded-xl border border-[#8F4DEE]/30 bg-gradient-to-r from-[#6E58F0]/12 via-card/80 to-[#B842EC]/12 p-3 backdrop-blur-xl sm:p-4">
            <div className="flex items-center gap-3 pr-7">
              <CordLogo className="size-9 shrink-0 rounded-lg ring-1 ring-white/20" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Relie ton Compte Cord</p>
                <p className="text-xs text-muted-foreground">
                  Une identité pour toute la suite, 2FA et passkeys gérés par Cord. Tes drives ne bougent pas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (userId) markDone(userId, "linking");
                  linkCordAccount();
                }}
                className="hidden shrink-0 rounded-lg bg-gradient-to-r from-[#6E58F0] to-[#B842EC] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-[#8F4DEE]/25 transition hover:opacity-95 sm:block"
              >
                Associer
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (userId) markDone(userId, "linking");
                linkCordAccount();
              }}
              className="mt-3 w-full rounded-lg bg-gradient-to-r from-[#6E58F0] to-[#B842EC] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-[#8F4DEE]/25 sm:hidden"
            >
              Associer mon Compte Cord
            </button>
            <button
              type="button"
              aria-label="Ne plus proposer"
              title="Ne plus proposer"
              onClick={() => {
                if (userId) markDone(userId, "dismissed");
                setDismissed(true);
              }}
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

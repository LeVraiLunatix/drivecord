"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { HardDrive, Lock, Images, Link2, Settings, type LucideIcon } from "lucide-react";
import { useIsNativeApp } from "@/lib/use-platform";
import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Returns true if this tab is the active one for the current location. */
  isActive: (pathname: string, section: string | null) => boolean;
};

const TABS: Tab[] = [
  {
    id: "files", label: "Fichiers", icon: HardDrive, href: "/drive",
    isActive: (p, s) => p.startsWith("/drive") && s !== "vault",
  },
  {
    id: "vault", label: "Coffre", icon: Lock, href: "/drive?section=vault",
    isActive: (p, s) => p.startsWith("/drive") && s === "vault",
  },
  {
    id: "backup", label: "Pellicule", icon: Images, href: "/backup",
    isActive: (p) => p.startsWith("/backup"),
  },
  {
    id: "shares", label: "Partagés", icon: Link2, href: "/shares",
    isActive: (p) => p.startsWith("/shares"),
  },
  {
    id: "settings", label: "Réglages", icon: Settings, href: "/settings",
    isActive: (p) => p.startsWith("/settings") || p.startsWith("/stats"),
  },
];

// Pages where the tab bar should NOT appear (auth / public / onboarding).
const HIDDEN_PREFIXES = ["/login", "/register", "/setup", "/s/", "/install", "/conditions", "/native"];

function TabBarInner() {
  const native = useIsNativeApp();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const section = search.get("section");

  if (!native) return null;
  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="mx-auto flex max-w-xl items-stretch justify-around border-t border-white/10 px-1"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0) 60%), rgba(12,12,20,0.55)",
          backdropFilter: "blur(32px) saturate(190%)",
          WebkitBackdropFilter: "blur(32px) saturate(190%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
        }}
      >
        {TABS.map((tab) => {
          const active = tab.isActive(pathname, section);
          return (
            <button
              key={tab.id}
              onClick={() => router.push(tab.href)}
              className="relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5"
            >
              <motion.span
                animate={{ scale: active ? 1 : 0.92 }}
                whileTap={{ scale: 0.8 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="relative flex size-7 items-center justify-center"
              >
                {active && (
                  <motion.span
                    layoutId="tab-glow"
                    className="absolute inset-0 -m-1.5 rounded-full bg-primary/20"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <tab.icon
                  className={cn("relative size-[22px] transition-colors", active ? "text-primary" : "text-white/55")}
                  strokeWidth={active ? 2.4 : 2}
                />
              </motion.span>
              <span className={cn("text-[10px] font-medium transition-colors", active ? "text-primary" : "text-white/55")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AppTabBar() {
  // useSearchParams requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <TabBarInner />
    </React.Suspense>
  );
}

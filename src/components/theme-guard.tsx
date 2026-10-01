"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { useTier } from "@/components/patreon/tier";

/** Thèmes Patreon → palier minimum. Source unique (réglages + garde). */
export const EXCLUSIVE_THEMES: Record<string, 1 | 2 | 3> = {
  aurora: 2,
  "or-nocturne": 3,
};

/**
 * Un thème Patreon est stocké dans localStorage, donc il survivrait à la
 * déconnexion (et s'afficherait sur l'accueil public). Ici on le retire dès que
 * la session est terminée ou que le palier ne suffit plus.
 */
export function ThemeGuard() {
  const { theme, setTheme } = useTheme();
  const { status } = useSession();
  const { tier, isLoading } = useTier();

  React.useEffect(() => {
    if (!theme) return;
    const min = EXCLUSIVE_THEMES[theme];
    if (!min) return;
    if (status === "unauthenticated") setTheme("dark");
    else if (status === "authenticated" && !isLoading && tier < min) setTheme("dark");
  }, [theme, status, tier, isLoading, setTheme]);

  return null;
}

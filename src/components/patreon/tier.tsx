"use client";

/**
 * Primitives Patreon côté client : badge de palier, hook de lecture du palier,
 * et « gate » cosmétique.
 *
 * ⚠️ Règle produit : Drivecord reste GRATUIT et ILLIMITÉ pour tout le monde.
 * `TierGate` ne doit JAMAIS masquer une fonction de base — uniquement des bonus
 * (thème exclusif en plus, aperçu d'une feature en accès anticipé, etc.).
 */
import * as React from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PatreonTier = 0 | 1 | 2 | 3;

export const TIER_META: Record<
  number,
  { label: string; emoji: string; className: string }
> = {
  1: {
    label: "Gold",
    emoji: "🥇",
    className: "border-transparent bg-amber-400/20 text-amber-600 dark:text-amber-300",
  },
  2: {
    label: "Premium",
    emoji: "💎",
    className: "border-transparent bg-sky-400/20 text-sky-600 dark:text-sky-300",
  },
  3: {
    label: "VIP",
    emoji: "⭐",
    className:
      "border-transparent bg-gradient-to-r from-amber-400/25 to-fuchsia-500/25 text-fuchsia-600 dark:text-fuchsia-300",
  },
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Palier Patreon courant (live via /api/account/patreon). */
export function useTier(): { tier: PatreonTier; linked: boolean; isLoading: boolean } {
  const { data, isLoading } = useSWR("/api/account/patreon", fetcher, {
    revalidateOnFocus: false,
  });
  return {
    tier: (data?.tier ?? 0) as PatreonTier,
    linked: Boolean(data?.linked),
    isLoading,
  };
}

/** Badge coloré du palier. Ne rend rien pour le palier 0 (gratuit). */
export function TierBadge({
  tier,
  className,
}: {
  tier: PatreonTier;
  className?: string;
}) {
  const meta = TIER_META[tier];
  if (!tier || !meta) return null;
  return (
    <Badge className={cn("gap-1", meta.className, className)}>
      {meta.emoji} {meta.label}
    </Badge>
  );
}

/**
 * Affiche `children` seulement si le palier courant est >= `min` (héritage
 * automatique). COSMÉTIQUE uniquement — voir l'avertissement en tête de fichier.
 */
export function TierGate({
  min,
  children,
  fallback = null,
}: {
  min: PatreonTier;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { tier } = useTier();
  return <>{tier >= min ? children : fallback}</>;
}

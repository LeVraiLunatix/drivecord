"use client";

import * as React from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Heart, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { TierBadge, TIER_META, type PatreonTier } from "@/components/patreon/tier";
import { cn } from "@/lib/utils";

type Supporter = { name: string; image: string | null; tier: PatreonTier };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

function Avatar({ s, size }: { s: Supporter; size: number }) {
  const initial = s.name.charAt(0).toUpperCase();
  return s.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={s.image}
      alt=""
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

export default function SupportersPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const { data, isLoading } = useSWR<{ supporters: Supporter[] }>(
    "/api/supporters",
    fetcher,
    { revalidateOnFocus: false },
  );

  const all = data?.supporters ?? [];
  const vip = all.filter((s) => s.tier === 3);
  const premium = all.filter((s) => s.tier === 2);
  const gold = all.filter((s) => s.tier === 1);

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-8 tabbar-pad px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/drive" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <Heart className="size-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Nos mécènes</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Un immense merci aux personnes qui font vivre Drivecord 💜 Le projet
          reste gratuit et illimité pour tout le monde grâce à elles.
        </p>
        <div className="pt-1">
          <Button asChild size="sm" className="gap-2">
            <a href="/patreon" target="_blank" rel="noopener noreferrer">
              Devenir mécène
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </motion.header>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && all.length === 0 && (
        <motion.p
          variants={v ?? item}
          className="py-10 text-center text-sm text-muted-foreground"
        >
          Sois le premier à rejoindre l&apos;aventure ✨
        </motion.p>
      )}

      {/* VIP — mis en avant en haut */}
      {vip.length > 0 && (
        <motion.section variants={v ?? item} className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg">{TIER_META[3].emoji}</span>
            <h2 className="text-lg font-semibold">{TIER_META[3].label}</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-5">
            {vip.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "flex w-32 flex-col items-center gap-2 rounded-xl border p-4 text-center",
                  "border-amber-400/30 bg-gradient-to-b from-amber-400/10 to-fuchsia-500/5",
                )}
              >
                <Avatar s={s} size={64} />
                <span className="line-clamp-1 text-sm font-semibold">{s.name}</span>
                <TierBadge tier={s.tier} />
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Premium & Gold — grilles groupées */}
      {[premium, gold].map((group, gi) => {
        if (group.length === 0) return null;
        const tier = (gi === 0 ? 2 : 1) as PatreonTier;
        return (
          <motion.section key={tier} variants={v ?? item} className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span>{TIER_META[tier].emoji}</span>
              <h2 className="text-base font-semibold text-muted-foreground">
                {TIER_META[tier].label}
              </h2>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {group.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-border/50 bg-background/40 py-1.5 pl-1.5 pr-3"
                >
                  <Avatar s={s} size={28} />
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
              ))}
            </div>
          </motion.section>
        );
      })}
    </motion.div>
  );
}

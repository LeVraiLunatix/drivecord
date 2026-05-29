"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  CloudUpload,
  ArrowRight,
  Lock,
  Infinity as InfinityIcon,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import DarkVeil from "@/components/ui/dark-veil";
import { BetaBanner } from "@/components/beta-banner";

/**
 * Dedicated home screen for the NATIVE APP (logged-out users).
 * Unlike the web marketing landing, this is a focused, single-screen welcome:
 * logo, tagline, a few highlights, and sign-in CTAs — like a real app launch.
 */

const highlights = [
  { icon: InfinityIcon, label: "Stockage illimité" },
  { icon: Lock, label: "Chiffré E2EE" },
  { icon: Smartphone, label: "App native" },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export function AppHome() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/* Animated background */}
      <DarkVeil
        className="-z-10"
        hueShift={0}
        speed={0.4}
        warpAmount={0.5}
        noiseIntensity={0.02}
        resolutionScale={0.75}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-gradient-to-t from-background via-background/80 to-transparent" />

      {/* Beta banner (top) + theme toggle */}
      <BetaBanner />
      <div className="flex justify-end px-3 pt-2">
        <ThemeToggle />
      </div>

      {/* Centered content */}
      <motion.div
        variants={v ?? container}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col items-center justify-center px-7 pt-2 text-center"
      >
        {/* Logo mark */}
        <motion.div variants={v ?? item} className="mb-6">
          <motion.div
            animate={reduce ? {} : { y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-2xl shadow-violet-500/30"
          >
            <CloudUpload className="size-10 text-white" />
          </motion.div>
        </motion.div>

        <motion.h1
          variants={v ?? item}
          className="font-mono text-3xl font-bold tracking-tight"
        >
          drivecord
        </motion.h1>

        <motion.p
          variants={v ?? item}
          className="mt-3 max-w-xs text-balance text-base text-muted-foreground"
        >
          Ton cloud{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text font-medium text-transparent">
            illimité
          </span>
          , propulsé par Discord.
        </motion.p>

        {/* Highlights */}
        <motion.div variants={v ?? item} className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {highlights.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
            >
              <Icon className="size-3.5 text-primary" />
              {label}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Bottom CTAs — pinned, safe-area aware */}
      <motion.div
        variants={v ?? container}
        initial="hidden"
        animate="show"
        className="px-6"
        style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
      >
        <motion.div variants={v ?? item}>
          <Button asChild size="lg" className="group h-13 w-full gap-2 text-base">
            <Link href="/register">
              Créer un compte
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </motion.div>
        <motion.div variants={v ?? item} className="mt-3">
          <Button asChild size="lg" variant="outline" className="h-13 w-full text-base">
            <Link href="/login">Se connecter</Link>
          </Button>
        </motion.div>
        <motion.p variants={v ?? item} className="mt-4 text-center text-xs text-muted-foreground/60">
          Aucune carte bancaire · Local-first
        </motion.p>
      </motion.div>
    </div>
  );
}

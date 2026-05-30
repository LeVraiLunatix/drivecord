"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  CloudUpload,
  Lock,
  Share2,
  Smartphone,
  Sparkles,
  Zap,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import DarkVeil from "@/components/ui/dark-veil";
import { BetaBanner } from "@/components/beta-banner";

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  { icon: Zap, title: "Upload parallèle", description: "Découpage automatique en chunks, upload simultané. Transferts ultra-rapides, sans limite de taille." },
  { icon: Lock, title: "Chiffrement E2EE", description: "AES-256-GCM côté client. Tes fichiers sont chiffrés avant même de quitter ton appareil." },
  { icon: Share2, title: "Partage avancé", description: "Liens publics avec mot de passe, expiration et compteur de téléchargements." },
  { icon: CloudUpload, title: "Preview streaming", description: "Vidéo, PDF, audio, images directement dans l'app — même les .mov et HEIC." },
  { icon: Smartphone, title: "App native iOS", description: "Vraie app installable. Sync multi-appareils — mêmes fichiers partout." },
  { icon: Sparkles, title: "UI moderne", description: "Mode sombre, drag & drop, recherche instantanée, dossiers, tags et favoris." },
];

const steps = [
  { n: "01", title: "Crée un webhook Discord", description: "Paramètres d'un salon → Intégrations → Webhooks. Gratuit, aucun bot requis." },
  { n: "02", title: "Connecte-le à Drivecord", description: "On hash l'URL localement pour créer ton drive. Rien n'est envoyé à un serveur tiers." },
  { n: "03", title: "Upload & partage", description: "Glisse tes fichiers, organise par dossiers, partage par lien. Tes données restent sur Discord." },
];

// ── Animation variants ────────────────────────────────────────────────────────

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const reveal: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Landing() {
  const reduce = useReducedMotion();

  // Disable transforms when the user prefers reduced motion.
  const v = reduce ? {} : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* ── Beta banner ── */}
      <BetaBanner />

      {/* ── Nav ── */}
      <motion.header
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight">
            <CloudUpload className="size-5 text-primary" />
            drivecord
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Connexion</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/register">
                Commencer
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </motion.header>

      <main className="flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-5 py-20 text-center sm:py-28">
          <DarkVeil
            className="-z-10"
            hueShift={0}
            speed={0.4}
            warpAmount={0.5}
            noiseIntensity={0.02}
            resolutionScale={0.75}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-background to-transparent" />

          <motion.div
            variants={v ?? container}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center gap-6"
          >
            <motion.div variants={v ?? item}>
              <Badge variant="secondary" className="gap-1.5 border border-border/60 font-mono text-xs">
                <motion.span
                  className="size-1.5 rounded-full bg-primary"
                  animate={reduce ? {} : { opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                v0.1 — open beta
              </Badge>
            </motion.div>

            <motion.h1
              variants={v ?? item}
              className="max-w-3xl text-balance text-[2.6rem] font-bold leading-[1.05] tracking-tight sm:text-7xl"
            >
              Ton cloud illimité,{" "}
              <span className="bg-gradient-to-br from-indigo-400 via-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
                propulsé par Discord
              </span>
              .
            </motion.h1>

            <motion.p
              variants={v ?? item}
              className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
            >
              Stockage illimité via webhooks Discord, chiffrement de bout en bout,
              partage par lien et app native — sans serveur, sans abonnement.
            </motion.p>

            <motion.div variants={v ?? item} className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="group w-full gap-2 px-6 sm:w-auto">
                <Link href="/register">
                  Créer un compte gratuit
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full gap-2 px-6 sm:w-auto">
                <Link href="/login">Se connecter</Link>
              </Button>
            </motion.div>

            <motion.p variants={v ?? item} className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <ShieldCheck className="size-3.5" />
              Aucune carte bancaire · Open source
            </motion.p>

            {/* Install app CTA */}
            <motion.div variants={v ?? item}>
              <Link
                href="/install"
                className="group flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card"
              >
                <Smartphone className="size-4 text-primary" />
                <span className="font-medium">Installer l&apos;app iPhone</span>
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t border-border/40 bg-card/20 px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <SectionHeading kicker="Comment ça marche" title="Prêt en 3 étapes" />
            <motion.div
              variants={v ?? container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              className="grid gap-4 sm:grid-cols-3"
            >
              {steps.map((s) => (
                <motion.div
                  key={s.n}
                  variants={v ?? item}
                  className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-6"
                >
                  <span className="mb-3 block font-mono text-4xl font-bold text-primary/15">{s.n}</span>
                  <h3 className="mb-2 font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <SectionHeading kicker="Fonctionnalités" title="Tout ce dont tu as besoin" />
            <motion.div
              variants={v ?? container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {features.map(({ icon: Icon, title, description }) => (
                <motion.div
                  key={title}
                  variants={v ?? item}
                  whileHover={reduce ? {} : { y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="group rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-primary/40 hover:bg-card/80"
                >
                  <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-border/40 bg-card/20 px-5 py-20 sm:px-6">
          <motion.div
            variants={v ?? reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Commence maintenant</h2>
            <p className="mb-8 text-muted-foreground">
              Un webhook Discord suffit. Aucune installation, aucune config serveur.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group w-full gap-2 px-8 sm:w-auto">
                <Link href="/register">
                  Créer un compte
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="w-full gap-2 sm:w-auto">
                <Link href="https://github.com/LeVraiLunatix/discloud" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Code source
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground/60 sm:flex-row sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/conditions" className="hover:text-foreground">Conditions & mentions légales</Link>
            <Link
              href="https://github.com/LeVraiLunatix/discloud"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              Code source
            </Link>
          </nav>
          <p>
            <Link href="/" className="font-mono hover:text-foreground">drivecord</Link> · open source
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="mb-12 text-center"
    >
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{kicker}</p>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
    </motion.div>
  );
}

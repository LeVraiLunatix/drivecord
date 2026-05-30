"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  Smartphone,
  Download,
  Link2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";

const SOURCE_URL =
  "https://raw.githubusercontent.com/LeVraiLunatix/drivecord-releases/main/source.json";

const IPA_URL =
  "https://github.com/LeVraiLunatix/drivecord-releases/releases/download/ios-latest/Drivecord.ipa";

const RELEASES_URL = "https://github.com/LeVraiLunatix/drivecord-releases/releases";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const steps = [
  {
    icon: Download,
    title: "Installe AltStore",
    body: (
      <>
        AltStore permet d&apos;installer des apps hors App Store. Installe{" "}
        <strong>AltServer</strong> sur ton PC/Mac et <strong>AltStore</strong> sur ton iPhone.
      </>
    ),
    action: { label: "Aller sur altstore.io", href: "https://altstore.io" },
  },
  {
    icon: Link2,
    title: "Ajoute la source Drivecord",
    body: (
      <>
        Dans AltStore → onglet <strong>Sources</strong> → bouton <strong>+</strong> en haut →
        colle l&apos;URL ci-dessous.
      </>
    ),
    source: true,
  },
  {
    icon: Smartphone,
    title: "Installe l'app",
    body: (
      <>
        Onglet <strong>Browse</strong> → trouve <strong>Drivecord</strong> → appuie sur{" "}
        <strong>GET</strong>. Entre ton Apple ID (gratuit) si demandé.
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "Garde l'app active",
    body: (
      <>
        Avec un Apple ID gratuit, l&apos;app expire tous les <strong>7 jours</strong>. AltStore la
        re-signe tout seul si ton PC (AltServer) et ton iPhone sont sur le même Wi-Fi.
      </>
    ),
  },
];

export default function InstallPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SOURCE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-5 pb-16 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-2">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <Smartphone className="size-4" />
          Application iOS
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Installer Drivecord sur iPhone</h1>
        <p className="text-sm text-muted-foreground">
          L&apos;app n&apos;est pas sur l&apos;App Store — elle s&apos;installe via AltStore en
          quelques minutes. C&apos;est gratuit.
        </p>
      </motion.header>

      {/* Direct download */}
      <motion.div
        variants={v ?? item}
        className="rounded-2xl border border-primary/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 p-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Download className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Télécharger la dernière version</h2>
            <p className="text-xs text-muted-foreground">
              Le fichier <code className="font-mono">Drivecord.ipa</code> à sideloader avec AltStore.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="gap-2">
            <a href={IPA_URL}>
              <Download className="size-4" />
              Télécharger Drivecord.ipa
            </a>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              Toutes les versions
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">
          💡 Le plus simple reste d&apos;ajouter la source AltStore (ci-dessous) — l&apos;app se met
          alors à jour toute seule. Le téléchargement direct sert pour une install manuelle.
        </p>
      </motion.div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            variants={v ?? item}
            className="rounded-2xl border border-border/50 bg-card/40 p-5"
          >
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="font-semibold">
                  <span className="mr-1.5 font-mono text-primary/50">{i + 1}.</span>
                  {s.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>

                {s.source && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {SOURCE_URL}
                    </code>
                    <Button size="sm" variant="secondary" className="h-8 shrink-0 gap-1.5" onClick={copy}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copié" : "Copier"}
                    </Button>
                  </div>
                )}

                {s.action && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={s.action.href} target="_blank" rel="noopener noreferrer">
                      {s.action.label}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tip */}
      <motion.div
        variants={v ?? item}
        className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      >
        <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Astuce :</strong> dans l&apos;app, connecte-toi avec
          <strong> Discord</strong> ou <strong>Google</strong> (ça ouvre ton navigateur préféré, tu
          te connectes, puis tu reviens dans l&apos;app), ou crée un mot de passe dans les Paramètres.
        </p>
      </motion.div>

      <motion.div variants={v ?? item} className="flex flex-col items-center gap-2 pt-2 text-center">
        <CheckCircle2 className="size-5 text-green-500" />
        <p className="text-xs text-muted-foreground">
          Une fois installée, l&apos;app se met à jour toute seule depuis AltStore à chaque nouvelle version.
        </p>
        <Button asChild variant="ghost" size="sm" className="mt-1">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}

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
  Usb,
  MousePointerClick,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackButton } from "@/components/back-button";

const SOURCE_URL =
  "https://raw.githubusercontent.com/LeVraiLunatix/drivecord-releases/main/source.json";
const IPA_URL =
  "https://github.com/LeVraiLunatix/drivecord-releases/releases/latest/download/Drivecord.ipa";
const RELEASES_URL = "https://github.com/LeVraiLunatix/drivecord-releases/releases";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

type Step = {
  icon: typeof Download;
  title: string;
  body: React.ReactNode;
  action?: { label: string; href: string };
  source?: boolean;
  download?: boolean;
};

const altstoreSteps: Step[] = [
  {
    icon: Download,
    title: "Installe AltStore",
    body: (
      <>
        Installe <strong>AltServer</strong> sur ton PC/Mac et <strong>AltStore</strong> sur ton
        iPhone. AltStore garde l&apos;app à jour toute seule.
      </>
    ),
    action: { label: "Aller sur altstore.io", href: "https://altstore.io" },
  },
  {
    icon: Link2,
    title: "Ajoute la source Drivecord",
    body: (
      <>
        Dans AltStore → onglet <strong>Sources</strong> → bouton <strong>+</strong> → colle
        l&apos;URL ci-dessous.
      </>
    ),
    source: true,
  },
  {
    icon: Smartphone,
    title: "Installe l'app",
    body: (
      <>
        Onglet <strong>Browse</strong> → <strong>Drivecord</strong> → appuie sur{" "}
        <strong>GET</strong>. Entre ton Apple ID (gratuit) si demandé.
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "Mises à jour automatiques",
    body: (
      <>
        AltStore re-signe l&apos;app tout seul tous les <strong>7 jours</strong> et installe les
        nouvelles versions automatiquement (PC + iPhone sur le même Wi-Fi).
      </>
    ),
  },
];

const sideloadlySteps: Step[] = [
  {
    icon: Download,
    title: "Télécharge l'IPA",
    body: (
      <>
        Récupère le fichier <code className="font-mono text-xs">Drivecord.ipa</code> (dernière
        version) sur ton ordinateur.
      </>
    ),
    download: true,
  },
  {
    icon: Download,
    title: "Installe Sideloadly",
    body: (
      <>
        Télécharge et installe <strong>Sideloadly</strong> sur ton PC (Windows) ou Mac. iTunes et
        iCloud (versions Apple, pas Microsoft Store) sont requis sur Windows.
      </>
    ),
    action: { label: "Aller sur sideloadly.io", href: "https://sideloadly.io" },
  },
  {
    icon: Usb,
    title: "Branche ton iPhone",
    body: (
      <>
        Connecte l&apos;iPhone en USB et fais <strong>« Se fier »</strong> à l&apos;ordinateur.
        Ouvre Sideloadly — ton appareil apparaît en haut.
      </>
    ),
  },
  {
    icon: MousePointerClick,
    title: "Glisse l'IPA + Apple ID",
    body: (
      <>
        Glisse <code className="font-mono text-xs">Drivecord.ipa</code> dans Sideloadly, entre ton{" "}
        <strong>Apple ID</strong>, puis clique <strong>Start</strong>. Entre le mot de passe Apple
        si demandé.
      </>
    ),
  },
  {
    icon: Play,
    title: "Fais confiance à l'app",
    body: (
      <>
        Sur l&apos;iPhone : <strong>Réglages → Général → VPN et gestion de l&apos;appareil</strong> →
        fais confiance à ton profil. L&apos;app s&apos;ouvre alors normalement.
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "À renouveler tous les 7 jours",
    body: (
      <>
        Avec un Apple ID gratuit, l&apos;app expire après <strong>7 jours</strong>. Pour la
        prolonger, refais l&apos;opération avec Sideloadly (pas de re-signature automatique comme
        AltStore).
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

  const renderSteps = (steps: Step[]) => (
    <div className="space-y-3 pt-4">
      {steps.map((s, i) => (
        <div key={s.title} className="rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="font-semibold">
                <span className="mr-1.5 font-mono text-primary/50">{i + 1}.</span>
                {s.title}
              </h3>
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

              {s.download && (
                <Button asChild size="sm" className="gap-1.5">
                  <a href={IPA_URL}>
                    <Download className="size-3.5" />
                    Télécharger Drivecord.ipa
                  </a>
                </Button>
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
        </div>
      ))}
    </div>
  );

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
          L&apos;app n&apos;est pas sur l&apos;App Store. Deux méthodes gratuites :{" "}
          <strong>AltStore</strong> (mises à jour auto) ou <strong>Sideloadly</strong> (install
          manuelle avec l&apos;IPA).
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
            <h2 className="font-semibold">Dernière version</h2>
            <p className="text-xs text-muted-foreground">
              Le fichier <code className="font-mono">Drivecord.ipa</code> (pour Sideloadly ou install manuelle).
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
      </motion.div>

      {/* Two tutorials */}
      <motion.div variants={v ?? item}>
        <Tabs defaultValue="altstore">
          <TabsList className="w-full">
            <TabsTrigger value="altstore" className="flex-1">AltStore</TabsTrigger>
            <TabsTrigger value="sideloadly" className="flex-1">Sideloadly</TabsTrigger>
          </TabsList>

          <TabsContent value="altstore">
            <p className="px-1 pt-3 text-xs text-muted-foreground">
              ✅ Recommandé — l&apos;app se met à jour et se re-signe toute seule.
            </p>
            {renderSteps(altstoreSteps)}
          </TabsContent>

          <TabsContent value="sideloadly">
            <p className="px-1 pt-3 text-xs text-muted-foreground">
              🔧 Install manuelle avec l&apos;IPA — à renouveler tous les 7 jours toi-même.
            </p>
            {renderSteps(sideloadlySteps)}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Tip */}
      <motion.div
        variants={v ?? item}
        className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      >
        <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Astuce :</strong>{" "}
          dans l&apos;app, connecte-toi avec <strong>Discord</strong> ou{" "}
          <strong>Google</strong>{" "}
          (ça ouvre ton navigateur préféré, tu te connectes, puis tu reviens dans
          l&apos;app), ou crée un mot de passe dans les Paramètres.
        </p>
      </motion.div>

      <motion.div variants={v ?? item} className="flex flex-col items-center gap-2 pt-2 text-center">
        <CheckCircle2 className="size-5 text-green-500" />
        <p className="text-xs text-muted-foreground">
          Avec AltStore, l&apos;app se met à jour toute seule à chaque nouvelle version.
        </p>
        <Button asChild variant="ghost" size="sm" className="mt-1">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}

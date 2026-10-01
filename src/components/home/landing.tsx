"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  CloudUpload,
  Lock,
  Share2,
  Smartphone,
  Zap,
  ArrowRight,
  ExternalLink,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  { icon: Lock, title: "Chiffré de bout en bout", description: "Contenus, noms et dossiers sont chiffrés sur ton appareil. Même nous ne pouvons rien lire." },
  { icon: Zap, title: "Rapide, sans limite de taille", description: "Envoi en parallèle par morceaux, reprise propre, aucun plafond de fichier." },
  { icon: Share2, title: "Partage sûr", description: "Liens chiffrés, mot de passe et expiration optionnels." },
  { icon: CloudUpload, title: "Aperçus instantanés", description: "Images, vidéo, PDF, audio et texte, directement dans l'app." },
  { icon: Smartphone, title: "Partout avec toi", description: "Web, iPhone et Windows : mêmes fichiers, mêmes clés." },
  { icon: Code2, title: "Ouvert aux développeurs", description: "API, SDK et OAuth avec un dossier dédié par application." },
];

const trust: { who: string; sees: string; tone: string }[] = [
  { who: "Discord", sees: "Des morceaux chiffrés aux noms opaques. Rien de lisible.", tone: "text-muted-foreground" },
  { who: "Drivecord", sees: "La structure de tes dossiers, sans leurs noms. Aucune clé, aucun contenu.", tone: "text-muted-foreground" },
  { who: "Toi", sees: "Tout, sur chaque appareil que tu déverrouilles.", tone: "text-primary" },
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


/** Pure-CSS replica of the drive: shows the product without a screenshot that goes stale. */
function ProductMock() {
  const files = [
    { n: "vacances-2026.jpg", m: "4,2 Mo", c: "from-muted/60 to-muted/30", e: "JPG" },
    { n: "contrat.pdf", m: "820 Ko", c: "from-muted/60 to-muted/30", e: "PDF" },
    { n: "maquette.fig", m: "12 Mo", c: "from-muted/60 to-muted/30", e: "FIG" },
    { n: "demo.mp4", m: "148 Mo", c: "from-muted/60 to-muted/30", e: "MP4" },
    { n: "notes.md", m: "6 Ko", c: "from-muted/60 to-muted/30", e: "MD" },
    { n: "budget.xlsx", m: "96 Ko", c: "from-muted/60 to-muted/30", e: "XLS" },
  ];
  return (
    <div className="relative mx-auto mt-14 w-full max-w-5xl">
      <div aria-hidden className="absolute inset-x-10 -bottom-10 h-40 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 border-b border-border/50 bg-background/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-400/70" /><span className="size-2.5 rounded-full bg-emerald-400/70" />
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-0.5 font-mono text-[11px] text-muted-foreground"><Lock className="size-3 text-emerald-400" />drivecord.app/drive</span>
        </div>
        <div className="grid grid-cols-[170px_1fr] text-left">
          <aside className="hidden space-y-1 border-r border-border/50 bg-background/40 p-3 text-xs sm:block">
            <div className="mb-3 flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-md bg-primary"><CloudUpload className="size-3.5 text-primary-foreground" /></span>drivecord</div>
            {["Tous les fichiers", "Favoris", "Coffre-fort", "Liens partagés", "Corbeille"].map((l, i) => (
              <div key={l} className={`rounded-lg px-2.5 py-1.5 ${i === 0 ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground"}`}>{l}</div>
            ))}
            <div className="mt-6 rounded-xl border border-border/50 bg-card/60 p-2.5">
              <p className="text-[10px] text-muted-foreground">Espace utilisé</p>
              <p className="text-sm font-semibold">2,4 Go · Illimité</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="size-2.5 text-emerald-400" />Chiffré de bout en bout</p>
            </div>
          </aside>
          <div className="col-span-2 space-y-3 p-4 sm:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">Rechercher dans ce drive…</div>
              <div className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Upload</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {["Projets", "Photos", "Documents"].map((f) => (
                <div key={f} className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/60 p-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400"><FolderMock /></span>
                  <div><p className="text-xs font-semibold">{f}</p><p className="text-[10px] text-muted-foreground">12 éléments</p></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {files.map((f) => (
                <div key={f.n} className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
                  <div className={`flex h-16 items-end bg-gradient-to-br ${f.c} p-1.5`}><span className="rounded bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">{f.e}</span></div>
                  <div className="p-1.5"><p className="truncate text-[11px] font-medium">{f.n}</p><p className="text-[10px] text-muted-foreground">{f.m}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderMock() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  );
}

const faq = [
  { q: "Vraiment illimité ?", a: "Tes fichiers vivent dans ton propre salon Discord via un webhook : il n'y a pas de quota Drivecord. Seules les règles de Discord s'appliquent." },
  { q: "Drivecord peut-il lire mes fichiers ?", a: "Non. Contenu, noms et dossiers sont chiffrés sur ton appareil. Le serveur ne détient aucune clé. Si tu perds ta clé de récupération, personne ne peut t'aider." },
  { q: "Que se passe-t-il si Discord change ses règles ?", a: "Le code est ouvert et tes fichiers restent à toi : exporte-les à tout moment. Garde une copie de ce qui est vital." },
  { q: "C'est gratuit ?", a: "Oui : pas d'abonnement, pas de carte bancaire. Le projet est open source et soutenu par ses mécènes." },
  { q: "Puis-je l'utiliser depuis mon propre site ?", a: "Oui, avec le SDK : un bouton d'upload et une visionneuse chiffrés, ou l'API v2 avec un jeton personnel." },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function Landing() {
  const reduce = useReducedMotion();

  // Disable transforms when the user prefers reduced motion.
  const v = reduce ? {} : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col">

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
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/docs">Docs</Link>
            </Button>
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
        <section className="relative flex flex-col items-center justify-center overflow-hidden px-5 pb-24 pt-20 text-center sm:pt-28">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[900px] max-w-full -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,theme(colors.violet.500/0.18),transparent_65%)]" />

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
                v1.0 — chiffré de bout en bout
              </Badge>
            </motion.div>

            <motion.h1
              variants={v ?? item}
              className="max-w-3xl text-balance text-[2.4rem] font-semibold leading-[1.08] tracking-tight sm:text-6xl"
            >
              Ton cloud illimité,{" "}
              <span className="text-muted-foreground">
                propulsé par Discord
              </span>
              .
            </motion.h1>

            <motion.p
              variants={v ?? item}
              className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
            >
              Tes fichiers, chiffrés sur ton appareil et stockés sur ton propre Discord.
              Sans abonnement.
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

            <motion.p variants={v ?? item} className="text-sm text-muted-foreground">
              Gratuit, open source · aussi sur{" "}
              <Link href="/download/windows" className="text-foreground underline-offset-4 hover:underline">Windows</Link>
              {" "}et{" "}
              <Link href="/install" className="text-foreground underline-offset-4 hover:underline">iPhone</Link>
            </motion.p>
          </motion.div>
          <motion.div variants={v ?? reveal} initial="hidden" animate="show" className="w-full">
            <ProductMock />
          </motion.div>
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
                  
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={`group rounded-2xl border border-border/40 bg-card/30 p-6 transition-colors hover:border-border hover:bg-card/60`}
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

        {/* ── Trust ── */}
        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <SectionHeading kicker="Confidentialité" title="Qui voit quoi ?" />
            <div className="grid gap-4 sm:grid-cols-3">
              {trust.map((t) => (
                <div key={t.who} className="rounded-2xl border border-border/50 bg-card/40 p-6">
                  <h3 className={`mb-2 font-semibold ${t.tone}`}>{t.who}</h3>
                  <p className="text-sm text-muted-foreground">{t.sees}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Code ouvert, primitives standard (AES-256-GCM, Argon2id), modèle de menace publié —{" "}
              <Link href="/docs/securite/chiffrement" className="text-primary hover:underline">voir comment ça marche</Link>.
            </p>
          </div>
        </section>

        {/* ── Developers ── */}
        <section className="border-t border-border/40 bg-card/20 px-5 py-20 sm:px-6">
          <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Développeurs</p>
              <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">Intègre Drivecord dans ton site</h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Un bouton d&apos;upload et une visionneuse chiffrés de bout en bout en quelques lignes. Ton site ne voit jamais ni les clés, ni les noms.
              </p>
              <Button asChild variant="outline" className="gap-2">
                <Link href="/docs/technique/sdk">Voir le SDK <ArrowRight className="size-4" /></Link>
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 p-5 text-xs leading-relaxed text-muted-foreground"><code>{`const dc = Drivecord.init({ clientId, redirectUri });
await dc.signIn();

dc.mountUploader(el, {
  onUploaded: ({ fileId }) => save(fileId),
});`}</code></pre>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <SectionHeading kicker="Questions" title="Tu te demandes…" />
            <div className="divide-y divide-border/50 rounded-3xl border border-border/50 bg-card/30">
              {faq.map((f) => (
                <details key={f.q} className="group px-6 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-border/40 bg-card/20 px-5 py-20 sm:px-6">
          <motion.div
            variants={v ?? reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/50 bg-card/30 px-6 py-14 text-center"
          >
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Commence maintenant</h2>
            <p className="mb-8 text-muted-foreground">
              Un webhook Discord suffit. Aucune carte bancaire, aucune installation.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group w-full gap-2 px-8 sm:w-auto">
                <Link href="/register">
                  Créer un compte
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="w-full gap-2 sm:w-auto">
                <Link href="https://github.com/LeVraiLunatix/drivecord" target="_blank" rel="noopener noreferrer">
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
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/conditions" className="hover:text-foreground">Conditions & mentions légales</Link>
            <Link
              href="https://github.com/LeVraiLunatix/drivecord"
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

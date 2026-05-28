import Link from "next/link";
import {
  CloudUpload,
  Lock,
  Share2,
  Smartphone,
  Sparkles,
  Zap,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import DarkVeil from "@/components/ui/dark-veil";
import GooeyNav from "@/components/ui/gooey-nav";

const navItems = [
  { label: "Accueil", href: "/" },
  { label: "Se connecter", href: "/login" },
  { label: "Commencer", href: "/register" },
];

const features = [
  {
    icon: Zap,
    title: "Upload chunked parallèle",
    description:
      "Découpage automatique en chunks de 10 Mo, upload simultané. Des transferts ultra-rapides sans limite de taille.",
  },
  {
    icon: Lock,
    title: "Chiffrement E2EE",
    description:
      "AES-256-GCM côté client. Tes fichiers sont chiffrés avant même de quitter ton navigateur.",
  },
  {
    icon: Share2,
    title: "Partage avancé",
    description:
      "Liens publics avec mot de passe, expiration, compteur de téléchargements.",
  },
  {
    icon: CloudUpload,
    title: "Preview streaming",
    description:
      "Lecture vidéo, PDF, audio, images directement depuis le navigateur sans tout télécharger.",
  },
  {
    icon: Smartphone,
    title: "PWA mobile",
    description:
      "Installable comme une vraie app. Fonctionne offline pour la navigation.",
  },
  {
    icon: Sparkles,
    title: "UI moderne",
    description:
      "Mode sombre, drag & drop, recherche instantanée, dossiers, tags et favoris.",
  },
];

const steps = [
  {
    n: "01",
    title: "Crée un webhook Discord",
    description:
      "Dans les paramètres d'un salon → Intégrations → Webhooks. Gratuit, aucun bot requis.",
  },
  {
    n: "02",
    title: "Colle l'URL dans Drivecord",
    description:
      "On hash l'URL localement pour créer ton Drive. Rien n'est envoyé à un serveur tiers.",
  },
  {
    n: "03",
    title: "Upload & partage",
    description:
      "Glisse tes fichiers, organise par dossiers, partage par lien. Tes données restent sur Discord.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight"
          >
            <CloudUpload className="size-5 text-primary" />
            drivecord
          </Link>
          <div className="flex items-center gap-3">
            <GooeyNav
              items={navItems}
              initialActiveIndex={0}
              particleCount={12}
              particleDistances={[80, 8]}
              animationTime={500}
              timeVariance={250}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
          {/* WebGL background — canvas positions itself absolute within section */}
          <DarkVeil
            className="-z-10"
            hueShift={240}
            speed={0.35}
            warpAmount={0.25}
            noiseIntensity={0.03}
            resolutionScale={0.65}
          />
          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-background to-transparent" />

          <div className="flex flex-col items-center gap-6">
            <Badge
              variant="secondary"
              className="gap-1.5 border border-border/60 font-mono text-xs"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              v0.1 — open beta
            </Badge>

            <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight sm:text-7xl">
              Ton cloud illimité,{" "}
              <span className="bg-gradient-to-br from-indigo-400 via-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
                propulsé par Discord
              </span>
              .
            </h1>

            <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Stockage illimité via webhooks Discord, chiffrement de bout en
              bout, partage par lien et PWA — sans serveur, sans abonnement.
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2 px-6">
                <Link href="/register">
                  Créer un compte gratuit
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 px-6">
                <Link href="/login">Se connecter</Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground/60">
              Aucune carte bancaire requise · Local-first
            </p>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t border-border/40 bg-card/20 px-6 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Comment ça marche
              </p>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Prêt en 3 étapes
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {steps.map((s) => (
                <div
                  key={s.n}
                  className="relative rounded-xl border border-border/50 bg-card/40 p-6"
                >
                  <span className="mb-3 block font-mono text-3xl font-bold text-primary/20">
                    {s.n}
                  </span>
                  <h3 className="mb-2 font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Fonctionnalités
              </p>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Tout ce dont tu as besoin
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="group rounded-xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-primary/30 hover:bg-card/80"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-border/40 bg-card/20 px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Commence maintenant
            </h2>
            <p className="mb-8 text-muted-foreground">
              Un compte Discord suffit. Aucune installation, aucune config
              serveur.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2 px-8">
                <Link href="/register">
                  Créer un compte
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="gap-2">
                <Link
                  href="https://github.com/LeVraiLunatix/discloud"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Code source
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground/60 sm:flex-row">
          <p>
            ⚠️ Le stockage via Discord viole les ToS Discord — risque de perte
            de données.
          </p>
          <p>
            <Link href="/" className="font-mono hover:text-foreground">
              drivecord
            </Link>{" "}
            · local-first · open source
          </p>
        </div>
      </footer>
    </div>
  );
}

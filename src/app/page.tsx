import Link from "next/link";
import {
  CloudUpload,
  Lock,
  Share2,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import DarkVeil from "@/components/ui/dark-veil";

const features = [
  {
    icon: CloudUpload,
    title: "Upload chunked parallèle",
    description:
      "Découpage automatique en chunks de 10 Mo et upload simultané pour des transferts ultra-rapides.",
  },
  {
    icon: Lock,
    title: "Chiffrement E2EE",
    description:
      "AES-256-GCM côté client. Vos fichiers sont chiffrés avant même de quitter votre navigateur.",
  },
  {
    icon: Share2,
    title: "Partage avancé",
    description:
      "Liens publics avec mot de passe, expiration, compteur de téléchargements.",
  },
  {
    icon: Zap,
    title: "Preview streaming",
    description:
      "Lecture vidéo, PDF, audio, images directement depuis le navigateur sans tout télécharger.",
  },
  {
    icon: Smartphone,
    title: "PWA mobile",
    description:
      "Installable comme une vraie app, fonctionne offline pour la navigation.",
  },
  {
    icon: Sparkles,
    title: "UI moderne",
    description:
      "Mode sombre, drag & drop multi-fichiers, recherche instantanée, tags, favoris.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-mono text-lg font-semibold tracking-tight">
            <CloudUpload className="size-5 text-primary" />
            drivecord
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/setup">Commencer</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="relative flex w-full flex-col items-center gap-6 overflow-hidden px-6 py-24 text-center">
          {/* WebGL background */}
          <div className="absolute inset-0 -z-10">
            <DarkVeil
              hueShift={240}
              speed={0.4}
              warpAmount={0.3}
              noiseIntensity={0.04}
              resolutionScale={0.6}
            />
          </div>
          {/* bottom fade to background */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent -z-10" />

          <Badge variant="secondary" className="font-mono">
            v0.1 — phase 1
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Votre cloud personnel, propulsé par{" "}
            <span className="bg-gradient-to-br from-indigo-400 to-fuchsia-500 bg-clip-text text-transparent">
              Discord
            </span>
            .
          </h1>
          <p className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Drivecord est une réinvention moderne de Disbox. Stockage illimité
            via webhooks Discord, chiffrement de bout en bout, partage public,
            previews et PWA — le tout dans une interface soignée.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">Créer un compte</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="border-border/50 transition-colors hover:border-border"
              >
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>
            ⚠️ Le stockage via Discord viole les ToS — risque de perte de
            données.
          </p>
          <p>Local-first · Open source bientôt</p>
        </div>
      </footer>
    </div>
  );
}

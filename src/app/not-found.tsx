import Link from "next/link";
import { CloudUpload } from "lucide-react";

export const metadata = {
  title: "Page introuvable",
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-5 overflow-hidden px-6 py-16 text-center">
      {/* Aura de marque */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[480px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-600/25 via-violet-600/20 to-fuchsia-600/25 blur-[120px]"
      />

      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
        <CloudUpload className="size-7 text-white" />
      </div>

      <p className="bg-gradient-to-br from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text font-mono text-7xl font-bold tracking-tight text-transparent">
        404
      </p>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Page introuvable</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cette page n&apos;existe pas (ou plus). Vérifie l&apos;adresse, ou
          reviens en lieu sûr.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Retour à l&apos;accueil
        </Link>
        <Link
          href="/drive"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-medium transition hover:bg-accent/60"
        >
          Mes drives
        </Link>
      </div>
    </main>
  );
}

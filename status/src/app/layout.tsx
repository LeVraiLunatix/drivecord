import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { siteUrl, mainSiteUrl } from "@/lib/site";
import "./globals.css";

const sans = localFont({ src: "./fonts/inter-latin-variable.woff2", variable: "--font-sans", display: "swap", weight: "100 900" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-variable.woff2", variable: "--font-mono", display: "swap", weight: "100 800", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Statut de Drivecord", template: "%s · Statut de Drivecord" },
  description: "L'état en direct de tous les systèmes de Drivecord, l'historique des incidents et les nouveautés.",
  applicationName: "Statut de Drivecord",
  alternates: { types: { "application/atom+xml": "/feed.xml" } },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

const NAV = [
  { href: "/nouveautes", label: "Nouveautés" },
  { href: "/history", label: "Historique" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const main = mainSiteUrl();
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
          Aller au contenu
        </a>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="" width={28} height={28} className="size-7 rounded-md" />
              <span>Statut de Drivecord</span>
            </Link>
            <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <a href={main} className="hover:text-fg">Retour au site</a>
              <a href={`${main}/docs`} className="hover:text-fg">Documentation</a>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-fg">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="contenu" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>
              <a href={main} className="font-mono hover:text-fg">drivecord</a> · open source
            </p>
            <nav aria-label="Flux et API" className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/feed.xml" className="hover:text-fg">Flux Atom</a>
              <a href="/api/status" className="hover:text-fg">API JSON</a>
              <a href="/api/status/summary" className="hover:text-fg">Résumé JSON</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

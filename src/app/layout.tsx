import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { LoginApprovalWatcher } from "@/components/auth/login-approval-watcher";
import { BfcacheAuthGuard } from "@/components/auth/bfcache-guard";
import { NativeDeepLink } from "@/components/native-deep-link";
import { NativeClass } from "@/components/native-class";
import { NativeBackdrop } from "@/components/native-backdrop";
import { AppTabBar } from "@/components/app-tab-bar";
import { NativeTabsBridge } from "@/components/native-tabs-bridge";
import { AnnouncementPopup } from "@/components/announcement-popup";
import { NativePushRegister } from "@/components/native-push-register";
import { DesktopTokenBridge } from "@/components/auth/desktop-token-bridge";
import { WindowChrome } from "@/components/window-chrome";
import { CloseConfirm } from "@/components/close-confirm";
import "./globals.css";

// Self-hosted (vendored in src/app/fonts/) — no build-time Google Fonts fetch,
// so the desktop static export works offline too.
const interSans = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
  preload: false,
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drivecord.app"),

  title: {
    default: "Drivecord — Stockage cloud sécurisé, chiffré et illimité",
    template: "%s · Drivecord",
  },

  description:
    "Drivecord est un stockage cloud sécurisé et illimité : chiffrement de bout en bout, partage de fichiers par lien, synchronisation multi-appareils et app iPhone.",

  applicationName: "Drivecord",

  authors: [
    {
      name: "Lunatix",
    },
  ],

  creator: "Lunatix",

  publisher: "Drivecord",

  keywords: [
    "Drivecord",
    "Cloud",
    "Cloud Storage",
    "Stockage",
    "Stockage Cloud",
    "Discord",
    "Discord Webhooks",
    "E2EE",
    "End-to-End Encryption",
    "Partage de fichiers",
    "Synchronisation",
    "PWA",
    "Drive",
    "Dropbox",
    "Google Drive",
    "OneDrive",
  ],

  verification: {
    google: "m-FmMXAJv-wni4WFNbVp8wLdSMzpYdsnD92eo0SYs8k",
  },

  openGraph: {
    title: "Drivecord",
    description:
      "Stockage cloud sécurisé avec chiffrement de bout en bout et partage de fichiers.",

    url: "https://drivecord.app",

    siteName: "Drivecord",

    locale: "fr_FR",

    type: "website",

    images: [
      {
        url: "/icon.png",
        width: 1024,
        height: 1024,
        alt: "Drivecord",
      },
    ],
  },

  twitter: {
    card: "summary",
    title: "Drivecord",
    description:
      "Stockage cloud sécurisé avec chiffrement de bout en bout.",

    images: ["/icon.png"],
  },

  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },

  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",

  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#ffffff",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0a0a0a",
    },
  ],
};

// Données structurées Schema.org — aident Google à afficher un beau résultat
// (nom, logo, catégorie d'app, gratuité, éditeur).
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Drivecord",
    url: "https://drivecord.app",
    inLanguage: "fr",
    description:
      "Stockage cloud sécurisé et illimité : chiffrement de bout en bout, partage par lien, synchronisation multi-appareils.",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Drivecord",
    url: "https://drivecord.app",
    image: "https://drivecord.app/icon.png",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "iOS, Web",
    description:
      "Stockage cloud sécurisé et illimité propulsé par Discord : chiffrement de bout en bout, partage de fichiers, synchronisation et app iPhone.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    publisher: { "@type": "Organization", name: "Lunatix" },
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${interSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <WindowChrome />
        <CloseConfirm />
        <NativeDeepLink />
        <NativeClass />
        <NativeBackdrop />

        <AuthSessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
            themes={["light", "dark", "system", "aurora", "or-nocturne"]}
          >
            <TooltipProvider delayDuration={200}>
              {children}

              <AppTabBar />

              <NativeTabsBridge />

              <LoginApprovalWatcher />

              <BfcacheAuthGuard />

              <NativePushRegister />

              <DesktopTokenBridge />

              <AnnouncementPopup />

              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
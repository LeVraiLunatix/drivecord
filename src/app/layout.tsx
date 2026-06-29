import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
import "./globals.css";

const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  style: "normal",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  style: "normal",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drivecord.app"),

  title: {
    default: "DriveCord",
    template: "%s · DriveCord",
  },

  description:
    "DriveCord est un service de stockage cloud sécurisé avec chiffrement de bout en bout, partage de fichiers, synchronisation et accès multiplateforme.",

  applicationName: "DriveCord",

  authors: [
    {
      name: "Lunatix",
    },
  ],

  creator: "Lunatix",

  publisher: "DriveCord",

  keywords: [
    "DriveCord",
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
    title: "DriveCord",
    description:
      "Stockage cloud sécurisé avec chiffrement de bout en bout et partage de fichiers.",

    url: "https://drivecord.app",

    siteName: "DriveCord",

    locale: "fr_FR",

    type: "website",

    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "DriveCord",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "DriveCord",
    description:
      "Stockage cloud sécurisé avec chiffrement de bout en bout.",

    images: ["/banner.png"],
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
        <NativeDeepLink />
        <NativeClass />
        <NativeBackdrop />

        <AuthSessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={200}>
              {children}

              <AppTabBar />

              <NativeTabsBridge />

              <LoginApprovalWatcher />

              <BfcacheAuthGuard />

              <AnnouncementPopup />

              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
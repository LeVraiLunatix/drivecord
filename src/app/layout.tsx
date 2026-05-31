import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { NativeDeepLink } from "@/components/native-deep-link";
import "./globals.css";

// Inter = substitut libre le plus proche de "gg sans" (la police de Discord).
// style:"normal" évite de charger les variantes italiques non utilisées.
const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  style: "normal",
  preload: false,
});

// JetBrains Mono n'est utilisé que dans les zones de code — pas besoin de
// précharger dès le premier paint, d'où preload: false.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  style: "normal",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Drivecord", template: "%s · Drivecord" },
  description:
    "Un clone moderne et amélioré de Disbox : stockage illimité via webhooks Discord, chiffrement E2EE, partage par lien, PWA.",
  applicationName: "Drivecord",
  authors: [{ name: "Lunatix" }],
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",   // fill iPhone notch + home bar area
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
        <AuthSessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

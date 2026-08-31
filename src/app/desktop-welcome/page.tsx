"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { CloudUpload, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBackground } from "@/components/auth/auth-background";
import { isDesktopApp } from "@/lib/use-platform";

/**
 * First screen of the Tauri desktop app (no token yet). A branded welcome that
 * routes to the real login / register flow — which happens first-party on
 * drivecord.app inside the window, then hands a bearer token back to the shell.
 */
export default function DesktopWelcomePage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [desktop, setDesktop] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  if (desktop === false) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Ouvre cette page depuis l&apos;application Drivecord.
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-12">
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <CloudUpload className="size-8 text-white" />
          </div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">drivecord</h1>
          <p className="text-sm text-muted-foreground">
            Ton stockage cloud chiffré, synchronisé sur ton PC.
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <Button
            className="h-11 gap-2 text-sm"
            onClick={() => router.push("/login?callbackUrl=%2Fdrive")}
          >
            <LogIn className="size-4" />
            Se connecter
          </Button>
          <Button
            variant="outline"
            className="h-11 gap-2 text-sm"
            onClick={() => router.push("/register")}
          >
            <UserPlus className="size-4" />
            Créer un compte
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BackButton } from "@/components/back-button";
import { AuthBackground } from "@/components/auth/auth-background";
import { oauthSignIn } from "@/lib/auth/oauth";
import { motion, useReducedMotion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="#5865F2">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.444.88-.608 1.283a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.18 3c-1.57.27-3.07.745-4.434 1.369C1.945 8.533 1.18 12.59 1.56 16.59a19.95 19.95 0 0 0 6.073 3.058c.49-.668.927-1.379 1.302-2.126-.715-.27-1.4-.602-2.046-.99.171-.126.34-.258.501-.394 3.94 1.844 8.198 1.844 12.09 0 .164.139.332.27.5.394-.647.388-1.333.72-2.048.991.375.746.81 1.457 1.302 2.125a19.9 19.9 0 0 0 6.073-3.058c.444-4.64-.764-8.66-3.19-12.221ZM8.02 14.131c-1.182 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.96 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de l'inscription.");
        return;
      }
      // Auto-login after registration
      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (login?.error) {
        toast.success("Compte créé ! Connecte-toi maintenant.");
        router.push("/login");
      } else {
        toast.success("Bienvenue sur Drivecord !");
        router.push("/drive");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="absolute left-3 z-10" style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
        <BackButton fallback="/login" />
      </div>
      <motion.div
        variants={v ?? container}
        initial="hidden"
        animate="show"
        className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 py-12"
      >
        {/* Centered group: logo + card */}
        <motion.div variants={v ?? container} className="flex flex-1 flex-col justify-center gap-6">
        {/* Logo */}
        <motion.div variants={v ?? item} className="flex flex-col items-center gap-3">
          <motion.div
            initial={reduce ? undefined : { scale: 0.6, opacity: 0 }}
            animate={reduce ? undefined : { scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30"
          >
            <CloudUpload className="size-7 text-white" />
          </motion.div>
          <Link href="/" className="font-mono text-xl font-semibold tracking-tight">
            drivecord
          </Link>
          <p className="text-sm text-muted-foreground">
            Crée un compte pour sauvegarder tes webhooks.
          </p>
        </motion.div>

        <motion.div variants={v ?? item}>
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Créer un compte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom (optionnel)</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ton prénom"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Créer mon compte
              </Button>
            </form>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                ou
              </span>
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => oauthSignIn("google", "/drive")}
              >
                <GoogleIcon />
                Continuer avec Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => oauthSignIn("discord", "/drive")}
              >
                <DiscordIcon />
                Continuer avec Discord
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
        </motion.div>

        <motion.p variants={v ?? item} className="pt-8 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

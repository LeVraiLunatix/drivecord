"use client";

import * as React from "react";
import { authFetch } from "@/lib/api-base";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BackButton } from "@/components/back-button";
import { AuthBackground } from "@/components/auth/auth-background";
import { oauthSignIn, lastLoginMethod, rememberLoginMethod } from "@/lib/auth/oauth";
import { shouldOpenOtherMethods } from "@/lib/auth/cord-shared";
import { useCordEnabled } from "@/components/auth/cord-account";
import { CordHero, OtherMethods } from "@/components/auth/cord-hero";
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { motion, useReducedMotion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const noopSubscribe = () => () => {};

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const cordEnabled = useCordEnabled();
  const lastMethod = React.useSyncExternalStore(noopSubscribe, lastLoginMethod, () => null);
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null);
  const othersOpen = openOverride ?? shouldOpenOtherMethods({ error: null, provider: null, lastMethod });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/auth/register", {
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
        rememberLoginMethod("credentials");
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

  const otherMethods = (
    <>
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
        <Button variant="outline" className="w-full" onClick={() => oauthSignIn("google", "/drive")}>
          <GoogleIcon />
          Continuer avec Google
        </Button>
        <Button variant="outline" className="w-full" onClick={() => oauthSignIn("discord", "/drive")}>
          <DiscordIcon />
          Continuer avec Discord
        </Button>
      </div>
    </>
  );

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
        <motion.div variants={v ?? container} className="flex flex-1 flex-col justify-center gap-6">
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
            <p className="text-sm text-muted-foreground">Crée ton compte pour garder tes drives partout.</p>
          </motion.div>

          {cordEnabled === false ? (
            <motion.div variants={v ?? item}>
              <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Créer un compte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">{otherMethods}</CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              <motion.div variants={v ?? item}>
                <CordHero mode="register" callbackUrl="/drive" email={email} />
              </motion.div>
              <motion.div variants={v ?? item}>
                <OtherMethods open={othersOpen} onOpenChange={setOpenOverride}>
                  {otherMethods}
                </OtherMethods>
              </motion.div>
            </>
          )}
        </motion.div>

        <motion.p variants={v ?? item} className="pt-8 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

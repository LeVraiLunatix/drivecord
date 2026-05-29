"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CloudUpload, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { BackButton } from "@/components/back-button";

// Google "G" icon (SVG inline)
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

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/drive";
  const justVerified = params.get("verify") === "1";

  // Email/password state
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Magic link state
  const [magicEmail, setMagicEmail] = React.useState("");
  const [magicBusy, setMagicBusy] = React.useState(false);
  const [magicSent, setMagicSent] = React.useState(false);

  React.useEffect(() => {
    if (params.get("error") === "CredentialsSignin") {
      toast.error("Email ou mot de passe incorrect.");
    }
  }, [params]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Email ou mot de passe incorrect.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicBusy(true);
    try {
      const res = await signIn("resend", {
        email: magicEmail,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Erreur lors de l'envoi. Vérifie ton email.");
      } else {
        setMagicSent(true);
      }
    } finally {
      setMagicBusy(false);
    }
  };

  const handleGoogle = () => {
    signIn("google", { callbackUrl });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton fallback="/" />
      </div>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight"
          >
            <CloudUpload className="size-6 text-primary" />
            drivecord
          </Link>
          <p className="text-sm text-muted-foreground">
            Connecte-toi pour accéder à tes drives.
          </p>
        </div>

        {justVerified && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Email vérifié ! Tu peux maintenant te connecter.
          </div>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Se connecter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="password">
              <TabsList className="w-full">
                <TabsTrigger value="password" className="flex-1">
                  Mot de passe
                </TabsTrigger>
                <TabsTrigger value="magic" className="flex-1">
                  Lien magique
                </TabsTrigger>
              </TabsList>

              {/* ── Email + password tab ── */}
              <TabsContent value="password">
                <form onSubmit={handleCredentials} className="space-y-3 pt-2">
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
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Se connecter
                  </Button>
                </form>
              </TabsContent>

              {/* ── Magic link tab ── */}
              <TabsContent value="magic">
                {magicSent ? (
                  <div className="space-y-3 pt-4 text-center">
                    <Mail className="mx-auto size-10 text-primary" />
                    <p className="text-sm font-medium">Vérifie tes emails !</p>
                    <p className="text-xs text-muted-foreground">
                      Un lien de connexion a été envoyé à{" "}
                      <strong>{magicEmail}</strong>. Il expire dans 24 h.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMagicSent(false)}
                    >
                      Renvoyer
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="magic-email">Email</Label>
                      <Input
                        id="magic-email"
                        type="email"
                        value={magicEmail}
                        onChange={(e) => setMagicEmail(e.target.value)}
                        placeholder="toi@example.com"
                        required
                        autoComplete="email"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={magicBusy}
                      className="w-full"
                    >
                      {magicBusy && <Loader2 className="size-4 animate-spin" />}
                      <Mail className="size-4" />
                      Envoyer le lien
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Pas besoin de mot de passe — on t&apos;envoie un lien de
                      connexion.
                    </p>
                  </form>
                )}
              </TabsContent>
            </Tabs>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                ou
              </span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
            >
              <GoogleIcon />
              Continuer avec Google
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="text-foreground underline-offset-4 hover:underline"
          >
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginContent />
    </React.Suspense>
  );
}

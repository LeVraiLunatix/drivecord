"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { CloudUpload, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BackButton } from "@/components/back-button";
import { isDesktopApp, isNativeApp } from "@/lib/use-platform";
import { AuthBackground } from "@/components/auth/auth-background";
import { AuthErrorNotice, useCordEnabled } from "@/components/auth/cord-account";
import { CordHero, CordRedirecting, OtherMethods, startCordSignIn } from "@/components/auth/cord-hero";
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { lastLoginMethod, lastOAuthProvider, oauthSignIn, rememberLoginMethod } from "@/lib/auth/oauth";
import { cordAuthParamsFromQuery, shouldOpenOtherMethods } from "@/lib/auth/cord-shared";
import { callbackPath } from "@/lib/auth/next-url";
import { loginWithPasskey } from "@/lib/auth/passkey-client";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const noopSubscribe = () => () => {};

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, data: session } = useSession();
  const callbackUrl = callbackPath(
    params.get("callbackUrl"),
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const justVerified = params.get("verify") === "1";
  const authError = params.get("error");

  // Email/password state (also pre-fills Cord's sign-up via `login_hint`).
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // ── /login?via=cord : link from the Cord hub → straight to Cord, no page. ──
  const [viaCord, setViaCord] = React.useState(() => params.get("via") === "cord" && !authError);
  const [viaCordCreate] = React.useState(() => params.get("prompt") === "create");
  const launched = React.useRef(false);
  React.useEffect(() => {
    if (!viaCord || launched.current || status === "loading") return;
    launched.current = true;
    // « Retour » from Cord must land on the normal page, not relaunch Cord.
    window.history.replaceState(null, "", `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    if (status === "authenticated" && session?.level === "full") {
      window.location.replace(callbackUrl);
      return;
    }
    const { prompt, login_hint } = cordAuthParamsFromQuery(params);
    startCordSignIn(callbackUrl, { create: prompt === "create", email: login_hint });
    // iOS app: Safari takes over, the app keeps showing /login meanwhile.
    if (isNativeApp()) window.setTimeout(() => setViaCord(false), 1500);
  }, [viaCord, status, session, callbackUrl, params]);

  // ── « Autres méthodes » : folded unless the user needs them. ──
  const cordEnabled = useCordEnabled();
  const lastMethod = React.useSyncExternalStore(noopSubscribe, lastLoginMethod, () => null);
  const lastProvider = React.useSyncExternalStore(noopSubscribe, lastOAuthProvider, () => null);
  const autoOpen = shouldOpenOtherMethods({
    error: authError,
    provider: authError?.startsWith("Cord") ? "cord" : lastProvider,
    lastMethod,
  });
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null);
  const othersOpen = openOverride ?? autoOpen;

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error(
          res.code === "no_password"
            ? "Ce compte n’a pas de mot de passe : connecte-toi avec Cord, Discord ou Google."
            : res.code === "rate_limited"
              ? "Trop de tentatives. Réessaie dans quelques minutes."
              : "Email ou mot de passe incorrect.",
        );
      } else {
        rememberLoginMethod("credentials");
        router.push(callbackUrl);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePasskey = async () => {
    rememberLoginMethod("passkey");
    // Dans l'app iPhone, la WebView ne peut pas utiliser les passkeys (l'app
    // réinstallée par AltStore ou CordLauncher n'a pas le domaine associé) :
    // on passe par Safari, comme Google et Discord, puis retour via /native-handoff.
    if (isNativeApp()) {
      window.open(`${window.location.origin}/native-login?provider=passkey`, "_system");
      return;
    }
    setBusy(true);
    const r = await loginWithPasskey();
    if (r.ok) {
      // Le login passkey pose le cookie de session via une route custom : le
      // SessionProvider client ne le voit pas (pas de broadcast comme signIn).
      // Une navigation DURE recharge la page → useSession repasse
      // "authenticated" → WebhookSyncProvider synchronise les drives. Sans ça,
      // la page /drive ne voit aucun drive et bascule vers /setup.
      window.location.assign(callbackUrl);
      return;
    }
    setBusy(false);
    toast.error(r.error ?? "Connexion par passkey impossible.");
  };

  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  if (viaCord) return <CordRedirecting create={viaCordCreate} />;

  const otherMethods = (
    <>
      <form onSubmit={handleCredentials} className="space-y-3">
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

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          ou
        </span>
      </div>

      <div className="space-y-2">
        <Button variant="outline" className="w-full" onClick={handlePasskey} disabled={busy}>
          <KeyRound className="size-4" />
          Se connecter avec un passkey
        </Button>
        <Button variant="outline" className="w-full" onClick={() => oauthSignIn("google", callbackUrl)}>
          <GoogleIcon />
          Continuer avec Google
        </Button>
        <Button variant="outline" className="w-full" onClick={() => oauthSignIn("discord", callbackUrl)}>
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
        <BackButton fallback={isDesktopApp() ? "/desktop-welcome" : "/"} />
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
            <p className="text-sm text-muted-foreground">Connecte-toi pour accéder à tes drives.</p>
          </motion.div>

          {justVerified && (
            <motion.div
              variants={v ?? item}
              className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400"
            >
              Email vérifié ! Tu peux maintenant te connecter.
            </motion.div>
          )}

          {authError && (
            <motion.div variants={v ?? item}>
              <AuthErrorNotice error={authError} />
            </motion.div>
          )}

          {cordEnabled === false ? (
            // Cord not configured on this deployment: the classic card, as before.
            <motion.div variants={v ?? item}>
              <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Se connecter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">{otherMethods}</CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              <motion.div variants={v ?? item}>
                <CordHero mode="login" callbackUrl={callbackUrl} email={email} />
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
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
            S&apos;inscrire
          </Link>
        </motion.p>
      </motion.div>
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

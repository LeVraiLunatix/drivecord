"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  AppWindow,
  ChevronRight,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { apiFetcher, apiUrl, authFetch, IS_DESKTOP } from "@/lib/api-base";
import { lastOAuthProvider, oauthSignIn, rememberOAuthProvider } from "@/lib/auth/oauth";
import { cordPortalUrl, loginErrorMessage } from "@/lib/auth/cord-shared";
import { isNativeApp } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PORTAL = process.env.NEXT_PUBLIC_CORD_ACCOUNT_URL;
const noopSubscribe = () => () => {};

function useCordEnabled() {
  const { data } = useSWR<Record<string, unknown>>("/api/auth/providers", apiFetcher, { revalidateOnFocus: false });
  return Boolean(data?.cord);
}

/** Cord suite logo (copied from compte.cordsuite.app into /public). */
export function CordLogo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static 180px asset, also used by the static desktop build
  return <img src="/cord-icon.png" alt="" aria-hidden className={cn("size-5 rounded-[6px]", className)} />;
}

/**
 * Primary « Continuer avec Cord » button (login + sign-up). Carries the Cord
 * suite gradient; `oauthSignIn` handles web, the iOS app (system browser →
 * drivecord:// handoff) and Drivecord Desktop (remote login page in Tauri).
 */
export function CordSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const enabled = useCordEnabled();
  if (!enabled) return null;
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        onClick={() => oauthSignIn("cord", callbackUrl)}
        className="h-11 w-full gap-2.5 border-0 bg-gradient-to-r from-[#6E58F0] to-[#B842EC] text-white shadow-lg shadow-[#8F4DEE]/25 transition hover:opacity-95 hover:shadow-[#8F4DEE]/40 focus-visible:ring-[#B842EC]/50"
      >
        <CordLogo className="ring-1 ring-white/30" />
        Continuer avec Cord
      </Button>
      <p className="text-center text-xs text-muted-foreground">Une identité pour toute la suite Cord</p>
    </div>
  );
}

/** Cord button placed first on /login and /register, followed by an « ou » divider. */
export function CordFirst({ callbackUrl }: { callbackUrl: string }) {
  const enabled = useCordEnabled();
  if (!enabled) return null;
  return (
    <>
      <CordSignInButton callbackUrl={callbackUrl} />
      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          ou
        </span>
      </div>
    </>
  );
}

/**
 * Clear, French message for an Auth.js `?error=` coming back to /login (or a
 * `?cordError=` on /settings). Replaces Auth.js' raw error page/codes.
 */
export function AuthErrorNotice({ error, className }: { error: string | null; className?: string }) {
  const { status } = useSession();
  // sessionStorage is client-only: null on the server, read after hydration.
  const provider = React.useSyncExternalStore(noopSubscribe, lastOAuthProvider, () => null);

  const msg = loginErrorMessage(error, error?.startsWith("Cord") ? "cord" : provider, cordPortalUrl(PORTAL));
  if (!msg) return null;
  // A linking attempt that failed lands here while still signed in.
  const action = msg.action ?? (status === "authenticated" && provider === "cord"
    ? { label: "Revenir aux Réglages", href: "/settings", external: false }
    : undefined);

  return (
    <div role="alert" className={cn("space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm", className)}>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        {msg.title}
      </p>
      <p className="text-muted-foreground">{msg.description}</p>
      {action && (action.external ? (
        <a href={action.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          {action.label}
          <ExternalLink className="size-3.5" />
        </a>
      ) : (
        <Link href={action.href} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          {action.label}
          <ChevronRight className="size-3.5" />
        </Link>
      ))}
    </div>
  );
}

export type CordAccountInfo = {
  name: string | null;
  providers: string[];
  cord: { name: string | null; email: string | null } | null;
  canUnlinkCord: boolean;
};

const SHORTCUTS = [
  { section: "security", label: "Sécurité", hint: "2FA et passkeys Cord", Icon: ShieldCheck },
  { section: "devices", label: "Appareils et Passcord", hint: "Valider tes connexions avec ton iPhone", Icon: Smartphone },
  { section: "apps", label: "Apps connectées", hint: "Accès donnés à Drivecord et aux autres apps", Icon: AppWindow },
] as const;

/** Settings › Compte Cord: link (explicit, to the signed-in account), identity, name sync, unlink, portal shortcuts. */
export function CordAccountCard({
  account,
  onUpdate,
  error,
}: {
  account: CordAccountInfo | undefined;
  onUpdate: () => void;
  error?: string | null;
}) {
  const enabled = useCordEnabled();
  const [busy, setBusy] = React.useState<null | "name" | "unlink">(null);
  if (!enabled || !account) return null;

  const cord = account.cord;
  const linked = Boolean(cord);

  const link = () => {
    // The app shells have no web session to link to: finish in the browser.
    if (isNativeApp() || IS_DESKTOP) {
      window.open(apiUrl("/settings"), isNativeApp() ? "_system" : "_blank", "noopener,noreferrer");
      return;
    }
    rememberOAuthProvider("cord");
    // No sign-out first (unlike oauthSignIn): Auth.js links Cord to the
    // account that is signed in right now.
    void signIn("cord", { callbackUrl: "/settings?cord=linked" });
  };

  const applyCordName = async () => {
    if (!cord?.name) return;
    setBusy("name");
    try {
      const res = await authFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cord.name }),
      });
      if (!res.ok) throw new Error();
      onUpdate();
      toast.success("Nom mis à jour depuis Cord");
    } catch {
      toast.error("Échec de la mise à jour du nom");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    try {
      const res = await authFetch("/api/account/cord", { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Échec de la dissociation");
      }
      onUpdate();
      toast.success("Compte Cord dissocié");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const nameDiffers = Boolean(cord?.name && cord.name !== account.name);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CordLogo />
          Compte Cord
          {linked && <Badge variant="secondary" className="ml-auto">Associé</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <AuthErrorNotice error={error} />}

        {!linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              Associe ton compte Cord à ce compte Drivecord pour te connecter avec la même identité dans toute la suite.
              Tes drives et tes fichiers restent dans Drivecord.
            </p>
            <Button
              onClick={link}
              className="gap-2 border-0 bg-gradient-to-r from-[#6E58F0] to-[#B842EC] text-white hover:opacity-95"
            >
              <CordLogo className="size-4 rounded-[4px] ring-1 ring-white/30" />
              Associer mon compte Cord
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <p className="truncate text-sm font-medium">{cord?.name ?? "Compte Cord"}</p>
              {cord?.email && <p className="truncate text-xs text-muted-foreground">{cord.email}</p>}
            </div>

            {nameDiffers && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                <p className="min-w-0 text-xs text-muted-foreground">
                  Ton nom Cord est <span className="font-medium text-foreground">{cord?.name}</span>
                  {account.name ? <> (ici : {account.name})</> : null}.
                </p>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={applyCordName}>
                  {busy === "name" && <Loader2 className="size-4 animate-spin" />}
                  Utiliser ce nom
                </Button>
              </div>
            )}

            {PORTAL && (
              <div className="-mx-1 space-y-0.5">
                {SHORTCUTS.map(({ section, label, hint, Icon }) => (
                  <a
                    key={section}
                    href={cordPortalUrl(PORTAL, section) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-accent/60"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            )}

            {account.canUnlinkCord ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={busy !== null}>
                    {busy === "unlink" ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
                    Dissocier
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Dissocier ton compte Cord ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tu ne pourras plus te connecter à Drivecord avec Cord (tes autres méthodes restent actives). Tes drives
                      ne sont pas touchés. Pour retirer aussi l’accès côté Cord, révoque Drivecord dans « Apps connectées ».
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={unlink}>Dissocier</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cord est ta seule méthode de connexion : ajoute un mot de passe ou un passkey pour pouvoir le dissocier.
              </p>
            )}
          </>
        )}

        {!linked && PORTAL && (
          <a
            href={cordPortalUrl(PORTAL) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Pas encore de Compte Cord ? Créer le mien
            <ExternalLink className="size-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

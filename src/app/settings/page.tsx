"use client";
import { CordAccountCard } from "@/components/auth/cord-account";
import { STATUS_URL } from "@/lib/status-url";

import * as React from "react";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  User,
  Mail,
  KeyRound,
  HardDrive,
  Palette,
  Grid2x2,
  List,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  ShieldAlert,
  Monitor,
  Moon,
  Sun,
  CalendarDays,
  ShieldCheck,
  LogOut,
  Share2,
  Activity,
  ChevronRight,
  Crown,
  RefreshCw,
  ExternalLink,
  Unlink,
  Sparkles,
  Star,
  Lock,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PasskeyManager } from "@/components/auth/passkey-manager";
import { TwoFactorManager } from "@/components/auth/two-factor-manager";
import { TrustedDevicesManager } from "@/components/auth/trusted-devices-manager";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { ThemeStudio } from "@/components/settings/theme-studio";
import { DriveBackdrop } from "@/components/drive/drive-backdrop";
import { PersonalTokensManager } from "@/components/settings/personal-tokens-manager";
import { EncryptionSettings } from "@/components/e2ee/encryption-settings";
import { ConnectedApps } from "@/components/settings/connected-apps";
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
import { BackButton } from "@/components/back-button";
import { fullSignOut } from "@/lib/auth/logout";
import { linkPatreon } from "@/lib/auth/oauth";
import { TierBadge, useTier, type PatreonTier } from "@/components/patreon/tier";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { useViewPrefs, type ViewMode } from "@/lib/view-prefs";
import {
  renameDrive,
  removeDriveMetadata,
  useAllDrives,
  useDriveUsage,
  type Drive,
} from "@/lib/storage";
import { removeWebhookFromServer } from "@/lib/auth/sync";

type Account = {
  name: string | null;
  email: string;
  image: string | null;
  hasPassword: boolean;
  providers: string[];
  webhookCount: number;
  createdAt: number;
  isAdmin: boolean;
  patreonTier: PatreonTier;
  patreonTierLabel: string;
  cord: { name: string | null; email: string | null } | null;
  canUnlinkCord: boolean;
};


type GroupId = "profil" | "securite" | "drives" | "dev" | "apparence" | "admin" | "session";

type Group = {
  id: GroupId;
  label: string;
  hint: string;
  icon: typeof User;
  /** Dégradé de la pastille (grisée au repos, en couleur au survol / actif). */
  tint: string;
  keywords: string;
  render: () => React.ReactNode;
};

export default function SettingsPage() {
  const reduce = useReducedMotion();
  const { data: account, mutate } = useSWR<Account>("/api/account", fetcher, {
    revalidateOnFocus: false,
  });

  // Back from Cord (Auth.js redirect): confirm the link, or show why it failed.
  // (Only rendered once /api/account has loaded client-side: no hydration mismatch.)
  const [cordError] = React.useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("cordError"),
  );
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("cord") && !params.has("cordError")) return;
    if (params.get("cord") === "linked") toast.success("Compte Cord associé ✨");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const groups: Group[] = React.useMemo(
    () => [
      {
        id: "profil",
        label: "Profil",
        hint: "Nom, avatar, Compte Cord",
        icon: User,
        tint: "from-indigo-500 to-sky-500",
        keywords: "profil nom avatar email photo cord compte",
        render: () => (
          <>
            <ProfileSection account={account} onUpdate={mutate} />
            <CordAccountCard account={account} onUpdate={() => void mutate()} error={cordError} />
          </>
        ),
      },
      {
        id: "securite",
        label: "Sécurité",
        hint: "Mot de passe, 2FA, passkeys, chiffrement",
        icon: ShieldCheck,
        tint: "from-emerald-500 to-teal-500",
        keywords:
          "sécurité securite mot de passe 2fa double authentification passkey clé récupération chiffrement e2ee appareils",
        render: () => (
          <>
            <SecuritySection account={account} onUpdate={mutate} />
            <EncryptionSettings />
          </>
        ),
      },
      {
        id: "drives",
        label: "Drives",
        hint: "Tes drives et leurs webhooks",
        icon: HardDrive,
        tint: "from-amber-500 to-orange-500",
        keywords: "drive drives webhook stockage discord renommer supprimer",
        render: () => <DrivesSection />,
      },
      {
        id: "dev",
        label: "Développeurs",
        hint: "Apps connectées, clés API, jetons",
        icon: KeyRound,
        tint: "from-violet-500 to-fuchsia-500",
        keywords: "api clé clés jeton jetons token oauth applications connectées développeur sdk",
        render: () => (
          <>
            <ConnectedApps />
            <ApiKeysSection />
            <Card>
              <CardContent className="pt-6">
                <PersonalTokensManager />
              </CardContent>
            </Card>
          </>
        ),
      },
      {
        id: "apparence",
        label: "Apparence & Patreon",
        hint: "Thèmes, vue par défaut, abonnement",
        icon: Palette,
        tint: "from-pink-500 to-rose-500",
        keywords:
          "apparence thème theme sombre clair aurora or nocturne vue grille liste patreon abonnement palier gold premium vip",
        render: () => (
          <>
            <ThemeStudio />
            <PreferencesSection />
            <PatreonSection />
          </>
        ),
      },
      ...(account?.isAdmin
        ? [
            {
              id: "admin" as const,
              label: "Administration",
              hint: "Outils réservés aux admins",
              icon: ShieldAlert,
              tint: "from-red-500 to-orange-500",
              keywords: "admin administration modération utilisateurs annonces",
              render: () => <AdminSection />,
            },
          ]
        : []),
      {
        id: "session",
        label: "Session & compte",
        hint: "Déconnexion, zone sensible",
        icon: LogOut,
        tint: "from-slate-500 to-zinc-500",
        keywords: "session déconnexion deconnecter supprimer compte danger liens",
        render: () => (
          <>
            <AccountLinksSection />
            <DangerSection />
          </>
        ),
      },
    ],
    [account, mutate, cordError],
  );

  const [active, setActive] = React.useState<GroupId>("profil");
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Lien profond : /settings#securite
  React.useEffect(() => {
    const h = window.location.hash.slice(1) as GroupId;
    if (h && groups.some((g) => g.id === h)) setActive(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (id: GroupId) => {
    setActive(id);
    setQuery("");
    window.history.replaceState(null, "", `#${id}`);
  };

  // "/" focalise la recherche.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "") && !t?.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = q
    ? groups.filter((g) => (g.label + " " + g.hint + " " + g.keywords).toLowerCase().includes(q))
    : groups.filter((g) => g.id === active);
  const { tier } = useTier();
  const memberSince = account?.createdAt
    ? new Date(account.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;
  const initial = (account?.name ?? account?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div
      className="relative isolate mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-5 tabbar-pad px-4 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_65%)]"
      />
      <DriveBackdrop />
      <BackButton fallback="/drive" className="w-fit" />

      {/* ── En-tête : carte d'identité + recherche ─────────────────────────── */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-fuchsia-500/15 p-5 sm:p-6"
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {account?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.image} alt="" className="size-16 rounded-2xl object-cover ring-2 ring-white/20" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-2xl font-bold text-white shadow-lg shadow-fuchsia-500/30">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
                <span className="truncate">{account?.name ?? "Paramètres"}</span>
                <TierBadge tier={tier} />
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {account?.email ?? "Chargement…"}
                {memberSince && <span className="hidden sm:inline"> · membre depuis {memberSince}</span>}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un réglage…"
              aria-label="Chercher un réglage"
              className="h-10 rounded-xl border-border/60 bg-background/60 pl-9 pr-9 backdrop-blur"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                aria-label="Effacer"
                className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded border border-border/60 px-1.5 text-[10px] text-muted-foreground sm:block">
                /
              </kbd>
            )}
          </div>
        </div>
      </motion.header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* ── Navigation : colonne (desktop) / pastilles défilantes (mobile) ── */}
        <nav
          aria-label="Catégories de réglages"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:w-64 lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
        >
          {groups.map((g) => {
            const on = !q && g.id === active;
            const dim = q && !shown.some((x) => x.id === g.id);
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                onClick={() => select(g.id)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "group/nav relative flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.97] lg:w-full",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  dim && "opacity-35",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="settings-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-2xl border border-violet-400/30 bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-fuchsia-500/15 shadow-[0_0_30px_-12px_rgba(168,85,247,0.7)]"
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white transition-all duration-300",
                    g.tint,
                    on
                      ? "shadow-lg"
                      : "scale-95 opacity-60 grayscale group-hover/nav:scale-105 group-hover/nav:opacity-100 group-hover/nav:grayscale-0",
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="relative min-w-0">
                  <span className="block text-sm font-medium leading-tight">{g.label}</span>
                  <span className="hidden text-[11px] leading-tight text-muted-foreground lg:block">{g.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Contenu ───────────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          {q && shown.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 px-6 py-14 text-center">
              <Search className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Aucun réglage pour « {query} »</p>
              <p className="mt-1 text-xs text-muted-foreground">Essaie « mot de passe », « thème », « jeton »…</p>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={q ? "search" : active}
              initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-5"
            >
              {shown.map((g) => (
                <section key={g.id} aria-labelledby={`g-${g.id}`} className="flex flex-col gap-4">
                  {q && (
                    <h2 id={`g-${g.id}`} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <span className={cn("flex size-5 items-center justify-center rounded-md bg-gradient-to-br text-white", g.tint)}>
                        <g.icon className="size-3" />
                      </span>
                      {g.label}
                    </h2>
                  )}
                  {g.render()}
                </section>
              ))}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ── Liens & session ─────────────────────────────────────────────────────────

function AccountLinksSection() {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="p-2">
        <button
          type="button"
          onClick={() => router.push("/shares")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-accent/60"
        >
          <Share2 className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Partagés</p>
            <p className="text-xs text-muted-foreground">Tes liens de partage</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>

        <a
          href={STATUS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-accent/60"
        >
          <Activity className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Statut</p>
            <p className="text-xs text-muted-foreground">État des services, incidents et nouveautés</p>
          </div>
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
        </a>

        <button
          type="button"
          onClick={() => fullSignOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-destructive transition hover:bg-destructive/10"
        >
          <LogOut className="size-5 shrink-0" />
          <span className="text-sm font-medium">Se déconnecter</span>
        </button>
      </CardContent>
    </Card>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileSection({ account, onUpdate }: { account?: Account; onUpdate: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (account) setName(account.name ?? "");
  }, [account?.name]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      toast.success("Profil mis à jour");
      setEditing(false);
      onUpdate();
    } catch {
      toast.error("Échec de la mise à jour");
    } finally {
      setBusy(false);
    }
  };

  const initial = (account?.name ?? account?.email ?? "?").charAt(0).toUpperCase();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4 text-muted-foreground" />
          Profil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {account?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.image} alt="" className="size-14 rounded-full object-cover" />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl font-semibold text-white">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{account?.name ?? "Sans nom"}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="size-3.5" />
              {account?.email ?? "…"}
            </p>
          </div>
        </div>

        {/* Editable name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom affiché</Label>
          {editing ? (
            <div className="flex gap-2">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ton nom" maxLength={60} />
              <Button size="icon" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setEditing(false); setName(account?.name ?? ""); }}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2 text-sm">
              <span className={cn(!account?.name && "text-muted-foreground")}>{account?.name ?? "Non défini"}</span>
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Modifier
              </Button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {account && account.patreonTier > 0 && (
            <TierBadge tier={account.patreonTier} />
          )}
          {account?.providers.includes("cord") && (
            <Badge variant="secondary" className="gap-1">Cord</Badge>
          )}
          {account?.providers.includes("google") && (
            <Badge variant="secondary" className="gap-1">Google</Badge>
          )}
          {account?.hasPassword && (
            <Badge variant="secondary" className="gap-1">Mot de passe</Badge>
          )}
          {account && (
            <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
              <CalendarDays className="size-3" />
              Membre depuis {new Date(account.createdAt).toLocaleDateString("fr")}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecuritySection({ account, onUpdate }: { account?: Account; onUpdate: () => void }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const hasPassword = account?.hasPassword;

  // Human-readable list of the OAuth providers this account uses.
  const providerLabel = (account?.providers ?? [])
    .map((p) => (p === "google" ? "Google" : p === "discord" ? "Discord" : p === "cord" ? "Cord" : p === "patreon" ? "Patreon" : p))
    .join(" et ");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current || undefined, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec");
      toast.success(hasPassword ? "Mot de passe modifié" : "Mot de passe défini");
      setCurrent(""); setNext(""); setConfirm("");
      onUpdate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" />
          Sécurité
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          {!hasPassword && (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
              Ton compte utilise {providerLabel || "une connexion externe"}. Définis un mot de passe pour aussi te connecter par email.
            </p>
          )}
          {hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="current">Mot de passe actuel</Label>
              <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new">{hasPassword ? "Nouveau mot de passe" : "Mot de passe"}</Label>
            <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="8 caractères minimum" minLength={8} required autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirmer</Label>
            <Input id="confirm-pw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          <Button type="submit" disabled={busy || !next} className="w-full sm:w-auto">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {hasPassword ? "Modifier le mot de passe" : "Définir un mot de passe"}
          </Button>
        </form>

        <Separator className="my-6" />
        <TwoFactorManager />

        <Separator className="my-6" />
        <PasskeyManager />

        <Separator className="my-6" />
        <TrustedDevicesManager />
      </CardContent>
    </Card>
  );
}

// ── Drives ────────────────────────────────────────────────────────────────────

function DrivesSection() {
  const router = useRouter();
  const drives = useAllDrives();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="size-4 text-muted-foreground" />
          Drives
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(drives ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun drive connecté.</p>
        ) : (
          <div className="space-y-2">
            {drives!.map((d) => (
              <DriveRow key={d.id} drive={d} />
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full gap-2" onClick={() => router.push("/setup")}>
          <Plus className="size-4" />
          Ajouter un drive
        </Button>
      </CardContent>
    </Card>
  );
}

function ApiKeysSection() {
  return (
    <Card>
      <CardContent className="pt-6">
        <ApiKeysManager />
      </CardContent>
    </Card>
  );
}

function DriveRow({ drive }: { drive: Drive }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(drive.name);
  const [busy, setBusy] = React.useState(false);
  const usage = useDriveUsage(drive.id);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === drive.name) { setEditing(false); return; }
    setBusy(true);
    try {
      await renameDrive(drive.id, trimmed);
      await authFetch(`/api/webhooks/${drive.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success("Drive renommé");
      setEditing(false);
    } catch {
      toast.error("Échec du renommage");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      await removeWebhookFromServer(drive.id);
      await removeDriveMetadata(drive.id);
      toast.success(`« ${drive.name} » dissocié`);
    } catch {
      toast.error("Échec de la dissociation");
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <HardDrive className="size-4 shrink-0 text-muted-foreground" />
        {editing ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            <Button size="icon" className="size-8" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => { setEditing(false); setName(drive.name); }}>
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{drive.name}</span>
            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setEditing(true)} title="Renommer">
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Dissocier">
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Dissocier ce drive ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    « {drive.name} » sera retiré de Drivecord. Les fichiers déjà sur Discord ne sont pas supprimés et le drive peut être réajouté avec la même URL de webhook.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={unlink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Dissocier
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
      {!editing && (
        <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
          {usage ? `${usage.fileCount} fichier${usage.fileCount > 1 ? "s" : ""} · ${formatBytes(usage.totalBytes)}` : "…"}
          {" · "}salon {drive.channelId.slice(0, 10)}…
        </p>
      )}
    </div>
  );
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function AdminSection() {
  const router = useRouter();
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" />
          Administration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tu es administrateur. Gère tous les comptes du site.
        </p>
        <Button className="w-full gap-2 sm:w-auto" onClick={() => router.push("/admin")}>
          <ShieldCheck className="size-4" />
          Gérer les comptes
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Preferences ───────────────────────────────────────────────────────────────

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const { viewMode, setViewMode } = useViewPrefs();
  const { tier } = useTier();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Thèmes exclusifs réservés à un palier. Si le palier ne suffit plus (ex.
  // abonnement terminé), on rebascule proprement sur le thème sombre.
  const exclusiveThemes: {
    value: string;
    label: string;
    minTier: PatreonTier;
    Icon: typeof Sun;
  }[] = [
    { value: "aurora", label: "Aurora", minTier: 2, Icon: Sparkles },
    { value: "or-nocturne", label: "Or nocturne", minTier: 3, Icon: Star },
  ];
  React.useEffect(() => {
    if (!mounted) return;
    const active = exclusiveThemes.find((t) => t.value === theme);
    if (active && tier < active.minTier) setTheme("dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, theme, tier]);

  const themes: { value: string; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Clair", Icon: Sun },
    { value: "dark", label: "Sombre", Icon: Moon },
    { value: "system", label: "Système", Icon: Monitor },
  ];
  const views: { value: ViewMode; label: string; Icon: typeof Grid2x2 }[] = [
    { value: "grid", label: "Grille", Icon: Grid2x2 },
    { value: "list", label: "Liste", Icon: List },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="size-4 text-muted-foreground" />
          Préférences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Thème</Label>
          <div className="grid grid-cols-3 gap-2">
            {themes.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                  mounted && theme === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/50 text-muted-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Thèmes exclusifs — contreparties Patreon (cosmétique) */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {exclusiveThemes.map(({ value, label, minTier, Icon }) => {
              const unlocked = tier >= minTier;
              const active = mounted && theme === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    if (unlocked) setTheme(value);
                    else
                      toast(
                        `Thème « ${label} » réservé au palier ${["", "Gold", "Premium", "VIP"][minTier]}`,
                        { description: "Deviens mécène pour le débloquer." },
                      );
                  }}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : unlocked
                        ? "border-border/50 text-muted-foreground hover:bg-accent/60"
                        : "cursor-not-allowed border-border/40 text-muted-foreground/60",
                  )}
                >
                  {!unlocked && (
                    <Lock className="absolute right-1.5 top-1.5 size-3" />
                  )}
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Vue par défaut</Label>
          <div className="grid grid-cols-2 gap-2">
            {views.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setViewMode(value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  viewMode === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/50 text-muted-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Patreon ───────────────────────────────────────────────────────────────────

type PatreonStatus = {
  linked: boolean;
  tier: 0 | 1 | 2 | 3;
  tierLabel: string;
  syncedAt: number | null;
  hideFromSupporters: boolean;
};

// Lien vanity /patreon (redirige vers patreon.com/drivecord via next.config.ts).
// Source de vérité unique : pour changer le slug, éditer le redirect, pas ici.
const PATREON_URL = "/patreon";

function PatreonSection() {
  const { data, mutate } = useSWR<PatreonStatus>("/api/account/patreon", fetcher, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = React.useState<null | "refresh" | "unlink">(null);

  const refresh = async () => {
    setBusy("refresh");
    try {
      const res = await authFetch("/api/account/patreon", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Échec de la synchro");
      mutate(d, { revalidate: false });
      toast.success(
        d.tier > 0 ? `Palier ${d.tierLabel} confirmé ✨` : "Aucun abonnement actif détecté",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    try {
      const res = await authFetch("/api/account/patreon", { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error();
      mutate(d, { revalidate: false });
      toast.success("Patreon délié");
    } catch {
      toast.error("Échec de la dissociation");
    } finally {
      setBusy(null);
    }
  };

  const toggleSupporters = async () => {
    if (!data) return;
    const next = !data.hideFromSupporters;
    try {
      const res = await authFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideFromSupporters: next }),
      });
      if (!res.ok) throw new Error();
      mutate({ ...data, hideFromSupporters: next }, { revalidate: false });
      toast.success(
        next
          ? "Tu es masqué de la page des mécènes"
          : "Tu apparais sur la page des mécènes",
      );
    } catch {
      toast.error("Échec de la mise à jour");
    }
  };

  const linked = data?.linked;
  const tier = data?.tier ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="size-4 text-muted-foreground" />
          Abonnement Patreon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              Lie ton compte Patreon pour débloquer automatiquement les avantages
              de ton palier (Gold, Premium ou VIP).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => linkPatreon()} className="gap-2">
                <Crown className="size-4" />
                Lier mon Patreon
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">
                  Voir les paliers
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  Palier actuel
                  {tier > 0 ? (
                    <TierBadge tier={tier} />
                  ) : (
                    <Badge variant="secondary">Aucun abonnement actif</Badge>
                  )}
                </div>
                {data?.syncedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Synchronisé le {new Date(data.syncedAt).toLocaleString("fr")}
                  </p>
                )}
              </div>
            </div>

            {tier === 0 && (
              <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
                Compte lié mais aucun abonnement actif détecté. Si tu viens de
                t'abonner, clique sur « Rafraîchir ».
              </p>
            )}

            {tier > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Apparaître sur la page des mécènes
                  </p>
                  <a
                    href="/supporters"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Voir la page
                  </a>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!data?.hideFromSupporters}
                  onClick={toggleSupporters}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    data?.hideFromSupporters ? "bg-muted" : "bg-primary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                      data?.hideFromSupporters ? "left-0.5" : "left-0.5 translate-x-5",
                    )}
                  />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={refresh} disabled={busy !== null} variant="outline" className="gap-2">
                {busy === "refresh" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Rafraîchir
              </Button>
              <Button asChild variant="ghost" className="gap-2">
                <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">
                  Gérer sur Patreon
                  <ExternalLink className="size-4" />
                </a>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
                  >
                    <Unlink className="size-4" />
                    Délier
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Délier Patreon ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ton palier reviendra à « Gratuit » et les avantages premium
                      seront désactivés jusqu'à ce que tu relies ton compte.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={unlink}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Délier
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Danger zone ─────────────────────────────────────────────────────────────

function DangerSection() {
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/account", { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Compte supprimé");
      await fullSignOut();
    } catch {
      toast.error("Échec de la suppression");
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <ShieldAlert className="size-4" />
          Zone de danger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Supprimer ton compte efface ton profil, tes drives et toutes leurs métadonnées (fichiers, dossiers, tags). Action irréversible.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto">
              <Trash2 className="size-4" />
              Supprimer mon compte
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer définitivement le compte ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Tape <strong>SUPPRIMER</strong> pour confirmer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              autoComplete="off"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText("")}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== "SUPPRIMER" || busy}
                onClick={(e) => { e.preventDefault(); deleteAccount(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Supprimer définitivement
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

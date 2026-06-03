"use client";

import * as React from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { motion, useReducedMotion, type Variants } from "motion/react";
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

export default function SettingsPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const { data: account, mutate } = useSWR<Account>("/api/account", fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 tabbar-pad px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/drive" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Gère ton compte, tes drives et tes préférences.</p>
      </motion.header>

      <motion.div variants={v ?? item}>
        <ProfileSection account={account} onUpdate={mutate} />
      </motion.div>

      <motion.div variants={v ?? item}>
        <SecuritySection account={account} onUpdate={mutate} />
      </motion.div>

      <motion.div variants={v ?? item}>
        <DrivesSection />
      </motion.div>

      {account?.isAdmin && (
        <motion.div variants={v ?? item}>
          <AdminSection />
        </motion.div>
      )}

      <motion.div variants={v ?? item}>
        <PreferencesSection />
      </motion.div>

      <motion.div variants={v ?? item}>
        <DangerSection />
      </motion.div>
    </motion.div>
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
      const res = await fetch("/api/account", {
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
    .map((p) => (p === "google" ? "Google" : p === "discord" ? "Discord" : p))
    .join(" et ");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
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
      await fetch(`/api/webhooks/${drive.id}`, {
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
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

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

// ── Danger zone ─────────────────────────────────────────────────────────────

function DangerSection() {
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
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

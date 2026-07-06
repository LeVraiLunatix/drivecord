"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Loader2,
  HardDrive,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TierBadge, type PatreonTier } from "@/components/patreon/tier";
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
import { AnnouncementAdmin } from "@/components/admin/announcement-admin";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  hasPassword: boolean;
  providers: string[];
  webhookCount: number;
  createdAt: number;
  patreonTier: PatreonTier;
  patreonExpiresAt: number | null;
};

const TIER_NAMES = ["Gratuit", "Gold", "Premium", "VIP"];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function AdminPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const { data, error, isLoading, mutate } = useSWR<{ adminEmail: string; users: AdminUser[] }>(
    "/api/admin/users",
    fetcher,
    { revalidateOnFocus: false },
  );

  // Non-admin (403) → bounce to drive.
  React.useEffect(() => {
    if (error) {
      toast.error("Accès réservé à l'administrateur");
      router.replace("/drive");
    }
  }, [error, router]);

  const setTier = async (
    u: AdminUser,
    tier: number,
    expiresAt: string | null,
  ) => {
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patreonTier: tier, expiresAt }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Échec");
      const suffix =
        tier > 0
          ? expiresAt
            ? ` jusqu'au ${new Date(expiresAt).toLocaleDateString("fr")}`
            : " (à vie)"
          : "";
      toast.success(`${u.email} → ${TIER_NAMES[tier]}${suffix}`);
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Échec");
      }
      toast.success(`Compte « ${u.email} » supprimé`);
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 tabbar-pad px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/settings" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="size-7 text-primary" />
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.users.length} compte(s) enregistré(s)` : "Gestion des comptes"}
        </p>
      </motion.header>

      <motion.div variants={v ?? item}>
        <AnnouncementAdmin />
      </motion.div>

      <motion.h2 variants={v ?? item} className="flex items-center gap-2 pt-2 text-lg font-semibold">
        <UserIcon className="size-5 text-muted-foreground" />
        Comptes
      </motion.h2>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="space-y-3">
        {data?.users.map((u) => (
          <motion.div key={u.id} variants={v ?? item}>
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-semibold text-white">
                    {(u.name ?? u.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.name ?? "Sans nom"}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {u.providers.map((p) => (
                      <Badge key={p} variant="secondary" className="h-5 px-1.5 text-[10px] capitalize">{p}</Badge>
                    ))}
                    {u.hasPassword && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">mot de passe</Badge>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <HardDrive className="size-3" />
                      {u.webhookCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      {new Date(u.createdAt).toLocaleDateString("fr")}
                    </span>
                  </div>
                </div>

                {u.email === data.adminEmail ? (
                  <Badge variant="outline" className="shrink-0 gap-1 text-primary">
                    <ShieldCheck className="size-3" /> Toi
                  </Badge>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Supprimer ce compte"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce compte ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          « {u.email} » et toutes ses données (drives, fichiers, dossiers) seront supprimés définitivement.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUser(u)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                </div>

                {/* Palier Patreon — override manuel par l'admin */}
                <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                  <Crown className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Palier Patreon</span>
                  <div className="ml-auto flex items-center gap-2">
                    {u.patreonTier > 0 && <TierBadge tier={u.patreonTier} />}
                    {u.patreonTier > 0 && (
                      <span className="text-[11px] text-muted-foreground/70">
                        {u.patreonExpiresAt
                          ? `jusqu'au ${new Date(u.patreonExpiresAt).toLocaleDateString("fr")}`
                          : "à vie"}
                      </span>
                    )}
                    <TierManager
                      user={u}
                      onSave={(tier, expiresAt) => setTier(u, tier, expiresAt)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {data && data.users.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <UserIcon className="size-8" />
          <p className="text-sm">Aucun compte.</p>
        </div>
      )}
    </motion.div>
  );
}

// ── Dialog de modification du palier (palier + durée) ────────────────────────

function TierManager({
  user,
  onSave,
}: {
  user: AdminUser;
  onSave: (tier: number, expiresAt: string | null) => Promise<void> | void;
}) {
  const [open, setOpen] = React.useState(false);
  const [tier, setTier] = React.useState<number>(user.patreonTier);
  const [mode, setMode] = React.useState<"lifetime" | "date">(
    user.patreonExpiresAt ? "date" : "lifetime",
  );
  const [date, setDate] = React.useState<string>(
    user.patreonExpiresAt
      ? new Date(user.patreonExpiresAt).toISOString().slice(0, 10)
      : "",
  );
  const [busy, setBusy] = React.useState(false);

  // Resynchronise l'état local à l'ouverture.
  React.useEffect(() => {
    if (!open) return;
    setTier(user.patreonTier);
    setMode(user.patreonExpiresAt ? "date" : "lifetime");
    setDate(
      user.patreonExpiresAt
        ? new Date(user.patreonExpiresAt).toISOString().slice(0, 10)
        : "",
    );
  }, [open, user.patreonTier, user.patreonExpiresAt]);

  const save = async () => {
    let expiresAt: string | null = null;
    if (tier > 0 && mode === "date") {
      if (!date) {
        toast.error("Choisis une date d'expiration");
        return;
      }
      // Fin de la journée choisie (heure locale).
      expiresAt = new Date(`${date}T23:59:59`).toISOString();
    }
    setBusy(true);
    try {
      await onSave(tier, expiresAt);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Crown className="size-3.5" />
          Palier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Palier de {user.name ?? user.email}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Palier</Label>
            <Select value={String(tier)} onValueChange={(v) => setTier(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Gratuit (retirer)</SelectItem>
                <SelectItem value="1">🥇 Gold</SelectItem>
                <SelectItem value="2">💎 Premium</SelectItem>
                <SelectItem value="3">⭐ VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tier > 0 && (
            <div className="space-y-1.5">
              <Label>Durée</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "lifetime" | "date")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lifetime">À vie</SelectItem>
                  <SelectItem value="date">Jusqu&apos;à une date</SelectItem>
                </SelectContent>
              </Select>
              {mode === "date" && (
                <Input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

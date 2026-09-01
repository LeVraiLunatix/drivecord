"use client";

import * as React from "react";
import Link from "next/link";
import {
  FolderSync,
  ArrowLeft,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * kDrive-style folder sync (desktop only). The native engine
 * (`drivecord-desktop/src-tauri/src/sync/`) owns the real work — registering
 * the Cloud Files sync root, creating placeholder files, hydrating on open,
 * uploading dropped files. This page is a thin control surface: pick a
 * folder, toggle sync, see per-drive status. State is polled (no
 * `@tauri-apps/api` dependency in this project — see `use-platform.ts`).
 */

type DriveStatus = {
  id: string;
  name: string;
  enabled: boolean;
  fileCount: number;
};

type SyncStatus = {
  enabled: boolean;
  running: boolean;
  root: string | null;
  drives: DriveStatus[];
  state: "idle" | "syncing" | "synced" | "error" | string;
  lastError: string | null;
  lastSyncAt: number | null;
};

const POLL_MS = 2000;

function stateBadge(status: SyncStatus | null): {
  label: string;
  variant: "default" | "secondary" | "destructive";
} {
  if (!status) return { label: "…", variant: "secondary" };
  if (!status.enabled) return { label: "En pause", variant: "secondary" };
  switch (status.state) {
    case "syncing":
      return { label: "Synchronisation…", variant: "default" };
    case "synced":
      return { label: "Synchronisé", variant: "default" };
    case "error":
      return { label: "Erreur", variant: "destructive" };
    default:
      return { label: "Inactif", variant: "secondary" };
  }
}

export default function DesktopSyncPage() {
  const [desktop, setDesktop] = React.useState(false);
  const [status, setStatus] = React.useState<SyncStatus | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  const refresh = React.useCallback(() => {
    if (!isDesktopApp()) return;
    tauriInvoke<SyncStatus>("sync_status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!desktop) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [desktop, refresh]);

  const pickFolder = async () => {
    setBusy(true);
    try {
      const path = await tauriInvoke<string | null>("sync_pick_folder");
      if (path) {
        await tauriInvoke("sync_set_root", { path });
        toast.success("Dossier choisi.");
        refresh();
      }
    } catch {
      toast.error("Impossible de choisir le dossier.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSync = async () => {
    setBusy(true);
    try {
      await tauriInvoke(status?.enabled ? "sync_disable" : "sync_enable");
      refresh();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    try {
      await tauriInvoke("sync_open_folder");
    } catch {
      toast.error("Aucun dossier à ouvrir.");
    }
  };

  const syncNow = async () => {
    try {
      await tauriInvoke("sync_now");
      toast.info("Synchronisation relancée.");
      refresh();
    } catch {
      // silent — the status badge already reflects any error
    }
  };

  const toggleDrive = async (driveId: string, enabled: boolean) => {
    try {
      await tauriInvoke("sync_set_drive_enabled", { driveId, enabled });
      refresh();
    } catch {
      toast.error("Action impossible.");
    }
  };

  if (!desktop) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
          <FolderSync className="size-7 text-white" />
        </div>
        <h1 className="text-lg font-semibold">Synchro de dossier</h1>
        <p className="text-sm text-muted-foreground">
          Choisis un dossier de ton PC : chaque drive devient un sous-dossier, et
          déposer un fichier dedans depuis l&apos;explorateur Windows l&apos;envoie
          sur Drivecord. La synchro n&apos;occupe pas d&apos;espace disque.
        </p>
        <p className="text-xs text-muted-foreground/70">Réservé à l&apos;app Windows.</p>
        <Link
          href="/download/windows"
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Télécharger l&apos;app Windows
        </Link>
      </div>
    );
  }

  const badge = stateBadge(status);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col gap-5 px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
          <FolderSync className="size-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Synchro de dossier</h1>
          <p className="text-sm text-muted-foreground">
            Fichiers fantômes dans l&apos;explorateur Windows
          </p>
        </div>
        <Badge variant={badge.variant} className="ml-auto shrink-0">
          {badge.label}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dossier local</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="break-all rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {status?.root ?? "Aucun dossier choisi."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={pickFolder} disabled={busy}>
              <FolderPlus className="size-4" />
              Choisir un dossier
            </Button>
            <Button size="sm" variant="outline" onClick={openFolder} disabled={!status?.root}>
              <FolderOpen className="size-4" />
              Ouvrir
            </Button>
            <Button
              size="sm"
              variant={status?.enabled ? "outline" : "default"}
              onClick={toggleSync}
              disabled={busy || !status?.root}
            >
              {status?.enabled ? "Mettre en pause" : "Activer la synchro"}
            </Button>
            {status?.enabled && (
              <Button size="sm" variant="ghost" onClick={syncNow}>
                <RefreshCw className="size-4" />
                Actualiser
              </Button>
            )}
          </div>
          {status?.state === "error" && status.lastError && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {status.lastError}
            </p>
          )}
        </CardContent>
      </Card>

      {status?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drives</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60">
            {!status.drives.length && (
              <p className="py-2 text-sm text-muted-foreground">
                {status.state === "syncing" ? "Recherche des drives…" : "Aucun drive."}
              </p>
            )}
            {status.drives.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2.5">
                <Cloud className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.fileCount} fichier{d.fileCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={d.enabled ? "outline" : "ghost"}
                  onClick={() => toggleDrive(d.id, !d.enabled)}
                >
                  {d.enabled && <CheckCircle2 className="size-4" />}
                  {d.enabled ? "Synchronisé" : "Inclure"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground/70">
        Les fichiers apparaissent en fantômes (0 octet) et se téléchargent à
        l&apos;ouverture. Déposer un fichier dans un dossier de drive l&apos;envoie
        automatiquement, chiffré, sur Drivecord.
      </p>

      <Link
        href="/drive"
        className="mx-auto inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour au drive
      </Link>
    </div>
  );
}

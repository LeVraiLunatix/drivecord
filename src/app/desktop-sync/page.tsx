"use client";

import Link from "next/link";
import { FolderSync, ArrowLeft } from "lucide-react";

/**
 * Placeholder for the kDrive-style folder sync (desktop only). The real engine
 * — watcher, chunked upload, conflict handling — comes later.
 */
export default function DesktopSyncPage() {
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
      <p className="text-xs text-muted-foreground/70">Bientôt disponible.</p>
      <Link
        href="/drive"
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour au drive
      </Link>
    </div>
  );
}

"use client";

import * as React from "react";
import { FolderPlus, Search, Smartphone, Upload } from "lucide-react";
import { useSession } from "next-auth/react";
import { Accent } from "@/kitcord";
import type { DriveItem } from "@/lib/storage";
import { DriveItemCard, type ItemAction } from "./item-card";

type Props = {
  /** Les derniers fichiers modifiés (les quatre premiers sont montrés). */
  recents: DriveItem[] | undefined;
  onUpload: () => void;
  onNewFolder: () => void;
  /** Sauvegarde de la pellicule (web / iPhone) ou synchro de dossier (bureau). */
  onBackup: () => void;
  backupLabel: string;
  onAction: (action: ItemAction, item: DriveItem) => void;
  onPreviewFile: (fileId: string) => void;
  onSeeAll: () => void;
};

/** L'accueil du drive : la recherche d'abord, les gestes courants, puis les derniers fichiers. */
export function DriveHome({ recents, onUpload, onNewFolder, onBackup, backupLabel, onAction, onPreviewFile, onSeeAll }: Props) {
  const { data: session } = useSession();
  const first = session?.user?.name?.trim().split(/\s+/)[0];
  const openPalette = () => window.dispatchEvent(new Event("drivecord:open-palette"));
  const latest = (recents ?? []).slice(0, 4);

  return (
    <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
      <p className="text-[var(--cord-dim)]">{first ? `Bonjour ${first}` : "Bonjour"}</p>
      <h1 className="cord-display mt-4 text-[clamp(2.75rem,8.4vw,6rem)]">
        Que <Accent>cherchez-vous</Accent>&nbsp;?
      </h1>
      <p className="cord-lede mt-6">Tes fichiers, chiffrés sur ton appareil avant l&apos;envoi.</p>

      <button
        type="button"
        onClick={openPalette}
        className="cord-search-field mt-10 w-full max-w-[44rem] cursor-text text-left sm:mt-14"
        aria-label="Rechercher dans ton drive (Ctrl K)"
      >
        <Search className="size-[18px] shrink-0 text-[var(--cord-dim)]" />
        <span className="min-w-0 flex-1 truncate text-[17px] text-[var(--cord-faint)]">Un fichier, un dossier, un tag…</span>
        <span className="cord-kbd hidden sm:inline" aria-hidden="true">Ctrl K</span>
      </button>

      <div className="cord-actions mt-8 gap-3.5 max-sm:flex-col max-sm:items-stretch sm:mt-10">
        <button type="button" data-primary className="cord-button h-[52px] gap-2.5 whitespace-nowrap px-5 text-base max-sm:flex-none sm:px-7" onClick={onUpload}>
          <Upload className="size-[18px] shrink-0" />
          Envoyer des fichiers
        </button>
        <button type="button" className="cord-button h-[52px] gap-2.5 whitespace-nowrap px-5 text-base max-sm:flex-none sm:px-7" onClick={onNewFolder}>
          <FolderPlus className="size-[18px] shrink-0" />
          Nouveau dossier
        </button>
        <button type="button" className="cord-button h-[52px] gap-2.5 whitespace-nowrap px-5 text-base max-sm:flex-none sm:px-7" onClick={onBackup}>
          <Smartphone className="size-[18px]" />
          {backupLabel}
        </button>
      </div>

      {latest.length > 0 && (
        <section className="mt-16 w-full text-left sm:mt-24">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-[var(--cord-dim)]">Récents</h2>
            <button type="button" className="text-[15px] text-[var(--cord-dim)] transition-colors hover:text-foreground" onClick={onSeeAll}>
              Tout voir
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4 sm:gap-x-8">
            {latest.map((item) => (
              <DriveItemCard
                key={item.id}
                item={item}
                plain
                onAction={onAction}
                onItemClick={() => onPreviewFile(item.id)}
                onDoubleClick={() => onPreviewFile(item.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

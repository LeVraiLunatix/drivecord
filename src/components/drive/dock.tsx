"use client";

import * as React from "react";
import {
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  RotateCcw,
  Share2,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { iconFor } from "@/lib/utils/file-icons";
import { folderIconClass } from "@/lib/folder-colors";
import type { DriveItem } from "@/lib/storage";
import { buildItemMenu } from "./item-menu";
import type { BulkAction } from "./selection-actions-menu";

type Props = {
  /** Ce qui est sélectionné dans l'explorateur (vide : on propose d'envoyer). */
  selection: DriveItem[];
  onClearSelection: () => void;
  onBulkAction: (action: BulkAction, items: DriveItem[]) => void;
  onItemAction: (action: string, item: DriveItem) => void;
  /** Actions par défaut — absentes (corbeille, coffre verrouillé…) : pas de dock sans sélection. */
  onUpload?: () => void;
  onFolderUpload?: () => void;
  onNewFolder?: () => void;
  /** Dans la corbeille : restaurer / supprimer définitivement. */
  inTrash?: boolean;
};

const PILL = "cord-button h-12 whitespace-nowrap gap-2 px-4 text-[15px] sm:h-[54px] sm:px-7 sm:text-[15.5px]";
const ROUND = "cord-button size-12 shrink-0 p-0 sm:size-[54px]";

/**
 * La barre du bas, toujours au même endroit : « Envoyer des fichiers » quand rien n'est
 * sélectionné, puis le fichier choisi (ou le nombre d'éléments) avec ses actions.
 */
export function DriveDock({
  selection,
  onClearSelection,
  onBulkAction,
  onItemAction,
  onUpload,
  onFolderUpload,
  onNewFolder,
  inTrash,
}: Props) {
  const count = selection.length;

  if (count > 0) {
    const single = count === 1 ? selection[0] : null;
    const canShare =
      !!single && buildItemMenu(single).some((m) => m.kind === "item" && m.action === "share");

    let title = `${count} sélectionnés`;
    let subtitle = "Choisis une action";
    let tile: React.ReactNode = null;
    if (single) {
      const isFolder = single.kind === "folder";
      title = isFolder ? single.name : single.filename;
      subtitle = isFolder ? "1 dossier" : `1 sélectionné · ${formatBytes(single.size)}`;
      const { Icon, colorClass } = isFolder
        ? { Icon: Folder, colorClass: folderIconClass(single.color) }
        : iconFor(single.filename, single.mimeType);
      tile = (
        <span className={cn("hidden size-[46px] shrink-0 items-center justify-center rounded-2xl min-[420px]:flex sm:size-[52px]", colorClass)}>
          <Icon className="size-5" />
        </span>
      );
    }

    return (
      <div role="toolbar" aria-label={`Actions : ${title}`} className="drive-dock cord-glass flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
        <div className="flex min-w-0 items-center gap-3 pl-1.5 pr-1 sm:pr-4">
          {tile}
          <div className="min-w-0">
            <p className="max-w-[5.5rem] truncate text-[15px] font-semibold leading-tight min-[420px]:max-w-[8rem] sm:max-w-[13rem]" title={title}>{title}</p>
            <p className="mt-0.5 hidden whitespace-nowrap text-[13px] text-[var(--cord-dim)] sm:block">{subtitle}</p>
          </div>
        </div>

        {inTrash ? (
          <>
            <button
              type="button"
              data-primary
              className={PILL}
              onClick={() => { for (const it of selection) onItemAction("restore", it); onClearSelection(); }}
            >
              <RotateCcw className="size-[18px]" />
              Restaurer
            </button>
            <button type="button" className={PILL} onClick={() => onBulkAction("delete", selection)}>
              <Trash2 className="size-[18px]" />
              <span className="hidden sm:inline">Supprimer</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" data-primary className={cn(PILL, "max-sm:size-12 max-sm:px-0")} onClick={() => onBulkAction("download", selection)} aria-label="Télécharger">
              <Download className="size-[18px]" />
              <span className="hidden sm:inline">Télécharger</span>
            </button>
            {canShare && single && (
              <button type="button" className={cn(PILL, "max-sm:size-12 max-sm:px-0")} onClick={() => onItemAction("share", single)} aria-label="Partager">
                <Share2 className="size-[18px]" />
                <span className="hidden sm:inline">Partager</span>
              </button>
            )}
            <button type="button" className={cn(PILL, "max-sm:size-12 max-sm:px-0")} onClick={() => onBulkAction("move", selection)} aria-label="Déplacer">
              <FolderInput className="size-[18px]" />
              <span className="hidden sm:inline">Déplacer</span>
            </button>
            <button type="button" className={cn(ROUND, "hidden sm:inline-flex")} onClick={() => onBulkAction("tag", selection)} aria-label="Gérer les tags">
              <Tag className="size-[18px]" />
            </button>
            <button type="button" className={ROUND} onClick={() => onBulkAction("delete", selection)} aria-label="Mettre à la corbeille">
              <Trash2 className="size-[18px]" />
            </button>
          </>
        )}
        <button type="button" className={ROUND} onClick={onClearSelection} aria-label="Annuler la sélection">
          <X className="size-[18px]" />
        </button>
      </div>
    );
  }

  if (inTrash || !onUpload) return null;

  return (
    <div role="toolbar" aria-label="Actions" className="drive-dock cord-glass flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
      <button type="button" data-primary className={PILL} onClick={onUpload}>
        <Upload className="size-[18px]" />
        Envoyer<span className="hidden sm:inline">&nbsp;des fichiers</span>
      </button>
      {onNewFolder && (
        <button type="button" className={PILL} onClick={onNewFolder}>
          <FolderPlus className="size-[18px]" />
          <span className="hidden min-[420px]:inline">Nouveau dossier</span>
          <span className="min-[420px]:hidden sr-only">Nouveau dossier</span>
        </button>
      )}
      {onFolderUpload && (
        <button type="button" className={cn(ROUND, "hidden sm:inline-flex")} onClick={onFolderUpload} aria-label="Envoyer un dossier" title="Envoyer un dossier">
          <FolderUp className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

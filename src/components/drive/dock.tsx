"use client";

import * as React from "react";
import {
  ChevronRight,
  Clock,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  Images,
  Link2,
  Lock,
  Plus,
  RotateCcw,
  Share2,
  Smartphone,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import { iconFor } from "@/lib/utils/file-icons";
import { folderIconClass } from "@/lib/folder-colors";
import type { DriveItem } from "@/lib/storage";
import { buildItemMenu } from "./item-menu";
import type { DriveSection } from "./sections";
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
  /** Sur l'Accueil, les mêmes actions sont déjà au milieu de la page : on garde seulement la barre d'onglets. */
  hideDefaultBar?: boolean;
  /** Téléphone (web) : barre d'onglets du bas, avec « + » qui ouvre le menu « Nouveau ». */
  tabs?: {
    section: DriveSection;
    onSection: (s: DriveSection) => void;
    onShares: () => void;
    /** Photos et vidéos (sélecteur de la galerie). */
    onUploadMedia?: () => void;
    /** Sauvegarde de la pellicule. */
    onBackup?: () => void;
  };
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
  hideDefaultBar,
  tabs,
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

  return (
    <DefaultDock
      onUpload={inTrash ? undefined : onUpload}
      onFolderUpload={onFolderUpload}
      onNewFolder={onNewFolder}
      hideDefaultBar={hideDefaultBar}
      tabs={tabs}
    />
  );
}

/** Ce que montre la barre du bas quand rien n'est sélectionné. */
function DefaultDock({
  onUpload,
  onFolderUpload,
  onNewFolder,
  hideDefaultBar,
  tabs,
}: Pick<Props, "onUpload" | "onFolderUpload" | "onNewFolder" | "hideDefaultBar" | "tabs">) {
  const [newOpen, setNewOpen] = React.useState(false);
  if (!onUpload && !tabs) return null;

  const tab = (id: DriveSection, label: string, Icon: typeof Folder) => (
    <button
      key={id}
      type="button"
      aria-current={tabs?.section === id ? "page" : undefined}
      onClick={() => tabs?.onSection(id)}
      className={cn(
        "flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-full text-[12.5px] font-medium",
        tabs?.section === id ? "text-foreground" : "text-[var(--cord-dim)]",
      )}
    >
      <Icon className={cn("size-[22px]", tabs?.section === id && "text-[var(--cord-light-mid)]")} />
      {label}
    </button>
  );

  const sheetItem = (Icon: typeof Folder, label: string, hint: string, run?: () => void, primary?: boolean) =>
    run ? (
      <button
        key={label}
        type="button"
        onClick={() => { setNewOpen(false); run(); }}
        className={cn(
          "flex min-h-[84px] w-full items-center gap-5 rounded-[18px] px-5 text-left",
          primary && "bg-[color-mix(in_srgb,var(--cord-light-mid)_16%,transparent)]",
        )}
      >
        <span className={cn("flex size-[54px] shrink-0 items-center justify-center rounded-full", primary ? "bg-[var(--cord-light-core)] text-[var(--cord-ink)]" : "bg-[color-mix(in_srgb,var(--cord-light-mid)_16%,transparent)] text-[var(--cord-light-core)]")}>
          <Icon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-semibold leading-tight">{label}</span>
          <span className="mt-0.5 block text-[15px] text-[var(--cord-dim)]">{hint}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--cord-faint)]" />
      </button>
    ) : null;

  return (
    <>
      {tabs && (
        <nav aria-label="Navigation" className="drive-dock drive-tabs cord-glass w-[calc(100vw-1.5rem)] items-center justify-around p-2.5">
          {tab("files", "Fichiers", Folder)}
          {tab("recent", "Récents", Clock)}
          {onUpload ? (
            <button
              type="button"
              data-primary
              className="cord-button size-16 shrink-0 p-0"
              onClick={() => setNewOpen(true)}
              aria-label="Nouveau"
            >
              <Plus className="size-7" strokeWidth={2.3} />
            </button>
          ) : (
            <span className="size-16" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={tabs.onShares}
            className="flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-full text-[12.5px] font-medium text-[var(--cord-dim)]"
          >
            <Link2 className="size-[22px]" />
            Partagés
          </button>
          {tab("vault", "Coffre", Lock)}
        </nav>
      )}

      {onUpload && !hideDefaultBar && (
        <div role="toolbar" aria-label="Actions" className="drive-dock drive-dock-default cord-glass flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
          <button type="button" data-primary className={PILL} onClick={onUpload}>
            <Upload className="size-[18px]" />
            <span>Envoyer<span className="hidden sm:inline"> des fichiers</span></span>
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
      )}

      {tabs && onUpload && (
        <Sheet open={newOpen} onOpenChange={setNewOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="drive-sheet cord-glass mx-3 mb-3 w-auto rounded-[32px] border-0 px-3 pb-4 pt-8"
            style={{
              background: "var(--cord-glass-sheen), color-mix(in srgb, var(--cord-ink-2) 94%, transparent)",
              marginBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <SheetTitle className="px-5 pb-3 text-[28px] font-semibold tracking-tight [font-family:var(--cord-font-display)]">Nouveau</SheetTitle>
            <div className="space-y-1.5">
              {sheetItem(Images, "Photos et vidéos", "Depuis ta galerie", tabs.onUploadMedia ?? onUpload, true)}
              {sheetItem(Upload, "Fichiers", "Depuis ton téléphone", onUpload)}
              {sheetItem(FolderPlus, "Nouveau dossier", "Dans le dossier ouvert", onNewFolder)}
              {sheetItem(Smartphone, "Sauvegarde pellicule", "En arrière-plan", tabs.onBackup)}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

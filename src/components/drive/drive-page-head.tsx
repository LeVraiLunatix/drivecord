"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROOT_PARENT, useActiveDrive, useFolderPath, type ParentId } from "@/lib/storage";
import type { FilterKind, SortDir, SortField, ViewMode } from "@/lib/view-prefs";
import { DriveBreadcrumbs } from "./breadcrumbs";
import { ViewControls } from "./view-controls";
import { SECTION_TITLES, type DriveSection } from "./sections";

type Props = {
  section: DriveSection;
  activeTag: string | null;
  driveId: string | null;
  currentFolderId: ParentId;
  onNavigate: (id: ParentId) => void;
  onDropItemOnBreadcrumb?: (sourceItemId: string, targetFolderId: ParentId) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  /** Nombre d'éléments affichés (après recherche), pour le petit compteur. */
  count?: number;
  search: string;
  onClearSearch: () => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  filterKind: FilterKind;
  onFilterChange: (v: FilterKind) => void;
  /** Cache les réglages d'affichage (coffre verrouillé, section vide…). */
  hideControls?: boolean;
};

/**
 * L'en-tête de page : le fil d'Ariane (toujours cliquable, et cible de glisser-déposer), le nom
 * de l'endroit en grand, puis les réglages d'affichage à droite.
 */
export function DrivePageHead({
  section,
  activeTag,
  driveId,
  currentFolderId,
  onNavigate,
  onDropItemOnBreadcrumb,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  count,
  search,
  onClearSearch,
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  filterKind,
  onFilterChange,
  hideControls,
}: Props) {
  const drive = useActiveDrive();
  const path = useFolderPath(driveId, currentFolderId);

  let title: string;
  if (section === "files") {
    title = currentFolderId === ROOT_PARENT ? (drive?.name ?? "Mes fichiers") : (path?.[path.length - 1]?.name ?? "…");
  } else if (section === "home") {
    title = "Accueil";
  } else if (section === "tag") {
    title = `#${activeTag ?? ""}`;
  } else {
    title = SECTION_TITLES[section];
  }

  return (
    <header className="mb-9 mt-8 sm:mb-12 sm:mt-12 lg:mb-14">
      <div className="flex items-center gap-1.5 text-[15px]">
        {section === "files" ? (
          <>
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={onGoBack}
                title="Retour (Alt+←)"
                aria-label="Retour"
                className="flex size-9 items-center justify-center rounded-full text-[var(--cord-dim)] transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="size-[18px]" />
              </button>
              <button
                type="button"
                disabled={!canGoForward}
                onClick={onGoForward}
                title="Suivant (Alt+→)"
                aria-label="Suivant"
                className="flex size-9 items-center justify-center rounded-full text-[var(--cord-dim)] transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="size-[18px]" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <DriveBreadcrumbs
                driveId={driveId}
                currentFolderId={currentFolderId}
                onNavigate={onNavigate}
                onDropItem={onDropItemOnBreadcrumb}
              />
            </div>
          </>
        ) : (
          <p className="px-1 text-[var(--cord-dim)]">{drive?.name ?? "Mon drive"}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <h1 className="cord-display min-w-0 max-w-full break-words text-[clamp(2.5rem,5.4vw,4.5rem)] leading-[1.02]">
          {title}
          {count !== undefined && (
            <span className="ml-4 align-baseline text-base font-medium tracking-normal text-[var(--cord-dim)] [font-family:var(--cord-font-body)]">
              {count} élément{count > 1 ? "s" : ""}
            </span>
          )}
        </h1>
        {!hideControls && (
          <ViewControls
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
            filterKind={filterKind}
            onFilterChange={onFilterChange}
          />
        )}
      </div>

      {search.trim() !== "" && (
        <button
          type="button"
          onClick={onClearSearch}
          className={cn("cord-button mt-6 h-11 gap-2.5 px-5 text-[14.5px]")}
          aria-label="Effacer la recherche"
        >
          Recherche : « {search.trim()} »
          <X className="size-4 text-[var(--cord-dim)]" />
        </button>
      )}
    </header>
  );
}

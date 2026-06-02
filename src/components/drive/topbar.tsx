"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  FolderUp,
  Menu,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriveBreadcrumbs } from "./breadcrumbs";
import { ViewControls } from "./view-controls";
import type { ParentId } from "@/lib/storage";
import type { FilterKind, SortDir, SortField, ViewMode } from "@/lib/view-prefs";

type Props = {
  driveId: string | null;
  currentFolderId: ParentId;
  onNavigate: (id: ParentId) => void;
  onNewFolder: () => void;
  onUploadClick: () => void;
  onFolderUploadClick: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchVisible: boolean;
  onDropItemOnBreadcrumb?: (sourceItemId: string, targetFolderId: ParentId) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  filterKind: FilterKind;
  onFilterChange: (v: FilterKind) => void;
  /** Mobile: open the sidebar drawer */
  onMenuOpen?: () => void;
};

export function DriveTopbar({
  driveId,
  currentFolderId,
  onNavigate,
  onNewFolder,
  onUploadClick,
  onFolderUploadClick,
  search,
  onSearchChange,
  searchVisible,
  onDropItemOnBreadcrumb,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  filterKind,
  onFilterChange,
  onMenuOpen,
}: Props) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div className="glass-bar shrink-0 border-b border-border/50" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">

        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          onClick={onMenuOpen}
          aria-label="Menu"
        >
          <Menu className="size-5" />
        </Button>

        {/* Back / Forward */}
        <div className="hidden items-center gap-0.5 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            disabled={!canGoBack}
            onClick={onGoBack}
            title="Retour (Alt+←)"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            disabled={!canGoForward}
            onClick={onGoForward}
            title="Suivant (Alt+→)"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Breadcrumbs — hidden when search is open on mobile */}
        <div className={`min-w-0 flex-1 ${searchOpen ? "hidden sm:block" : ""}`}>
          <DriveBreadcrumbs
            driveId={driveId}
            currentFolderId={currentFolderId}
            onNavigate={onNavigate}
            onDropItem={onDropItemOnBreadcrumb}
          />
        </div>

        {/* Search — desktop: always visible inline; mobile: toggled */}
        {searchVisible && (
          <>
            {/* Mobile search toggle */}
            {!searchOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 sm:hidden"
                onClick={() => setSearchOpen(true)}
                aria-label="Rechercher"
              >
                <Search className="size-4" />
              </Button>
            )}

            {/* Mobile search input (expanded) */}
            {searchOpen && (
              <div className="flex flex-1 items-center gap-1 sm:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Rechercher…"
                    className="pl-7 h-8"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => { setSearchOpen(false); onSearchChange(""); }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            {/* Desktop search — always visible */}
            <div className="relative hidden w-64 sm:block xl:w-72">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher dans ce drive…"
                className="pl-7"
              />
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className={`flex shrink-0 items-center gap-1 sm:gap-2 ${searchOpen ? "hidden sm:flex" : "flex"}`}>
          {/* Mobile: icon only */}
          <Button
            variant="outline"
            size="icon"
            className="size-8 sm:hidden"
            onClick={onNewFolder}
            title="Nouveau dossier"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            size="icon"
            className="size-8 sm:hidden"
            onClick={onUploadClick}
            title="Upload"
          >
            <Upload className="size-4" />
          </Button>

          {/* Desktop: icon + label */}
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={onNewFolder}>
            <FolderPlus className="size-4" />
            Nouveau dossier
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 sm:flex"
            onClick={onFolderUploadClick}
            title="Importer un dossier"
          >
            <FolderUp className="size-4" />
          </Button>
          <Button size="sm" className="hidden sm:flex" onClick={onUploadClick}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* ── View controls row ──────────────────────────────────────────────── */}
      <ViewControls
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={onSortChange}
        filterKind={filterKind}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}

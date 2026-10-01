"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  FolderUp,
  Menu,
  Plus,
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
  /** Mobile web: open the sidebar drawer */
  onMenuOpen?: () => void;
  /** Native app: a compact drive/sections menu rendered in the hamburger slot. */
  nativeMenu?: React.ReactNode;
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
  nativeMenu,
}: Props) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div
      className="glass-bar sticky top-0 z-30 shrink-0 border-b border-border/50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      // In the Tauri desktop shell the whole topbar is the window drag handle.
      // `"deep"` = a mousedown anywhere in the subtree drags — except on
      // clickable elements (buttons, the search input), which Tauri excludes.
      data-tauri-drag-region="deep"
    >
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="drive-topbar-row flex items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">

        {/* Hamburger — mobile web only (hidden in the native app, which uses the
            bottom tab bar + the native drive menu below). */}
        <Button
          variant="ghost"
          size="icon"
          className="drive-hamburger shrink-0 lg:hidden"
          onClick={onMenuOpen}
          aria-label="Menu"
        >
          <Menu className="size-5" />
        </Button>

        {/* Native app: compact drive switcher + sections (replaces the drawer). */}
        {nativeMenu && <div className="drive-native-menu shrink-0">{nativeMenu}</div>}

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
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher dans ce drive…"
                className="h-9 rounded-lg border-transparent bg-muted/40 pl-9 pr-12 shadow-none transition-colors focus-visible:bg-background"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground xl:block">Ctrl K</kbd>
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

          {/* Desktop: one calm entry point */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="hidden gap-1.5 sm:flex">
                <Plus className="size-4" />
                Nouveau
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onUploadClick}><Upload className="size-4" />Envoyer des fichiers</DropdownMenuItem>
              <DropdownMenuItem onClick={onFolderUploadClick}><FolderUp className="size-4" />Envoyer un dossier</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNewFolder}><FolderPlus className="size-4" />Nouveau dossier</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

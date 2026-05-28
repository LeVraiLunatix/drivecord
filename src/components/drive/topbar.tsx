"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FolderPlus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriveBreadcrumbs } from "./breadcrumbs";
import { ViewControls } from "./view-controls";
import type { ParentId } from "@/lib/storage";
import type { FilterKind, SortDir, SortField, ViewMode } from "@/lib/view-prefs";

type Props = {
  currentFolderId: ParentId;
  onNavigate: (id: ParentId) => void;
  onNewFolder: () => void;
  onUploadClick: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchVisible: boolean;
  /** Drag an item onto a breadcrumb to move it into that folder. */
  onDropItemOnBreadcrumb?: (sourceItemId: string, targetFolderId: ParentId) => void;
  // History navigation
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  // View preferences
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  filterKind: FilterKind;
  onFilterChange: (v: FilterKind) => void;
};

export function DriveTopbar({
  currentFolderId,
  onNavigate,
  onNewFolder,
  onUploadClick,
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
}: Props) {
  return (
    <div className="border-b border-border/50">
      {/* Top row: breadcrumbs + search + action buttons */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        {/* Back / Forward */}
        <div className="flex shrink-0 items-center gap-0.5">
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

        <div className="min-w-0 flex-1">
          <DriveBreadcrumbs
            currentFolderId={currentFolderId}
            onNavigate={onNavigate}
            onDropItem={onDropItemOnBreadcrumb}
          />
        </div>
        {searchVisible && (
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Rechercher dans ce drive…"
              className="pl-7"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onNewFolder}>
            <FolderPlus className="size-4" />
            Nouveau dossier
          </Button>
          <Button size="sm" onClick={onUploadClick}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* Second row: view mode toggle + filter pills + sort controls */}
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

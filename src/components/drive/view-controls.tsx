"use client";

import * as React from "react";
import {
  ArrowUpAZ,
  ArrowDownAZ,
  ArrowUpDown,
  Grid2x2,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { nativeMenuAvailable, presentNativeMenu } from "@/lib/native-menu";
import type { FilterKind, SortDir, SortField, ViewMode } from "@/lib/view-prefs";

type Props = {
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  filterKind: FilterKind;
  onFilterChange: (v: FilterKind) => void;
};

const FILTER_OPTIONS: { kind: FilterKind; label: string }[] = [
  { kind: "all", label: "Tous" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Vidéos" },
  { kind: "audio", label: "Audio" },
  { kind: "pdf", label: "PDF" },
  { kind: "doc", label: "Documents" },
  { kind: "spreadsheet", label: "Tableurs" },
  { kind: "archive", label: "Archives" },
  { kind: "code", label: "Code" },
];

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "name", label: "Nom" },
  { field: "date", label: "Date de modification" },
  { field: "size", label: "Taille" },
  { field: "type", label: "Type de fichier" },
];

const SORT_LABELS: Record<SortField, string> = {
  name: "Nom",
  date: "Date",
  size: "Taille",
  type: "Type",
};

export function ViewControls({
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  filterKind,
  onFilterChange,
}: Props) {
  const toggleDir = () =>
    onSortChange(sortField, sortDir === "asc" ? "desc" : "asc");

  const [useNative, setUseNative] = React.useState(false);
  React.useEffect(() => { setUseNative(nativeMenuAvailable()); }, []);

  // Native iOS: pick the sort field via a real Liquid Glass action sheet.
  const openNativeSort = async () => {
    const i = await presentNativeMenu({
      title: "Trier par",
      items: SORT_OPTIONS.map((o) => ({ label: o.label, selected: o.field === sortField })),
    });
    if (i >= 0) onSortChange(SORT_OPTIONS[i].field, sortDir);
  };

  const sortButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowUpDown className="size-3" />
      {SORT_LABELS[sortField]}
    </Button>
  );

  return (
    <div className="flex items-center gap-2 border-b border-border/30 bg-background/30 px-6 py-1.5">
      {/* Grid / list toggle */}
      <div className="flex items-center gap-0.5 rounded-md border border-border/50 p-0.5">
        <button
          onClick={() => onViewModeChange("grid")}
          title="Vue grille"
          className={cn(
            "flex size-7 items-center justify-center rounded transition-colors",
            viewMode === "grid"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Grid2x2 className="size-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          title="Vue liste"
          className={cn(
            "flex size-7 items-center justify-center rounded transition-colors",
            viewMode === "list"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <List className="size-3.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-5 w-px shrink-0 bg-border/50" />

      {/* Filter pills — scrollable on narrow screens */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            onClick={() => onFilterChange(opt.kind)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              filterKind === opt.kind
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-5 w-px shrink-0 bg-border/50" />

      {/* Sort field + direction */}
      <div className="flex shrink-0 items-center gap-0.5">
        {useNative ? (
          <span onClick={openNativeSort}>{sortButton}</span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{sortButton}</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.field}
                  onSelect={() => onSortChange(opt.field, sortDir)}
                  className={cn(
                    sortField === opt.field && "font-semibold text-foreground",
                  )}
                >
                  {opt.label}
                  {sortField === opt.field && (
                    <span className="ml-auto text-primary">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={toggleDir}
          title={sortDir === "asc" ? "Croissant — cliquer pour inverser" : "Décroissant — cliquer pour inverser"}
        >
          {sortDir === "asc" ? (
            <ArrowUpAZ className="size-3.5" />
          ) : (
            <ArrowDownAZ className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

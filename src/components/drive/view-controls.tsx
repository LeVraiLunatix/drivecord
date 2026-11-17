"use client";

import * as React from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Grid2x2,
  List,
  ListFilter,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNativeAnchorMenu } from "@/lib/use-native-anchor-menu";
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
  { kind: "all", label: "Tous les types" },
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

const BTN = "cord-button h-11 gap-2 px-4 text-[14.5px] sm:h-[46px] sm:px-5";

/**
 * Les réglages d'affichage, rangés : un filtre, un tri, grille ou liste. Rien n'est affiché
 * en permanence qui ne serve pas (plus de rangée de pastilles).
 */
export function ViewControls({
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  filterKind,
  onFilterChange,
}: Props) {
  const toggleDir = () => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc");
  const filterLabel = FILTER_OPTIONS.find((o) => o.kind === filterKind)?.label ?? "Filtrer";
  const filtering = filterKind !== "all";

  // Native iOS : un vrai UIMenu (Liquid Glass) ancré au bouton.
  const sortItems = React.useMemo(
    () => SORT_OPTIONS.map((o) => ({ label: o.label, selected: o.field === sortField })),
    [sortField],
  );
  const { ref: sortRef, active: nativeSort } = useNativeAnchorMenu({
    id: "sort",
    items: sortItems,
    onSelect: (i) => { if (i >= 0) onSortChange(SORT_OPTIONS[i].field, sortDir); },
    title: "Trier par",
  });

  const sortButton = (
    <button type="button" className={BTN} aria-label={`Trier par ${SORT_LABELS[sortField]}`}>
      Trier : {SORT_LABELS[sortField]}
      <ChevronDown className="size-4 text-[var(--cord-dim)]" />
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
      {/* Filtre par type */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(BTN, filtering && "ring-2 ring-[var(--cord-light-mid)]")}
            aria-label={filtering ? `Filtre actif : ${filterLabel}` : "Filtrer par type"}
          >
            <ListFilter className="size-4 text-[var(--cord-dim)]" />
            <span className={cn(!filtering && "max-sm:sr-only")}>{filtering ? filterLabel : "Filtrer"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={12}
          className="cord-glass w-60 rounded-[20px] border-0 p-2"
          style={{ background: "var(--cord-glass-sheen), color-mix(in srgb, var(--cord-ink-2) 92%, transparent)" }}
        >
          <DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Afficher</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FILTER_OPTIONS.map((o) => (
            <DropdownMenuItem key={o.kind} className="h-10 gap-3 rounded-xl px-3" onSelect={() => onFilterChange(o.kind)}>
              {o.label}
              {filterKind === o.kind && <Check className="ml-auto size-4 opacity-70" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tri */}
      <div className="flex items-center gap-1.5">
        {nativeSort ? (
          <button
            type="button"
            ref={sortRef as React.Ref<HTMLButtonElement>}
            className={BTN}
            aria-label={`Trier par ${SORT_LABELS[sortField]}`}
          >
            Trier : {SORT_LABELS[sortField]}
            <ChevronDown className="size-4 text-[var(--cord-dim)]" />
          </button>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{sortButton}</DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={12}
              className="cord-glass w-64 rounded-[20px] border-0 p-2"
              style={{ background: "var(--cord-glass-sheen), color-mix(in srgb, var(--cord-ink-2) 92%, transparent)" }}
            >
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.field}
                  className={cn("h-10 gap-3 rounded-xl px-3", sortField === o.field && "font-semibold")}
                  onSelect={() => onSortChange(o.field, sortDir)}
                >
                  {o.label}
                  {sortField === o.field && <Check className="ml-auto size-4 opacity-70" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          className="cord-menu-button inline-flex size-11 items-center justify-center sm:size-[46px]"
          onClick={toggleDir}
          title={sortDir === "asc" ? "Croissant, cliquer pour inverser" : "Décroissant, cliquer pour inverser"}
          aria-label={sortDir === "asc" ? "Tri croissant, inverser" : "Tri décroissant, inverser"}
        >
          {sortDir === "asc" ? <ArrowUpAZ className="size-[18px]" /> : <ArrowDownAZ className="size-[18px]" />}
        </button>
      </div>

      {/* Grille / liste */}
      <div role="group" aria-label="Affichage" className="cord-glass flex gap-1 rounded-full p-1.5">
        {([
          { mode: "grid" as const, label: "Vue grille", Icon: Grid2x2 },
          { mode: "list" as const, label: "Vue liste", Icon: List },
        ]).map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            aria-label={label}
            title={label}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              "relative z-[1] flex size-[38px] items-center justify-center rounded-full transition-colors sm:size-10",
              viewMode === mode
                ? "bg-[color-mix(in_srgb,var(--cord-light-mid)_26%,transparent)] text-foreground"
                : "text-[var(--cord-dim)] hover:text-foreground",
            )}
          >
            <Icon className="size-[17px]" />
          </button>
        ))}
      </div>
    </div>
  );
}

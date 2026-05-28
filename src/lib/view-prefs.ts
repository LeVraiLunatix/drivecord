"use client";

/**
 * View preference state: view mode (grid/list), sort, filter.
 * Persisted to localStorage so settings survive page reloads.
 */

import * as React from "react";
import type { FileKind } from "./utils/file-icons";

export type ViewMode = "grid" | "list";
export type SortField = "name" | "date" | "size" | "type";
export type SortDir = "asc" | "desc";
export type FilterKind = "all" | FileKind;

const K_VIEW = "discloud:view-mode";
const K_SORT_FIELD = "discloud:sort-field";
const K_SORT_DIR = "discloud:sort-dir";
const K_FILTER = "discloud:filter-kind";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v != null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore
  }
}

export interface ViewPrefs {
  viewMode: ViewMode;
  sortField: SortField;
  sortDir: SortDir;
  filterKind: FilterKind;
}

/**
 * Hook that exposes view preferences backed by localStorage.
 *
 * Initial state is always the default ("grid", "name", "asc", "all") to
 * avoid an SSR/hydration mismatch. A useEffect loads the persisted values
 * from localStorage after mount.
 */
export function useViewPrefs() {
  const [prefs, _setPrefs] = React.useState<ViewPrefs>({
    viewMode: "grid",
    sortField: "name",
    sortDir: "asc",
    filterKind: "all",
  });

  // Load persisted prefs once the component is mounted (client-only).
  React.useEffect(() => {
    _setPrefs({
      viewMode: read<ViewMode>(K_VIEW, "grid"),
      sortField: read<SortField>(K_SORT_FIELD, "name"),
      sortDir: read<SortDir>(K_SORT_DIR, "asc"),
      filterKind: read<FilterKind>(K_FILTER, "all"),
    });
  }, []);

  const setViewMode = React.useCallback((v: ViewMode) => {
    _setPrefs((p) => ({ ...p, viewMode: v }));
    write(K_VIEW, v);
  }, []);

  const setSortField = React.useCallback((v: SortField) => {
    _setPrefs((p) => ({ ...p, sortField: v }));
    write(K_SORT_FIELD, v);
  }, []);

  const setSortDir = React.useCallback((v: SortDir) => {
    _setPrefs((p) => ({ ...p, sortDir: v }));
    write(K_SORT_DIR, v);
  }, []);

  const setFilterKind = React.useCallback((v: FilterKind) => {
    _setPrefs((p) => ({ ...p, filterKind: v }));
    write(K_FILTER, v);
  }, []);

  return {
    ...prefs,
    setViewMode,
    setSortField,
    setSortDir,
    setFilterKind,
  };
}

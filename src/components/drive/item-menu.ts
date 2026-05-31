/**
 * Shared menu definition for item-card (grid view) and item-row (list view).
 */

import type { DriveItem } from "@/lib/storage";

export type ItemAction =
  | "open"
  | "download"
  | "rename"
  | "favorite"
  | "lock"
  | "delete"
  | "move"
  | "tag"
  | "color";

export type MenuEntry =
  | { kind: "item"; label: string; action: ItemAction; destructive?: boolean }
  | { kind: "separator" };

export function buildItemMenu(item: DriveItem): MenuEntry[] {
  const isFolder = item.kind === "folder";
  const entries: MenuEntry[] = [
    {
      kind: "item",
      label: isFolder ? "Ouvrir" : "Télécharger",
      action: isFolder ? "open" : "download",
    },
  ];
  if (!isFolder) {
    entries.push({
      kind: "item",
      label: item.favorite ? "Retirer des favoris" : "Mettre en favori",
      action: "favorite",
    });
    entries.push({
      kind: "item",
      label: item.locked ? "Sortir du coffre-fort" : "Mettre dans le coffre-fort",
      action: "lock",
    });
    entries.push({ kind: "item", label: "Gérer les tags…", action: "tag" });
  }
  if (isFolder) {
    entries.push({ kind: "item", label: "Couleur du dossier…", action: "color" });
  }
  entries.push({ kind: "item", label: "Renommer", action: "rename" });
  entries.push({ kind: "item", label: "Déplacer vers…", action: "move" });
  entries.push({ kind: "separator" });
  entries.push({
    kind: "item",
    label: "Supprimer",
    action: "delete",
    destructive: true,
  });
  return entries;
}

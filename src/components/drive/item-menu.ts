/**
 * Shared menu definition for item-card (grid view) and item-row (list view).
 */

import type { DriveItem } from "@/lib/storage";
import { nativeMenuAvailable, presentNativeMenu } from "@/lib/native-menu";

export { nativeMenuAvailable };

export type ItemAction =
  | "open"
  | "download"
  | "share"
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
    if (!item.locked) {
      entries.push({ kind: "item", label: "Partager par lien…", action: "share" });
    }
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

/**
 * Present the item menu as a native iOS Liquid Glass action sheet and resolve
 * with the chosen action (or null if cancelled). Used on the native app where
 * a real system sheet beats the web dropdown.
 */
export async function presentItemMenuNative(
  menu: MenuEntry[],
  title: string,
): Promise<ItemAction | null> {
  const items = menu.filter(
    (m): m is Extract<MenuEntry, { kind: "item" }> => m.kind === "item",
  );
  const i = await presentNativeMenu({
    title,
    items: items.map((m) => ({ label: m.label, destructive: m.destructive })),
  });
  if (i < 0 || i >= items.length) return null;
  return items[i].action;
}

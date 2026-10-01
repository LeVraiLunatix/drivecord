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
  | "encrypt"
  | "rename"
  | "favorite"
  | "lock"
  | "delete"
  | "move"
  | "tag"
  | "color"
  | "restore";

export type MenuEntry =
  | { kind: "item"; label: string; action: ItemAction; destructive?: boolean }
  | { kind: "separator" };

export function buildItemMenu(item: DriveItem): MenuEntry[] {
  const isFolder = item.kind === "folder";
  // In the trash: put it back, or erase it for good — nothing else makes sense there.
  if (item.trashed) {
    return [
      { kind: "item", label: "Restaurer", action: "restore" },
      { kind: "separator" },
      { kind: "item", label: "Supprimer définitivement", action: "delete", destructive: true },
    ];
  }
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
    if (!item.locked && !item.cryptoVersion) {
      // Plaintext (API upload) or legacy single-IV file → re-upload in the end-to-end format.
      entries.push({ kind: "item", label: "Chiffrer maintenant", action: "encrypt" });
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

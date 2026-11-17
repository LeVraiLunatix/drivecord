/** Les « pièces » du drive : ce que la barre du haut, le menu mobile et le menu natif permettent d'ouvrir. */
export type DriveSection = "files" | "recent" | "favorites" | "vault" | "trash" | "tag";

export const SECTION_TITLES: Record<Exclude<DriveSection, "tag" | "files">, string> = {
  recent: "Récents",
  favorites: "Favoris",
  vault: "Coffre-fort",
  trash: "Corbeille",
};

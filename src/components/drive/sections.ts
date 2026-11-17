/** Les « pièces » du drive : ce que la barre du haut, le menu mobile et le menu natif permettent d'ouvrir. */
export type DriveSection = "home" | "files" | "recent" | "favorites" | "vault" | "trash" | "tag";

export const SECTION_TITLES: Record<Exclude<DriveSection, "tag" | "files" | "home">, string> = {
  recent: "Récents",
  favorites: "Favoris",
  vault: "Coffre-fort",
  trash: "Corbeille",
};

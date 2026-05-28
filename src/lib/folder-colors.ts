/**
 * Preset folder colors. Keys are stored in FolderEntry.color.
 * Using a static map so Tailwind's static analysis sees every class.
 */

export const FOLDER_COLOR_PRESETS = {
  amber:  { label: "Ambre",    iconClass: "bg-amber-500/15 text-amber-400",    swatch: "bg-amber-400"   },
  red:    { label: "Rouge",    iconClass: "bg-red-500/15 text-red-400",        swatch: "bg-red-400"     },
  orange: { label: "Orange",   iconClass: "bg-orange-500/15 text-orange-400",  swatch: "bg-orange-400"  },
  lime:   { label: "Vert clair",iconClass: "bg-lime-500/15 text-lime-400",     swatch: "bg-lime-400"    },
  green:  { label: "Vert",     iconClass: "bg-emerald-500/15 text-emerald-400",swatch: "bg-emerald-400" },
  teal:   { label: "Teal",     iconClass: "bg-teal-500/15 text-teal-400",      swatch: "bg-teal-400"    },
  cyan:   { label: "Cyan",     iconClass: "bg-cyan-500/15 text-cyan-400",      swatch: "bg-cyan-400"    },
  blue:   { label: "Bleu",     iconClass: "bg-blue-500/15 text-blue-400",      swatch: "bg-blue-400"    },
  violet: { label: "Violet",   iconClass: "bg-violet-500/15 text-violet-400",  swatch: "bg-violet-400"  },
  purple: { label: "Mauve",    iconClass: "bg-purple-500/15 text-purple-400",  swatch: "bg-purple-400"  },
  pink:   { label: "Rose",     iconClass: "bg-pink-500/15 text-pink-400",      swatch: "bg-pink-400"    },
  zinc:   { label: "Gris",     iconClass: "bg-zinc-500/15 text-zinc-400",      swatch: "bg-zinc-400"    },
} as const;

export type FolderColor = keyof typeof FOLDER_COLOR_PRESETS;

/** Returns the Tailwind icon-background class for a folder, falling back to amber. */
export function folderIconClass(color?: string): string {
  if (color && color in FOLDER_COLOR_PRESETS) {
    return FOLDER_COLOR_PRESETS[color as FolderColor].iconClass;
  }
  return FOLDER_COLOR_PRESETS.amber.iconClass;
}

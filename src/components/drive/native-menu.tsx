"use client";

import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  HardDrive,
  Lock,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { tagDot } from "@/lib/tag-colors";
import {
  setActiveDriveId,
  useActiveDrive,
  useAllDrives,
  useAllTags,
} from "@/lib/storage";

type SidebarSection = "files" | "favorites" | "vault" | "trash" | "tag";

type Props = {
  section: SidebarSection;
  onSectionChange: (s: SidebarSection) => void;
  onNavigateRoot: () => void;
  activeTag?: string | null;
  onTagSelect?: (tag: string) => void;
};

/**
 * Native-app replacement for the left drawer: a compact dropdown anchored to
 * the top bar that switches drive and jumps between sections (Favoris, Coffre,
 * Corbeille) and tags. Primary navigation lives in the bottom tab bar.
 */
export function DriveNativeMenu({
  section,
  onSectionChange,
  onNavigateRoot,
  activeTag,
  onTagSelect,
}: Props) {
  const router = useRouter();
  const activeDrive = useActiveDrive();
  const drives = useAllDrives();
  const tags = useAllTags(activeDrive?.id ?? null);
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Drives et sections">
          <ChevronsUpDown className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64">
        <DropdownMenuLabel>Mes drives</DropdownMenuLabel>
        {(drives ?? []).map((d) => (
          <DropdownMenuItem
            key={d.id}
            onClick={() => { setActiveDriveId(d.id); onNavigateRoot(); }}
          >
            <HardDrive className="size-4" />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            {d.id === activeDrive?.id && <Check className="size-4 opacity-70" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => router.push("/setup")}>
          <Plus className="size-4" />
          Ajouter un drive
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { onSectionChange("files"); onNavigateRoot(); }}>
          <HardDrive className={cn("size-4", section === "files" && "text-primary")} />
          Tous les fichiers
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSectionChange("favorites")}>
          <Star className={cn("size-4", section === "favorites" && "text-primary")} />
          Favoris
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSectionChange("vault")}>
          <Lock className={cn("size-4", section === "vault" && "text-primary")} />
          Coffre-fort
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSectionChange("trash")}>
          <Trash2 className={cn("size-4", section === "trash" && "text-primary")} />
          Corbeille
        </DropdownMenuItem>

        {tags && tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            {tags.map(({ tag, count }) => (
              <DropdownMenuItem key={tag} onClick={() => onTagSelect?.(tag)}>
                <span className={cn("size-2 shrink-0 rounded-full", tagDot(tag))} />
                <span className={cn("min-w-0 flex-1 truncate", section === "tag" && activeTag === tag && "text-primary")}>
                  #{tag}
                </span>
                <span className="text-xs tabular-nums opacity-50">{count}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

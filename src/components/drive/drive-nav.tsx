"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowUp,
  BarChart3,
  Check,
  FolderSync,
  HardDrive,
  Images,
  LogOut,
  Menu,
  MonitorDown,
  Plus,
  Search,
  Settings,
  Smartphone,
  Trash2,
  User,
} from "lucide-react";
import { Accent } from "@/kitcord";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { fullSignOut } from "@/lib/auth/logout";
import { isDesktopApp } from "@/lib/use-platform";
import { tagDot } from "@/lib/tag-colors";
import { setActiveDriveId, useActiveDrive, useAllDrives, useAllTags } from "@/lib/storage";
import { useUploadPercent } from "./use-upload-percent";
import type { DriveSection } from "./sections";

type Props = {
  section: DriveSection;
  onSectionChange: (s: DriveSection) => void;
  onNavigateRoot: () => void;
  activeTag?: string | null;
  onTagSelect?: (tag: string) => void;
  /** Le nom « Drivecord » ouvre l'accueil du drive. */
  onHome?: () => void;
  /** Mobile web : ouvre le tiroir de navigation. */
  onMenuOpen?: () => void;
  /** App native : menu compact (drives + sections) placé à la place du bouton menu. */
  nativeMenu?: React.ReactNode;
};

const LINKS: { id: DriveSection; label: string }[] = [
  { id: "files", label: "Fichiers" },
  { id: "recent", label: "Récents" },
  { id: "favorites", label: "Favoris" },
];

/**
 * La barre du haut du drive : une pilule de verre KitCord. Les sections à gauche, la recherche,
 * l'état des envois et le compte à droite. Sur téléphone elle se réduit au nom, à la recherche
 * et au menu.
 */
export function DriveNav({
  section,
  onSectionChange,
  onNavigateRoot,
  activeTag,
  onTagSelect,
  onHome,
  onMenuOpen,
  nativeMenu,
}: Props) {
  const router = useRouter();
  const upload = useUploadPercent();

  const openPalette = () => window.dispatchEvent(new Event("drivecord:open-palette"));
  const go = (s: DriveSection) => {
    onSectionChange(s);
    if (s === "files") onNavigateRoot();
  };

  return (
    <header
      className="cord-topbar drive-nav min-h-[60px] gap-3 pl-6 pr-2.5 lg:min-h-[64px] lg:pl-8 lg:pr-3.5"
      // Tauri : toute la barre déplace la fenêtre, sauf les boutons.
      data-tauri-drag-region="deep"
    >
      {onHome ? (
        <button type="button" className="cord-wordmark shrink-0 border-0 bg-transparent p-0" onClick={onHome} aria-label="Accueil du drive" aria-current={section === "home" ? "page" : undefined}>
          <Accent>Drivecord</Accent>
        </button>
      ) : (
        <Link href="/" className="cord-wordmark shrink-0">
          <Accent>Drivecord</Accent>
        </Link>
      )}

      <nav aria-label="Sections" className="cord-toplinks hidden min-w-0 flex-1 justify-center gap-1.5 lg:flex">
        {LINKS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="drive-navlink"
            aria-current={section === l.id ? "page" : undefined}
            onClick={() => go(l.id)}
          >
            {l.label}
          </button>
        ))}
        <Link href="/shares" className="drive-navlink">Partagés</Link>
        <button
          type="button"
          className="drive-navlink"
          aria-current={section === "vault" ? "page" : undefined}
          onClick={() => go("vault")}
        >
          Coffre-fort
        </button>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2.5 lg:ml-0 lg:gap-3.5">
        {/* Téléphone : une icône. Bureau : le champ, avec son raccourci. */}
        <button type="button" className="cord-menu-button inline-flex items-center justify-center lg:hidden" onClick={openPalette} aria-label="Rechercher">
          <Search className="size-[18px]" />
        </button>
        <button type="button" className="cord-button hidden h-[46px] gap-2.5 pl-4 pr-3 text-[14.5px] lg:inline-flex" onClick={openPalette} aria-label="Rechercher (Ctrl K)">
          <Search className="size-[17px] text-[var(--cord-dim)]" />
          Chercher
          <span className="cord-kbd" aria-hidden="true">Ctrl K</span>
        </button>

        {upload && (
          <span
            role="status"
            aria-label={`${upload.count} envoi${upload.count > 1 ? "s" : ""} en cours, ${upload.percent} %`}
            className="cord-menu-button inline-flex items-center justify-center"
            title={`${upload.count} envoi${upload.count > 1 ? "s" : ""} en cours · ${upload.percent} %`}
          >
            <span
              className="relative block size-7 rounded-full"
              style={{
                background: `conic-gradient(var(--cord-light-mid) ${upload.percent}%, var(--cord-line-strong) 0)`,
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              }}
            />
            <ArrowUp className="absolute size-3.5 text-[var(--cord-light-core)]" />
          </span>
        )}

        {/* Menu compact (app native) ou bouton du tiroir (mobile web). */}
        {nativeMenu && <div className="drive-native-menu shrink-0 lg:hidden">{nativeMenu}</div>}
        <button type="button" className="cord-menu-button drive-hamburger inline-flex items-center justify-center lg:hidden" onClick={onMenuOpen} aria-label="Menu">
          <Menu className="size-5" />
        </button>

        <div className="hidden lg:block">
          <AccountMenu
            section={section}
            onSectionChange={onSectionChange}
            onNavigateRoot={onNavigateRoot}
            activeTag={activeTag}
            onTagSelect={onTagSelect}
            go={(path) => router.push(path)}
          />
        </div>
      </div>
    </header>
  );
}

/** Tout ce qui n'est pas une section : drives, tags, corbeille, stats, appareils, réglages, compte. */
function AccountMenu({
  section,
  onSectionChange,
  onNavigateRoot,
  activeTag,
  onTagSelect,
  go,
}: Pick<Props, "section" | "onSectionChange" | "onNavigateRoot" | "activeTag" | "onTagSelect"> & { go: (path: string) => void }) {
  const { data: session } = useSession();
  const activeDrive = useActiveDrive();
  const drives = useAllDrives();
  const tags = useAllTags(activeDrive?.id ?? null);
  const initials = (session?.user?.name ?? session?.user?.email ?? "").trim().slice(0, 2).toUpperCase();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="cord-menu-button inline-flex items-center justify-center overflow-hidden text-[13px] font-semibold text-[var(--cord-light-core)]" aria-label="Compte, drives et réglages">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="size-full rounded-full object-cover" />
          ) : initials ? (
            initials
          ) : (
            <User className="mx-auto size-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={14}
        className="cord-glass w-72 rounded-[22px] border-0 p-2"
        // Verre dense : le fond du menu (bg-popover) écraserait la teinte du kit, on la repose en ligne.
        style={{ background: "var(--cord-glass-sheen), color-mix(in srgb, var(--cord-ink-2) 92%, transparent)" }}
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 font-normal">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{session?.user?.name ?? "Mon compte"}</p>
            {session?.user?.email && <p className="truncate text-[13px] text-muted-foreground">{session.user.email}</p>}
          </div>
          <ThemeToggle />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Mes drives</DropdownMenuLabel>
        {(drives ?? []).map((d) => (
          <DropdownMenuItem
            key={d.id}
            className="h-11 gap-3 rounded-xl px-3"
            onClick={() => { setActiveDriveId(d.id); onSectionChange("files"); onNavigateRoot(); }}
          >
            <HardDrive className="size-4" />
            <span className="truncate">{d.name}</span>
            {d.id === activeDrive?.id && <Check className="ml-auto size-4 opacity-70" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/setup")}>
          <Plus className="size-4" />
          Ajouter un drive
        </DropdownMenuItem>

        {tags && tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Tags</DropdownMenuLabel>
            {tags.map(({ tag, count }) => (
              <DropdownMenuItem
                key={tag}
                className="h-11 gap-3 rounded-xl px-3"
                onClick={() => onTagSelect?.(tag)}
              >
                <span className={cn("size-2 shrink-0 rounded-full", tagDot(tag))} />
                <span className="min-w-0 flex-1 truncate">#{tag}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                {section === "tag" && activeTag === tag && <Check className="size-4 opacity-70" />}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => onSectionChange("trash")}>
          <Trash2 className="size-4" />
          Corbeille
        </DropdownMenuItem>
        <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/stats")}>
          <BarChart3 className="size-4" />
          Statistiques
        </DropdownMenuItem>
        {isDesktopApp() ? (
          <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/desktop-sync")}>
            <FolderSync className="size-4" />
            Synchro de dossier
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/backup")}>
              <Images className="size-4" />
              Sauvegarde pellicule
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/install")}>
              <Smartphone className="size-4" />
              App iPhone
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => { window.location.href = "/download/windows"; }}>
              <MonitorDown className="size-4" />
              App Windows
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3" onClick={() => go("/settings")}>
          <Settings className="size-4" />
          Paramètres
        </DropdownMenuItem>
        <DropdownMenuItem className="h-11 gap-3 rounded-xl px-3 text-destructive focus:text-destructive" onClick={() => fullSignOut()}>
          <LogOut className="size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

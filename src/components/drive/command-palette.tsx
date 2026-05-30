"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Upload,
  FolderPlus,
  HardDrive,
  Star,
  Trash2,
  BarChart3,
  Settings,
  Smartphone,
  SunMoon,
  LogOut,
  Search,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAllDrives, setActiveDriveId } from "@/lib/storage";
import { fullSignOut } from "@/lib/auth/logout";

type Section = "files" | "favorites" | "trash";

type Command = {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
};

type Props = {
  onUpload: () => void;
  onNewFolder: () => void;
  onSection: (s: Section) => void;
};

/**
 * Cmd/Ctrl+K command palette. Self-contained: opens on the shortcut, exposes
 * navigation + quick actions, supports keyboard navigation and fuzzy-ish
 * substring filtering.
 */
export function CommandPalette({ onUpload, onNewFolder, onSection }: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const drives = useAllDrives();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  // Global Cmd/Ctrl+K toggle.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset query/selection when opening.
  React.useEffect(() => {
    if (open) { setQuery(""); setActive(0); }
  }, [open]);

  const close = () => setOpen(false);
  const act = (fn: () => void) => { close(); fn(); };

  const commands = React.useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "upload", label: "Uploader des fichiers", group: "Actions", icon: Upload, keywords: "ajouter envoyer", run: () => act(onUpload) },
      { id: "newfolder", label: "Nouveau dossier", group: "Actions", icon: FolderPlus, keywords: "créer", run: () => act(onNewFolder) },
      { id: "files", label: "Tous les fichiers", group: "Aller à", icon: HardDrive, run: () => act(() => onSection("files")) },
      { id: "favorites", label: "Favoris", group: "Aller à", icon: Star, run: () => act(() => onSection("favorites")) },
      { id: "stats", label: "Statistiques", group: "Aller à", icon: BarChart3, run: () => act(() => router.push("/stats")) },
      { id: "trash", label: "Corbeille", group: "Aller à", icon: Trash2, run: () => act(() => onSection("trash")) },
      { id: "settings", label: "Paramètres", group: "Aller à", icon: Settings, run: () => act(() => router.push("/settings")) },
      { id: "install", label: "Installer l'app", group: "Aller à", icon: Smartphone, run: () => act(() => router.push("/install")) },
      { id: "adddrive", label: "Ajouter un drive", group: "Actions", icon: FolderPlus, keywords: "webhook nouveau", run: () => act(() => router.push("/setup")) },
      { id: "theme", label: "Basculer le thème (clair/sombre)", group: "Préférences", icon: SunMoon, keywords: "dark light mode", run: () => act(() => setTheme(theme === "dark" ? "light" : "dark")) },
      { id: "logout", label: "Se déconnecter", group: "Compte", icon: LogOut, keywords: "quitter signout", run: () => act(() => fullSignOut()) },
    ];
    for (const d of drives ?? []) {
      list.push({
        id: `drive-${d.id}`,
        label: `Ouvrir « ${d.name} »`,
        group: "Drives",
        icon: HardDrive,
        keywords: "changer switch " + d.name,
        run: () => act(() => { setActiveDriveId(d.id); onSection("files"); }),
      });
    }
    return list;
  }, [drives, theme, onUpload, onNewFolder, onSection, router, setTheme]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      (c.label + " " + (c.keywords ?? "")).toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep active index in range.
  React.useEffect(() => { setActive(0); }, [query]);

  // Group the filtered commands, preserving group order of first appearance.
  const groups = React.useMemo(() => {
    const order: string[] = [];
    const map: Record<string, Command[]> = {};
    for (const c of filtered) {
      if (!map[c.group]) { map[c.group] = []; order.push(c.group); }
      map[c.group].push(c);
    }
    return order.map((g) => ({ group: g, items: map[g] }));
  }, [filtered]);

  // Flattened in the SAME order as rendered (grouped) — keyboard highlight and
  // Enter must use this, not `filtered`, otherwise the highlighted item and the
  // executed command get out of sync.
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[active]?.run(); }
  };

  // Flat index → for highlight (matches `flat` / grouped render order).
  let flatIdx = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>

        <div className="flex items-center gap-2 border-b border-border/60 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tape une commande ou cherche…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune commande.</p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group}
                </p>
                {items.map((c) => {
                  flatIdx += 1;
                  const isActive = flatIdx === active;
                  const myIdx = flatIdx;
                  return (
                    <button
                      key={c.id}
                      onClick={c.run}
                      onMouseMove={() => setActive(myIdx)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "text-foreground/90",
                      )}
                    >
                      <c.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/60" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

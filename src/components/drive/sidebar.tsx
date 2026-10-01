"use client";

import * as React from "react";
import {
  BarChart3,
  FolderSync,
  Check,
  ChevronsUpDown,
  CloudUpload,
  HardDrive,
  Images,
  MonitorDown,
  Link2,
  Lock,
  LogOut,
  Plus,
  Settings,
  Smartphone,
  Star,
  Trash2,
  User,
  Infinity as InfinityIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fullSignOut } from "@/lib/auth/logout";
import { isDesktopApp } from "@/lib/use-platform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format";
import {
  setActiveDriveId,
  useActiveDrive,
  useAllDrives,
  useAllTags,
  useDriveUsage,
} from "@/lib/storage";
import { tagDot } from "@/lib/tag-colors";

type SidebarSection = "files" | "favorites" | "vault" | "trash" | "tag";

type Props = {
  section: SidebarSection;
  onSectionChange: (s: SidebarSection) => void;
  onNavigateRoot: () => void;
  activeTag?: string | null;
  onTagSelect?: (tag: string) => void;
  /** Mobile: controlled open state */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function DriveSidebar(props: Props) {
  const { mobileOpen = false, onMobileClose } = props;

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 border-r border-border/50 bg-card/30 p-4">
        <SidebarContent {...props} onClose={undefined} />
      </aside>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent
          side="left"
          className="w-[17rem] p-0 flex flex-col gap-0"
          // Prevent Radix from auto-focusing the first interactive element
          // (the drive switcher dropdown), which made it look like the menu
          // "opened the disconnect / change-webhook popup" on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
            style={{
              paddingTop: "max(3.25rem, calc(env(safe-area-inset-top) + 1rem))",
              paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
            }}
          >
            <SidebarContent {...props} onClose={onMobileClose} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Inner sidebar content — shared between desktop aside and mobile Sheet. */
function SidebarContent({
  section,
  onSectionChange,
  onNavigateRoot,
  activeTag,
  onTagSelect,
  onClose,
}: Props & { onClose?: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const activeDrive = useActiveDrive();
  const drives = useAllDrives();
  const usage = useDriveUsage(activeDrive?.id ?? null);
  const allTags = useAllTags(activeDrive?.id ?? null);

  const used = usage?.totalBytes ?? 0;

  const close = () => onClose?.();

  return (
    <>
      <Link
        href="/"
        className="group/logo flex items-center gap-2.5 px-1 py-1 text-base font-semibold tracking-tight"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/30 transition-transform duration-300 group-hover/logo:rotate-[-8deg] group-hover/logo:scale-110">
          <CloudUpload className="size-4" />
        </span>
        drivecord
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between px-3 font-normal">
            <span className="flex min-w-0 items-center gap-2">
              <HardDrive className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{activeDrive?.name ?? "Aucun drive"}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Mes drives</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(drives ?? []).map((d) => (
            <DropdownMenuItem
              key={d.id}
              onClick={() => { setActiveDriveId(d.id); onNavigateRoot(); close(); }}
            >
              <HardDrive className="size-4" />
              <span className="truncate">{d.name}</span>
              {d.id === activeDrive?.id && <Check className="ml-auto size-4 opacity-70" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { router.push("/setup"); close(); }}>
            <Plus className="size-4" />
            Ajouter un drive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <NavButton
          label="Tous les fichiers"
          icon={HardDrive}
          active={section === "files"}
          onClick={() => { onSectionChange("files"); onNavigateRoot(); close(); }}
        />
        <NavButton
          label="Favoris"
          icon={Star}
          active={section === "favorites"}
          onClick={() => { onSectionChange("favorites"); close(); }}
        />
        <NavButton
          label="Coffre-fort"
          icon={Lock}
          active={section === "vault"}
          onClick={() => { onSectionChange("vault"); close(); }}
        />
        <NavButton
          label="Liens partagés"
          icon={Link2}
          active={false}
          onClick={() => { router.push("/shares"); close(); }}
        />
        <NavButton
          label="Statistiques"
          icon={BarChart3}
          active={false}
          onClick={() => { router.push("/stats"); close(); }}
        />
        <NavButton
          label="Corbeille"
          icon={Trash2}
          active={section === "trash"}
          onClick={() => { onSectionChange("trash"); close(); }}
        />

        {allTags && allTags.length > 0 && (
          <>
            <div className="mt-3 mb-1 flex items-center gap-1.5 px-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Tags
              </span>
            </div>
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => { onTagSelect?.(tag); close(); }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                  section === "tag" && activeTag === tag
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", tagDot(tag))} />
                <span className="min-w-0 flex-1 truncate">#{tag}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums opacity-50">{count}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Stockage illimité : pas de jauge, juste ce qu'on utilise. */}
      <div className="group/storage relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-fuchsia-500/10 p-3 transition-all duration-300 hover:border-violet-400/40 hover:shadow-[0_0_28px_-8px_rgba(168,85,247,0.5)]">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 32" className="h-7 w-14 shrink-0 overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="dc-inf" x1="0" x2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="0.5" stopColor="#a855f7" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <path
              d="M32 16C26 6 8 6 8 16s18 10 24 0 24-10 24 0-18 10-24 0Z"
              fill="none"
              stroke="url(#dc-inf)"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="dc-infinity"
              pathLength={100}
            />
          </svg>
          <div className="min-w-0">
            <p className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-sm font-semibold leading-tight text-transparent">
              Stockage illimité
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{formatBytes(used)}</span>
              {" · "}
              {usage?.fileCount ?? 0} fichier{(usage?.fileCount ?? 0) > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <Lock className="size-3 transition-colors group-hover/storage:text-emerald-400" /> chiffré de bout en bout
        </p>
      </div>

      {/* Camera-roll backup + install — just above the account.
          Desktop app: no PWA install, and camera-roll backup is replaced by
          folder sync (kDrive-style). */}
      {isDesktopApp() ? (
        <NavButton
          label="Synchro de dossier"
          icon={FolderSync}
          active={false}
          onClick={() => { router.push("/desktop-sync"); close(); }}
        />
      ) : (
        <>
          <NavButton
            label="Sauvegarde pellicule"
            icon={Images}
            active={false}
            onClick={() => { router.push("/backup"); close(); }}
          />
          <NavButton
            label="App iPhone"
            icon={Smartphone}
            active={false}
            onClick={() => { router.push("/install"); close(); }}
          />
          <NavButton
            label="App Windows"
            icon={MonitorDown}
            active={false}
            onClick={() => { window.location.href = "/download/windows"; }}
          />
        </>
      )}

      {/* ── Profile + disconnect ── */}
      {onClose ? (
        // Mobile drawer: profile info + a direct, always-visible logout button
        // (a dropdown at the very bottom is hard to reach behind the home bar).
        <div className="space-y-2">
          {session?.user && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { router.push("/settings"); close(); }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  {session.user.image ? (
                    <img src={session.user.image} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <User className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{session.user.name ?? "Mon compte"}</p>
                  <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                </div>
                <Settings className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <ThemeToggle />
            </div>
          )}
          {session?.user && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => fullSignOut()}
            >
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          )}
        </div>
      ) : (
        // Desktop: compact dropdown
        <div className="flex items-center justify-between gap-2">
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    {session.user.image ? (
                      <img src={session.user.image} alt="" className="size-6 rounded-full object-cover" />
                    ) : (
                      <User className="size-3.5" />
                    )}
                  </div>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {session.user.name ?? session.user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{session.user.name ?? "Mon compte"}</p>
                  <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="size-4" />
                  Paramètres
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => fullSignOut()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex-1" />
          )}
          <ThemeToggle />
        </div>
      )}
    </>
  );
}

function NavButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof HardDrive;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

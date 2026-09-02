"use client";

import * as React from "react";
import {
  FileUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react";
import { formatBytes } from "@/lib/utils/format";
import { isDesktopApp, tauriInvoke } from "@/lib/use-platform";

/**
 * Standalone "Import vers Drivecord" window (Tauri label `uploads`). Opened by
 * the native sync engine when files are dropped into the synced folder, closes
 * itself a few seconds after everything settles. Polls `sync_uploads_status`.
 */

type UploadItem = {
  id: string;
  name: string;
  driveName: string;
  size: number;
  state: "pending" | "encrypting" | "uploading" | "done" | "error" | string;
  progress: number;
  error: string | null;
};

const POLL_MS = 400;

function stateLabel(it: UploadItem): string {
  switch (it.state) {
    case "encrypting":
      return "Chiffrement…";
    case "uploading":
      return `${Math.round(it.progress * 100)} %`;
    case "done":
      return "Terminé";
    case "error":
      return "Échec";
    default:
      return "En attente…";
  }
}

export default function DesktopUploadsPage() {
  const [items, setItems] = React.useState<UploadItem[]>([]);

  React.useEffect(() => {
    if (!isDesktopApp()) return;
    const tick = () =>
      tauriInvoke<UploadItem[]>("sync_uploads_status")
        .then(setItems)
        .catch(() => {});
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const active = items.filter((i) => i.state !== "done" && i.state !== "error").length;
  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "error").length;

  const subtitle =
    active > 0
      ? `${active} en cours`
      : failed > 0
        ? `${failed} échec${failed > 1 ? "s" : ""}`
        : `${done} terminé${done > 1 ? "s" : ""}`;

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#0b0b0f] text-white">
      <header
        data-tauri-drag-region="deep"
        className="flex shrink-0 items-center gap-2.5 border-b border-white/10 py-3 pl-4 pr-[5rem]"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500">
          <FileUp className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Import vers Drivecord</p>
          <p className="truncate text-xs text-white/45">
            {subtitle} · chiffré de bout en bout
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,0.14)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
        {items.length === 0 ? (
          <p className="mt-10 text-center text-sm text-white/35">Aucun import en cours.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => {
              const pct =
                it.state === "encrypting"
                  ? 4
                  : Math.max(4, Math.round(it.progress * 100));
              return (
                <li key={it.id} className="rounded-xl bg-white/[0.04] p-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0">
                      {it.state === "done" ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : it.state === "error" ? (
                        <AlertCircle className="size-4 text-red-400" />
                      ) : it.state === "encrypting" ? (
                        <Lock className="size-4 text-white/55" />
                      ) : (
                        <Loader2 className="size-4 animate-spin text-white/55" />
                      )}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">{it.name}</p>
                    <span className="shrink-0 text-xs tabular-nums text-white/50">
                      {stateLabel(it)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/35">
                    <span className="min-w-0 truncate">{it.driveName}</span>
                    <span>·</span>
                    <span className="shrink-0">{formatBytes(it.size)}</span>
                  </div>

                  {(it.state === "uploading" || it.state === "encrypting") && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400 transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {it.state === "error" && it.error && (
                    <p className="mt-1.5 text-[11px] leading-snug text-red-400">
                      {it.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { MonitorSmartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Device = {
  id: string;
  deviceLabel: string;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TrustedDevicesManager() {
  const { data, mutate, isLoading } = useSWR<{ devices: Device[] }>(
    "/api/settings/devices",
    fetcher,
  );

  const revoke = async (id: string) => {
    const res = await fetch(`/api/settings/devices/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast.success("Appareil révoqué.");
      mutate();
    } else {
      toast.error("Échec de la révocation.");
    }
  };

  const devices = data?.devices ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Appareils de confiance</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Appareils sur lesquels tu t&apos;es connecté. Révoque ceux que tu ne
        reconnais pas.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : devices.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun appareil enregistré.
        </p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
            >
              <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {d.deviceLabel}
                  {d.current && (
                    <Badge variant="secondary" className="text-[10px]">
                      cet appareil
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.ip ?? "IP inconnue"} · vu le {formatDate(d.lastSeenAt)}
                </p>
              </div>
              {!d.current && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-red-400 hover:text-red-300"
                  onClick={() => revoke(d.id)}
                  aria-label={`Révoquer ${d.deviceLabel}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

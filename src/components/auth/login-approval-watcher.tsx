"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { MonitorSmartphone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { notifyLoginRequest } from "@/lib/push/local-notif";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Req = {
  id: string;
  requestingDeviceLabel: string;
  requestingLocation: string | null;
  shortCode: string;
  createdAt: string;
};

/**
 * Mounted globally: on trusted (full-session) devices, polls for incoming
 * cross-device login requests and surfaces an approve/deny dialog. Inert for
 * anonymous or pending sessions.
 */
export function LoginApprovalWatcher() {
  const { data: session } = useSession();
  const isFull = session?.level === "full";
  const [pending, setPending] = React.useState<Req | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Dernière demande déjà notifiée localement (évite de re-notifier à chaque poll).
  const notifiedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isFull) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/auth/login-requests/pending");
        if (!res.ok) return;
        const d = await res.json();
        if (stop) return;
        const next = (d.requests?.[0] as Req | undefined) ?? null;
        if (!next) {
          notifiedRef.current = null;
        } else if (notifiedRef.current !== next.id) {
          // Nouvelle demande → notification locale (app native, 1re fois).
          notifiedRef.current = next.id;
          void notifyLoginRequest({
            deviceLabel: next.requestingDeviceLabel,
            location: next.requestingLocation,
            shortCode: next.shortCode,
          });
        }
        setPending((prev) => {
          if (!next) return null;
          return !prev || prev.id !== next.id ? next : prev;
        });
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const iv = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [isFull]);

  const respond = async (action: "approve" | "deny") => {
    if (!pending) return;
    setBusy(true);
    try {
      await fetch(`/api/auth/login-requests/${pending.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (action === "approve") toast.success("Connexion approuvée.");
      else toast("Connexion refusée.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <Dialog
      open={isFull && !!pending}
      onOpenChange={(o) => {
        if (!o) setPending(null);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Nouvelle connexion demandée</DialogTitle>
          <DialogDescription>
            Quelqu&apos;un essaie de se connecter à ton compte Drivecord. Si
            c&apos;est bien toi, approuve ci-dessous.
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <MonitorSmartphone className="size-4 text-muted-foreground" />
              {pending.requestingDeviceLabel}
            </div>
            {pending.requestingLocation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {pending.requestingLocation}
              </div>
            )}
            <div className="rounded-lg border border-border/60 bg-card/40 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                Code affiché sur l&apos;autre appareil
              </p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em]">
                {pending.shortCode}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => respond("deny")} disabled={busy}>
            Refuser
          </Button>
          <Button onClick={() => respond("approve")} disabled={busy}>
            Approuver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

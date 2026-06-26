"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MonitorSmartphone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "creating" | "waiting" | "denied" | "expired" | "error";

export function CrossDeviceWait({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>("creating");
  const [shortCode, setShortCode] = React.useState("");
  const tokenRef = React.useRef<string | null>(null);

  // Create the request once on mount.
  React.useEffect(() => {
    let cancelled = false;
    const create = async () => {
      try {
        const res = await fetch("/api/auth/login-requests", { method: "POST" });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          tokenRef.current = d.pollToken;
          setShortCode(d.shortCode);
          setState("waiting");
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void create();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the request status while waiting.
  React.useEffect(() => {
    if (state !== "waiting") return;
    const token = tokenRef.current;
    if (!token) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/login-requests/status?token=${encodeURIComponent(token)}`,
        );
        const d = await res.json().catch(() => ({}));
        if (d.status === "approved") {
          clearInterval(iv);
          router.push("/drive");
          router.refresh();
        } else if (d.status === "denied") {
          clearInterval(iv);
          setState("denied");
        } else if (d.status === "expired") {
          clearInterval(iv);
          setState("expired");
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [state, router]);

  const errorText =
    state === "denied"
      ? "Connexion refusée depuis l'autre appareil."
      : state === "expired"
        ? "La demande a expiré. Réessaie."
        : "Impossible de créer la demande.";

  return (
    <div className="space-y-5 text-center">
      {state === "creating" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Préparation…</p>
        </div>
      )}

      {state === "waiting" && (
        <>
          <MonitorSmartphone className="mx-auto size-8 text-violet-400" />
          <p className="text-sm text-muted-foreground">
            Ouvre Drivecord sur un appareil déjà connecté et approuve la
            connexion. Vérifie que ce code correspond :
          </p>
          <div className="font-mono text-3xl font-bold tracking-[0.3em]">
            {shortCode}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            En attente d&apos;approbation…
          </div>
        </>
      )}

      {(state === "denied" || state === "expired" || state === "error") && (
        <p className="py-4 text-sm text-red-400" role="alert">
          {errorText}
        </p>
      )}

      <Button variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Utiliser un code par email
      </Button>
    </div>
  );
}

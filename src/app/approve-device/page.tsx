"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheckBig, Loader2, ShieldAlert, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApproverSession, parseApprovalFragment, type QrPayload } from "@/lib/e2ee-client/transfer";

type Phase = "reading" | "ready" | "working" | "done" | "denied" | "error";

/**
 * Landing page of the QR code shown by a new device ("Approuver depuis un autre appareil").
 * Reached through the phone's camera: the QR's key + nonce travel in the URL fragment, are checked
 * against the request's commitment, and one tap seals the Master Key to that device.
 */
export default function ApproveDevicePage() {
  const [phase, setPhase] = React.useState<Phase>("reading");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState("");
  const qr = React.useRef<QrPayload | null>(null);

  React.useEffect(() => {
    const payload = parseApprovalFragment(window.location.hash);
    qr.current = payload;
    (payload
      ? ApproverSession.inspectQr(payload)
      : Promise.reject(new Error("Ce lien n'est pas valide. Scanne à nouveau le QR code affiché sur le nouvel appareil."))
    ).then(
      (r) => { setLabel(r.label); setPhase("ready"); },
      (e: Error) => { setError(e.message); setPhase("error"); },
    );
  }, []);

  const approve = async () => {
    if (!qr.current) return;
    setPhase("working");
    try {
      await new ApproverSession(qr.current.id).approveWithQr(qr.current);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const deny = async () => {
    if (!qr.current) return;
    await new ApproverSession(qr.current.id).deny().catch(() => {});
    setPhase("denied");
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6" data-testid="approve-device">
          {phase === "reading" && <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}

          {phase === "ready" && (
            <>
              <div className="flex items-center gap-3">
                <Smartphone className="size-7 text-primary" />
                <div>
                  <h1 className="text-xl font-semibold">Approuver cet appareil ?</h1>
                  <p className="text-sm text-muted-foreground"><strong>{label}</strong> veut accéder à tes fichiers chiffrés.</p>
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                Approuve seulement si tu viens de scanner ce QR code toi-même, sur un écran que tu as sous les yeux. Dans le doute, refuse.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={deny}>Refuser</Button>
                <Button className="flex-1" onClick={approve} data-testid="approve-device-btn">Approuver</Button>
              </div>
            </>
          )}

          {phase === "working" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Envoi de la clé au nouvel appareil…</p>
          )}

          {phase === "done" && (
            <div className="space-y-3 text-center">
              <CircleCheckBig className="mx-auto size-10 text-emerald-500" />
              <h1 className="text-lg font-semibold">Appareil approuvé</h1>
              <p className="text-sm text-muted-foreground">{label} se déverrouille tout seul. Tu peux fermer cette page.</p>
              <Button asChild variant="outline"><Link href="/drive">Retour au drive</Link></Button>
            </div>
          )}

          {phase === "denied" && <p className="text-center text-sm text-muted-foreground">Demande refusée.</p>}
          {phase === "error" && <p className="text-sm text-destructive" data-testid="approve-device-error">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

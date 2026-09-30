"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** First-party popup opened by the embed: mints a one-shot ticket and hands it to the iframe that opened us. */
function Connect() {
  const clientId = useSearchParams().get("client_id") ?? "";
  const [msg, setMsg] = React.useState("Connexion…");
  React.useEffect(() => {
    (async () => {
      const r = await fetch("/api/embed/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) });
      const d = await r.json().catch(() => ({}));
      // Target = our own origin: the opener is the embed iframe (also drivecord.app), never the host site.
      window.opener?.postMessage({ type: "drivecord-embed-ticket", ...(r.ok ? { ticket: d.ticket } : { error: d.error ?? "Refusé." }) }, window.location.origin);
      if (r.ok) window.close();
      else setMsg(d.error ?? "Impossible de te connecter à cette application.");
    })();
  }, [clientId]);
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center text-sm">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p>{msg}</p>
    </main>
  );
}

export default function Page() {
  return <Suspense><Connect /></Suspense>;
}

"use client";

import * as React from "react";
import { authFetch, setEmbedBearer } from "@/lib/api-base";
import { initKeyring } from "@/lib/e2ee-client/keyring";
import { getDriveKeyMaterial, type DriveKeyMaterial } from "@/lib/e2ee-client/drive-keys";
import { DiscordClient } from "@/lib/discord/client";
import { parseHostMessage, type EmbedMessage, type HostMessage } from "@/lib/embed/protocol";
import { useKeyring } from "@/components/e2ee/use-keyring";

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export type EmbedPhase = "loading" | "needs-auth" | "authing" | "needs-setup" | "locked" | "ready" | "error";

type Grant = { driveId: string; appFolderId: string };
type DriveRow = { driveId: string; webhookUrl: string; dkWrapped: string | null; e2eeVersion: number };

/**
 * Common plumbing of the embed pages: host handshake (origin-pinned postMessage), sign-in through the
 * first-party popup (ticket → in-memory token), keyring, and the drive handles the page needs.
 */
export function useEmbed(clientId: string) {
  const keyring = useKeyring();
  const [origins, setOrigins] = React.useState<string[] | null>(null);
  const [hostOrigin, setHostOrigin] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<HostMessage["options"]>({});
  const [session, setSession] = React.useState<{ userId: string; grant: Grant; appName: string } | null>(null);
  const [authing, setAuthing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [drive, setDrive] = React.useState<{ client: DiscordClient; dk: DriveKeyMaterial; id: string; appFolderId: string } | null>(null);
  const hostRef = React.useRef<string | null>(null);

  const post = React.useCallback((msg: DistributiveOmit<EmbedMessage, "v" | "source">) => {
    const target = hostRef.current;
    if (target) window.parent.postMessage({ v: 1, source: "drivecord-embed", ...msg }, target);
  }, []);

  // 1. Which origins may frame us? Announce `ready` to each of them — only the real parent receives it.
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/embed/origins?client_id=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d: { origins: string[] }) => {
        if (cancelled) return;
        setOrigins(d.origins);
        for (const o of d.origins) window.parent.postMessage({ v: 1, source: "drivecord-embed", type: "ready" }, o);
      })
      .catch(() => !cancelled && setOrigins([]));
    return () => { cancelled = true; };
  }, [clientId]);

  // 2. Host → embed messages: source must be our parent window, origin must be allow-listed.
  React.useEffect(() => {
    if (!origins) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !origins.includes(e.origin)) return;
      const m = parseHostMessage(e.data);
      if (!m) return;
      hostRef.current = e.origin;
      setHostOrigin(e.origin);
      setOptions(m.options);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origins]);

  // 3. Sign-in via the first-party popup (must run from a user gesture).
  const connect = React.useCallback(() => {
    setError("");
    setAuthing(true);
    const popup = window.open(`/embed/connect?client_id=${encodeURIComponent(clientId)}`, "drivecord-connect", "popup,width=480,height=640");
    if (!popup) { setAuthing(false); setError("Le navigateur a bloqué la fenêtre de connexion."); return; }
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== popup) return;
      const d = e.data as { type?: string; ticket?: string; error?: string };
      if (d?.type !== "drivecord-embed-ticket") return;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      if (!d.ticket) { setAuthing(false); setError(d.error ?? "Connexion refusée."); return; }
      try {
        const r = await fetch("/api/embed/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: d.ticket }), credentials: "omit" });
        const s = await r.json();
        if (!r.ok) throw new Error(s.error ?? "Session refusée.");
        setEmbedBearer(s.token);
        await initKeyring(s.userId);
        setSession({ userId: s.userId, grant: s.grant, appName: s.app.name });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAuthing(false);
      }
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup.closed) { clearInterval(timer); window.removeEventListener("message", onMessage); setAuthing(false); }
    }, 500);
  }, [clientId]);

  // 4. Once the keyring is unlocked, load the drive's key + Discord client.
  React.useEffect(() => {
    if (!session || keyring.status !== "unlocked") return;
    let cancelled = false;
    (async () => {
      const res = await authFetch("/api/webhooks");
      const rows = (await res.json()) as DriveRow[];
      const row = rows.find((r) => r.driveId === session.grant.driveId);
      if (!row) throw new Error("Drive introuvable.");
      const dk = await getDriveKeyMaterial({ id: row.driveId, dkWrapped: row.dkWrapped ?? undefined, e2eeVersion: row.e2eeVersion } as never);
      if (!cancelled) setDrive({ client: DiscordClient.fromUrl(row.webhookUrl), dk, id: row.driveId, appFolderId: session.grant.appFolderId });
    })().catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [session, keyring.status]);

  let phase: EmbedPhase = "loading";
  if (error && !authing && !session) phase = "needs-auth";
  else if (origins === null) phase = "loading";
  else if (authing) phase = "authing";
  else if (!session) phase = "needs-auth";
  else if (keyring.status === "needs-setup") phase = "needs-setup";
  else if (keyring.status === "locked") phase = "locked";
  else if (keyring.status === "error") phase = "error";
  else if (drive) phase = "ready";
  else if (error) phase = "error";

  React.useEffect(() => {
    if (phase === "needs-auth") post({ type: "needs-auth" });
    else if (phase === "locked") post({ type: "locked" });
  }, [phase, post, hostOrigin]);

  return { phase, error, connect, drive, options, post, hostOrigin, appName: session?.appName ?? "", framed: origins !== null && origins.length > 0 };
}

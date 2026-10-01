/**
 * @drivecord/sdk — browser SDK. Tiny on purpose (< 10 KB gzip, zero dependencies).
 *
 *   const dc = Drivecord.init({ clientId: "app_…", redirectUri: location.origin + "/cb" });
 *   await dc.signIn();                        // OAuth 2.1 + PKCE in a popup
 *   const up = dc.mountUploader(el, { onUploaded: ({ fileId, size }) => … });
 *   dc.mountViewer(el2, { fileId });
 *   const files = await dc.api("/files");     // API v2 with the app token (auto refresh)
 *
 * Files are encrypted inside the Drivecord iframe: this SDK (and your site) never see keys or names.
 */
import { EMBED_PROTOCOL, parseEmbedMessage, type EmbedMessage } from "../../../src/lib/embed/protocol";

export type InitOptions = {
  clientId: string;
  /** Registered redirect URI; the page served there must call `Drivecord.completeSignIn()`. */
  redirectUri: string;
  /** Default https://drivecord.app */
  baseUrl?: string;
  scopes?: string[];
};
export type UploaderOptions = {
  multiple?: boolean;
  accept?: string;
  onReady?: () => void;
  onProgress?: (p: { fileId: string; percent: number }) => void;
  onUploaded?: (f: { fileId: string; size: number }) => void;
  onError?: (code: string) => void;
};
export type Mounted = { destroy(): void; iframe: HTMLIFrameElement };

type Tokens = { access_token: string; refresh_token?: string; expires_at: number };
const SS = "drivecord:sdk:";
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export class Drivecord {
  private tokens: Tokens | null = null;
  private constructor(private o: Required<InitOptions>) {
    try { const t = sessionStorage.getItem(SS + "tokens:" + o.clientId); if (t) this.tokens = JSON.parse(t); } catch { /* storage unavailable */ }
  }

  static init(o: InitOptions): Drivecord {
    if (!/^app_[\w-]{8,64}$/.test(o.clientId)) throw new Error("Drivecord: clientId invalide");
    return new Drivecord({ baseUrl: "https://drivecord.app", scopes: ["app_folder:read", "app_folder:write"], ...o });
  }

  private get base() { return this.o.baseUrl.replace(/\/+$/, ""); }
  get signedIn() { return Boolean(this.tokens); }

  /** Opens the consent popup (call from a click handler). Resolves once the app holds a token. */
  async signIn(): Promise<void> {
    const verifier = rand(48);
    const state = rand(16);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem(SS + "pkce:" + state, verifier);
    const url = `${this.base}/oauth/authorize?` + new URLSearchParams({
      client_id: this.o.clientId, redirect_uri: this.o.redirectUri, response_type: "code", code_challenge: challenge,
      code_challenge_method: "S256", scope: this.o.scopes.join(" "), state,
    });
    const popup = window.open(url, "drivecord-signin", "popup,width=480,height=720");
    if (!popup) throw new Error("Drivecord: popup bloquée");
    const redirectOrigin = new URL(this.o.redirectUri).origin;
    await new Promise<void>((resolve, reject) => {
      const done = (fn: () => void) => { window.removeEventListener("message", onMsg); clearInterval(timer); fn(); };
      const onMsg = async (e: MessageEvent) => {
        if (e.origin !== redirectOrigin || e.source !== popup) return;
        const d = e.data as { type?: string; code?: string; state?: string; error?: string };
        if (d?.type !== "drivecord-oauth-callback") return;
        if (d.error || d.state !== state || !d.code) return done(() => reject(new Error(d.error ?? "Drivecord: état invalide")));
        try { await this.exchange({ grant_type: "authorization_code", code: d.code, code_verifier: sessionStorage.getItem(SS + "pkce:" + state) ?? "", redirect_uri: this.o.redirectUri }); done(resolve); }
        catch (err) { done(() => reject(err)); }
      };
      window.addEventListener("message", onMsg);
      const timer = setInterval(() => { if (popup.closed) done(() => reject(new Error("Drivecord: connexion annulée"))); }, 500);
    });
  }

  /** Call on the redirect page: hands `code`/`state` back to the opener, then closes the popup. */
  static completeSignIn(): void {
    const p = new URLSearchParams(location.search);
    window.opener?.postMessage({ type: "drivecord-oauth-callback", code: p.get("code") ?? undefined, state: p.get("state") ?? undefined, error: p.get("error") ?? undefined }, location.origin);
    window.close();
  }

  private async exchange(params: Record<string, string>) {
    const r = await fetch(`${this.base}/api/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.o.clientId, ...params }) });
    const d = await r.json();
    if (!r.ok) { this.signOut(); throw new Error(d.error_description ?? d.error ?? "Drivecord: échange refusé"); }
    this.tokens = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in - 30) * 1000 };
    try { sessionStorage.setItem(SS + "tokens:" + this.o.clientId, JSON.stringify(this.tokens)); } catch { /* ignore */ }
  }

  signOut(): void {
    this.tokens = null;
    try { sessionStorage.removeItem(SS + "tokens:" + this.o.clientId); } catch { /* ignore */ }
  }

  /** Authenticated call to API v2 (`path` like "/files"); refreshes the token when needed. */
  async api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.tokens) throw new Error("Drivecord: non connecté");
    if (Date.now() >= this.tokens.expires_at) {
      if (!this.tokens.refresh_token) { this.signOut(); throw new Error("Drivecord: session expirée"); }
      await this.exchange({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token });
    }
    const r = await fetch(`${this.base}/api/v2${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.tokens!.access_token}` } });
    if (r.status === 204) return undefined as T;
    const d = await r.json();
    if (!r.ok) throw Object.assign(new Error(d.error?.message ?? "Drivecord: erreur API"), { code: d.error?.code, status: r.status });
    return d as T;
  }

  private mount(el: HTMLElement, path: string, o: UploaderOptions): Mounted {
    const iframe = document.createElement("iframe");
    iframe.src = `${this.base}${path}${path.includes("?") ? "&" : "?"}client_id=${encodeURIComponent(this.o.clientId)}`;
    iframe.title = "Drivecord";
    iframe.style.cssText = "border:0;width:100%;min-height:160px;color-scheme:normal";
    // Popups are needed for sign-in; same-origin lets the embed use its own storage. No top navigation.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms allow-downloads");
    iframe.allow = "publickey-credentials-get *; clipboard-write";
    const baseOrigin = new URL(this.base).origin;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.origin !== baseOrigin) return;
      const m: EmbedMessage | null = parseEmbedMessage(e.data);
      if (!m) return;
      if (m.type === "ready") {
        iframe.contentWindow!.postMessage({ v: EMBED_PROTOCOL, source: "drivecord-host", type: "init", options: { multiple: o.multiple, accept: o.accept } }, baseOrigin);
        o.onReady?.();
      } else if (m.type === "resize") iframe.style.height = Math.max(160, m.height) + "px";
      else if (m.type === "progress") o.onProgress?.({ fileId: m.fileId, percent: m.percent });
      else if (m.type === "uploaded") o.onUploaded?.({ fileId: m.fileId, size: m.size });
      else if (m.type === "error") o.onError?.(m.code);
    };
    window.addEventListener("message", onMsg);
    el.appendChild(iframe);
    return { iframe, destroy: () => { window.removeEventListener("message", onMsg); iframe.remove(); } };
  }

  mountUploader(el: HTMLElement, o: UploaderOptions = {}): Mounted { return this.mount(el, "/embed/upload", o); }
  mountViewer(el: HTMLElement, o: { fileId: string; onError?: (code: string) => void }): Mounted {
    if (!/^[\w-]{1,64}$/.test(o.fileId)) throw new Error("Drivecord: fileId invalide");
    return this.mount(el, `/embed/view/${o.fileId}`, { onError: o.onError });
  }
}
export default Drivecord;

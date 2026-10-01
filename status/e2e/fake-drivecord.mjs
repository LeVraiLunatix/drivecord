/**
 * A stand-in for Drivecord and the third parties it depends on, for the e2e run: serves what a healthy
 * deployment answers to every probe, and can be switched into failure scenarios.
 *
 *   node e2e/fake-drivecord.mjs [port]          (default 3190)
 *   GET /__scenario?name=ok|degraded|outage|dbdown|nohealth|maintenance|hubdown
 *
 * Everything lives under one origin, with a path prefix per third party (see e2e/status.e2e.mjs).
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? process.env.FAKE_PORT ?? 3190);
let scenario = "ok";

const HTML = "<!DOCTYPE html><html lang=\"fr\"><head><title>fake</title></head><body>ok</body></html>";
const send = (res, status, body, type = "application/json", headers = {}) => {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const json = (res, status, body) => send(res, status, body);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function healthComponents() {
  const c = (id, status = "operational", latencyMs = 40) => ({ id, status, latencyMs: status === "down" || status === "unknown" ? null : latencyMs });
  const base = [c("db"), c("discord"), c("auth"), c("email"), c("push", "unknown"), c("patreon")];
  if (scenario === "dbdown") return { components: base.map((x) => (x.id === "db" ? c("db", "down") : x)), maintenance: null };
  if (scenario === "maintenance") {
    return { components: base.map((x) => (["email", "push"].includes(x.id) ? c(x.id, "maintenance") : x)), maintenance: { message: "Maintenance programmée : l'envoi d'e-mails est interrompu ce soir." } };
  }
  return { components: base, maintenance: null };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const p = url.pathname;

  if (p === "/__scenario") {
    scenario = url.searchParams.get("name") ?? "ok";
    return json(res, 200, { scenario });
  }
  if (p === "/__ping") return json(res, 200, { scenario });

  // ── Drivecord ──────────────────────────────────────────────────────────────
  if (p === "/api/health/components") {
    if (scenario === "nohealth") return send(res, 404, HTML, "text/html");
    return json(res, 200, healthComponents());
  }
  if (scenario === "dbdown" && ["/api/v2/me", "/api/v1/me", "/api/e2ee/keys", "/api/settings/passkeys", "/drive"].includes(p)) return json(res, 503, { error: "db" });
  if (scenario === "outage" && ["/api/v2/me", "/api/v1/me"].includes(p)) return json(res, 500, { error: "boom" });
  if (scenario === "degraded" && p === "/docs") await wait(2600);

  switch (p) {
    case "/":
    case "/docs":
    case "/s/statut-sonde":
    case "/embed/upload":
      return send(res, 200, HTML, "text/html; charset=utf-8");
    case "/drive":
    case "/admin":
      return send(res, 307, "Redirecting...", "text/plain", { location: "/login" });
    case "/api/auth/providers":
      return json(res, 200, { cord: { id: "cord" }, credentials: { id: "credentials" } });
    case "/api/auth/csrf":
      return json(res, 200, { csrfToken: "x" });
    case "/api/auth/login-requests/status":
      return json(res, 200, { status: "expired" });
    case "/api/settings/passkeys":
    case "/api/settings/2fa":
    case "/api/e2ee/keys":
    case "/api/account/vault-pin":
      return json(res, 401, { error: "Non authentifié." });
    case "/api/drive/statut-sonde/stats":
      return json(res, 401, { error: "Non autorisé." });
    case "/api/v1/me":
      return json(res, 401, { error: "Clé API invalide ou manquante." });
    case "/api/v2/me":
      return json(res, 401, { error: { code: "unauthorized", message: "Jeton invalide." } });
    case "/api/s/statut-sonde":
      return json(res, 404, { error: "Lien introuvable." });
    case "/api/v1/public/statut-sonde":
      return send(res, 404, "Not found", "text/plain");
    case "/api/proxy":
      return send(res, 400, "Missing `u` query parameter", "text/plain");
    case "/.well-known/oauth-authorization-server":
      return json(res, 200, { issuer: "x", token_endpoint: "x/api/oauth/token" });
    case "/api/oauth/token":
      return send(res, 405, "", "text/plain");
    case "/openapi-v2.json":
      return json(res, 200, { openapi: "3.1.0" });

    // ── Third parties, one path prefix each ────────────────────────────────
    case "/discord/api/v10/gateway":
      return scenario === "outage" ? json(res, 503, {}) : json(res, 200, { url: "wss://gateway.example" });
    case "/discord-cdn/embed/avatars/0.png":
      return send(res, 200, "png", "image/png");
    case "/google/.well-known/openid-configuration":
    case "/cord/.well-known/openid-configuration":
      return json(res, 200, { issuer: "x" });
    case "/hub/":
      return scenario === "hubdown" ? send(res, 502, "Bad Gateway", "text/plain") : send(res, 200, HTML, "text/html; charset=utf-8");
    case "/updater/latest.json":
      return json(res, 200, { version: "0.1.0" });
    case "/ios/source.json":
      return json(res, 200, { apps: [] });
    case "/control":
      return send(res, 200, "ok", "text/plain");
    default:
      return send(res, 404, HTML, "text/html");
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake drivecord on http://127.0.0.1:${PORT}`));

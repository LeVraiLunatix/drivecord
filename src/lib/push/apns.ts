/**
 * Envoi de notifications push Apple (APNs) — sans dépendance externe.
 *
 * Auth par jeton JWT ES256 (clé .p8 du compte Apple Developer) + HTTP/2 natif.
 * Variables d'environnement :
 *   APNS_TEAM_ID     — Team ID Apple (10 caractères).
 *   APNS_KEY_ID      — Key ID de la clé .p8.
 *   APNS_PRIVATE_KEY — contenu PEM du fichier .p8 (les "\n" littéraux sont acceptés).
 *   APNS_TOPIC       — bundle id de l'app (défaut : com.lunatix.drivecord).
 *   APNS_ENV         — "production" (défaut) ou "sandbox" (build de dev Xcode).
 *
 * Si les variables ne sont pas configurées, tout est no-op : le flux
 * d'approbation cross-device continue de fonctionner par polling web.
 */
import crypto from "crypto";
import http2 from "http2";
import { prisma } from "@/lib/prisma";

const TOPIC = process.env.APNS_TOPIC ?? "com.lunatix.drivecord";
const HOST =
  process.env.APNS_ENV === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";

/** Vrai si les credentials APNs sont présents (sinon, tout est no-op). */
export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_TEAM_ID &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_PRIVATE_KEY,
  );
}

// ── JWT ES256 (mis en cache ~45 min : Apple exige entre 20 et 60 min) ────────
let cachedJwt: { value: string; issuedAt: number } | null = null;

function getJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 45 * 60) return cachedJwt.value;

  const header = { alg: "ES256", kid: process.env.APNS_KEY_ID! };
  const claims = { iss: process.env.APNS_TEAM_ID!, iat: now };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;

  // La clé peut arriver avec des "\n" littéraux (variable d'env single-line).
  const pem = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signature = crypto
    .createSign("SHA256")
    .update(unsigned)
    .sign({ key: pem, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  cachedJwt = { value: `${unsigned}.${signature}`, issuedAt: now };
  return cachedJwt.value;
}

export type ApnsResult = "ok" | "bad-token" | "error";

/** Envoie une alerte APNs à un jeton d'appareil. */
export function sendApnsAlert(
  deviceToken: string,
  alert: { title: string; body: string },
  data?: Record<string, string>,
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const client = http2.connect(HOST);
    const payload = JSON.stringify({
      aps: {
        alert,
        sound: "default",
        "interruption-level": "time-sensitive",
      },
      ...data,
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${getJwt()}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 120),
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      client.close();
      if (status === 200) return resolve("ok");
      // 410 = jeton plus enregistré ; 400 BadDeviceToken = jeton invalide.
      if (status === 410 || body.includes("BadDeviceToken")) {
        return resolve("bad-token");
      }
      console.error("[apns] send failed", status, body);
      resolve("error");
    });
    req.on("error", (err) => {
      console.error("[apns] http2 error", err);
      client.close();
      resolve("error");
    });
    req.setTimeout(10_000, () => {
      req.close();
      client.close();
      resolve("error");
    });
    req.end(payload);
  });
}

/**
 * Notifie tous les appareils natifs de l'utilisateur qu'une connexion demande
 * approbation (style Epic Games). Nettoie les jetons morts. Best-effort.
 */
export async function sendLoginRequestPush(
  userId: string,
  info: { shortCode: string; deviceLabel: string; location?: string | null },
): Promise<void> {
  if (!apnsConfigured()) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const where = info.location ? ` (${info.location})` : "";
  const alert = {
    title: "Demande de connexion",
    body: `${info.deviceLabel}${where} veut se connecter · code ${info.shortCode}. Ouvre l'app pour approuver ou refuser.`,
  };

  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendApnsAlert(t.token, alert, { type: "login-request" }).then(
        (r) => [t.token, r] as const,
      ),
    ),
  );

  const dead = results
    .filter(
      (r): r is PromiseFulfilledResult<readonly [string, ApnsResult]> =>
        r.status === "fulfilled" && r.value[1] === "bad-token",
    )
    .map((r) => r.value[0]);
  if (dead.length > 0) {
    await prisma.pushToken
      .deleteMany({ where: { token: { in: dead } } })
      .catch(() => {});
  }
}

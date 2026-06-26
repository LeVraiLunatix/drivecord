/**
 * WebAuthn relying-party config.
 *
 * RP_ID / origin / RP_NAME come from env in production, but fall back to the
 * request host so dev (localhost) and previews work without extra config.
 */
export function getRpID(req: Request): string {
  if (process.env.RP_ID) return process.env.RP_ID;
  const host = req.headers.get("host") ?? "localhost";
  return host.split(":")[0]!; // strip port — RP ID is a bare domain
}

export function getOrigin(req: Request): string {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export function getRpName(): string {
  return process.env.RP_NAME ?? "Drivecord";
}

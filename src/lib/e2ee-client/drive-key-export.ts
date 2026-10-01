import { hexEncode } from "@/lib/crypto/e2ee";

/**
 * The raw drive key as 64 hex characters, ready to paste into a server's
 * configuration (e.g. `DRIVECORD_DRIVE_KEY` for `@drivecord/node`).
 */
export function driveKeyToHex(raw: Uint8Array): string {
  if (raw.length !== 32) throw new Error("Clé de drive invalide (32 octets attendus).");
  return hexEncode(raw);
}

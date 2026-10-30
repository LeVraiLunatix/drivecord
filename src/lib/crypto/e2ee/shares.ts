/**
 * Recovery shares ("contacts de confiance"): a random secret wraps the Master Key and is split
 * with Shamir. The server stores only the wrapped key and (k, n); the shares live with the people
 * the user gave them to.
 */
import { randomBytes } from "./encoding";
import { kekFromHkdf } from "./kdf";
import { combineShares, decodeShare, encodeShare, splitSecret, SHARE_SECRET_LEN } from "./shamir";
import { aad, unwrap, wrap } from "./wrap";

const sharesKek = (secret: Uint8Array) => kekFromHkdf(secret, "drivecord:kek:shares:v1");

export async function createRecoveryShares(userId: string, mk: Uint8Array, k: number, n: number) {
  const secret = randomBytes(SHARE_SECRET_LEN);
  return {
    shares: splitSecret(secret, k, n).map(encodeShare),
    mkWrappedShares: await wrap(await sharesKek(secret), mk, aad.mk(userId)),
  };
}

export async function unlockWithShares(userId: string, mkWrappedShares: string, inputs: string[]): Promise<Uint8Array> {
  const secret = combineShares(inputs.map(decodeShare));
  return unwrap(await sharesKek(secret), mkWrappedShares, aad.mk(userId));
}

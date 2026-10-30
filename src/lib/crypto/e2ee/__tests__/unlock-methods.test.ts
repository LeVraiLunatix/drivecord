import { describe, expect, it } from "vitest";
import {
  addPin,
  approvalCommitment,
  bytesEqual,
  combineShares,
  createApprovalRequest,
  createRecoveryShares,
  decodeShare,
  encodeShare,
  pinProof,
  randomBytes,
  splitSecret,
  unlockWithPin,
  unlockWithShares,
  verifyApprovalCommitment,
} from "..";

describe("Shamir", () => {
  it("rebuilds the secret from any k of n shares", () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 3, 5);
    for (const pick of [[0, 1, 2], [4, 2, 0], [1, 3, 4], [0, 1, 2, 3, 4]]) {
      expect(bytesEqual(combineShares(pick.map((i) => shares[i]!)), secret)).toBe(true);
    }
  });

  it("does not rebuild it from fewer than k shares", () => {
    const shares = splitSecret(randomBytes(32), 3, 5);
    expect(() => combineShares(shares.slice(0, 2))).toThrow(/3 parts/);
  });

  it("a wrong share gives a different secret", () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    const bad = { ...shares[1]!, y: shares[1]!.y.map((b) => b ^ 1) };
    expect(bytesEqual(combineShares([shares[0]!, bad]), secret)).toBe(false);
  });

  it("round-trips the text form and catches typos", () => {
    const [s] = splitSecret(randomBytes(32), 2, 3);
    const text = encodeShare(s!);
    expect(decodeShare(text)).toEqual(s);
    expect(decodeShare(text.toLowerCase().replace(/-/g, " "))).toEqual(s);
    const typo = (text[0] === "A" ? "B" : "A") + text.slice(1);
    expect(() => decodeShare(typo)).toThrow();
  });
});

describe("recovery shares", () => {
  it("unlock the Master Key with k shares, not with k-1", async () => {
    const mk = randomBytes(32);
    const { shares, mkWrappedShares } = await createRecoveryShares("u1", mk, 2, 3);
    expect(shares).toHaveLength(3);
    expect(bytesEqual(await unlockWithShares("u1", mkWrappedShares, [shares[2]!, shares[0]!]), mk)).toBe(true);
    await expect(unlockWithShares("u1", mkWrappedShares, [shares[0]!])).rejects.toThrow();
    await expect(unlockWithShares("u2", mkWrappedShares, [shares[0]!, shares[1]!])).rejects.toThrow(/Déchiffrement impossible/);
  });
});

describe("PIN", () => {
  it("unlocks with the right PIN and gives the same proof twice", async () => {
    const mk = randomBytes(32);
    const { pinKdf, pinAuth, mkWrappedPin } = await addPin("u1", mk, "123456");
    expect(await pinProof("123456", pinKdf)).toBe(pinAuth);
    expect(await pinProof("123457", pinKdf)).not.toBe(pinAuth);
    expect(bytesEqual(await unlockWithPin("u1", "123456", pinKdf, mkWrappedPin), mk)).toBe(true);
    await expect(unlockWithPin("u1", "000000", pinKdf, mkWrappedPin)).rejects.toThrow(/Déchiffrement impossible/);
  });

  it("refuses anything but 6 digits", async () => {
    await expect(addPin("u1", randomBytes(32), "12345")).rejects.toThrow();
    await expect(addPin("u1", randomBytes(32), "12345a")).rejects.toThrow();
  });
}, 30_000);

describe("QR approval", () => {
  it("the QR values match the commitment the server holds", async () => {
    const req = createApprovalRequest();
    const commitment = await approvalCommitment(req.publicKey, req.nonce);
    expect(await verifyApprovalCommitment(commitment, req.publicKey, req.nonce)).toBe(true);
    const other = createApprovalRequest();
    expect(await verifyApprovalCommitment(commitment, other.publicKey, req.nonce)).toBe(false);
  });
});

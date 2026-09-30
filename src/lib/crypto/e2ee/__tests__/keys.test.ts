import { describe, expect, it } from "vitest";
import {
  addPasskey,
  addPhrase,
  approveDevice,
  b64decode,
  base32Decode,
  base32Encode,
  completeApproval,
  createApprovalRequest,
  createDeviceKek,
  createUserKeys,
  decryptFolderName,
  decryptMeta,
  deriveKekFromPhrase,
  encryptFolderName,
  encryptMeta,
  generateDriveKey,
  generateFileKey,
  generateRecoveryKey,
  importAesKey,
  normalizePhrase,
  parseRecoveryKey,
  randomBytes,
  rotateRecovery,
  unlockWithPasskey,
  unlockWithPhrase,
  unlockWithRecovery,
  unwrapDriveKey,
  unwrapFileKey,
  unwrapFileKeyFromShare,
  unwrapForDevice,
  unwrapPrivateKey,
  unwrapVaultKey,
  verificationCode,
  wrapDriveKey,
  wrapFileKey,
  wrapFileKeyForShare,
  wrapForDevice,
  wrapVaultKey,
  type PhraseKdf,
} from "..";

const USER = "user_1";
// Cheap Argon2id for most tests; one test below uses the real defaults.
const FAST: Pick<PhraseKdf, "alg" | "m" | "t" | "p"> = { alg: "argon2id", m: 64, t: 1, p: 1 };

describe("recovery key", () => {
  it("base32 round-trips and groups in fours", () => {
    const { bytes, display, groups } = generateRecoveryKey();
    expect(groups).toHaveLength(13);
    expect(display).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
    expect(parseRecoveryKey(display)).toEqual(bytes);
    expect(parseRecoveryKey(display.toLowerCase().replace(/-/g, " "))).toEqual(bytes);
    expect(base32Decode(base32Encode(Uint8Array.from([1, 2, 3, 250])))).toEqual(Uint8Array.from([1, 2, 3, 250]));
  });
  it("rejects garbage", () => {
    expect(() => parseRecoveryKey("not a key!")).toThrow();
    expect(() => parseRecoveryKey("AAAA-AAAA")).toThrow();
  });
});

describe("user keys: every unlock route opens the same MK", () => {
  it("recovery", async () => {
    const { mk, bundle, recovery } = await createUserKeys(USER);
    expect(await unlockWithRecovery(USER, bundle, recovery.display)).toEqual(mk);
  });

  it("a wrong recovery key fails cleanly", async () => {
    const { bundle } = await createUserKeys(USER);
    await expect(unlockWithRecovery(USER, bundle, generateRecoveryKey().display)).rejects.toThrow(/Déchiffrement impossible/);
  });

  it("phrase (and a wrong phrase fails)", async () => {
    const { mk, bundle } = await createUserKeys(USER);
    const kdf = { ...FAST, salt: "AAAAAAAAAAAAAAAAAAAAAA==" } as PhraseKdf;
    const phraseBundle = { ...bundle, phraseKdf: kdf, mkWrappedPhrase: await (await import("..")).wrap(await deriveKekFromPhrase("correct horse battery", kdf), mk, `drivecord:mk:v1:${USER}`) };
    expect(await unlockWithPhrase(USER, phraseBundle, "correct horse battery")).toEqual(mk);
    expect(await unlockWithPhrase(USER, phraseBundle, "  correct   horse battery ")).toEqual(mk); // normalisation
    await expect(unlockWithPhrase(USER, phraseBundle, "wrong phrase")).rejects.toThrow();
    await expect(unlockWithPhrase(USER, bundle, "x")).rejects.toThrow(/Aucune phrase/);
  });

  it("addPhrase uses the real Argon2id parameters (64 MiB, t=3, p=1, 16-byte salt)", async () => {
    const { mk, bundle } = await createUserKeys(USER);
    const added = await addPhrase(USER, mk, "une phrase secrète");
    expect(added.phraseKdf).toMatchObject({ alg: "argon2id", m: 65536, t: 3, p: 1 });
    expect(b64decode(added.phraseKdf.salt)).toHaveLength(16);
    const b = { ...bundle, ...added };
    expect(await unlockWithPhrase(USER, b, "une phrase secrète")).toEqual(mk);
  }, 60_000);

  it("refuses absurd KDF parameters from the server (memory DoS)", async () => {
    const evil = { alg: "argon2id", m: 4 * 1024 * 1024, t: 3, p: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA==" } as PhraseKdf;
    await expect(deriveKekFromPhrase("x", evil)).rejects.toThrow(/refusés/);
  });

  it("passkey PRF", async () => {
    const { mk, bundle } = await createUserKeys(USER);
    const prf = randomBytes(32);
    const b = { ...bundle, mkWrappedPasskey: { cred1: await addPasskey(USER, mk, prf) } };
    expect(await unlockWithPasskey(USER, b, "cred1", prf)).toEqual(mk);
    await expect(unlockWithPasskey(USER, b, "cred1", randomBytes(32))).rejects.toThrow();
    await expect(unlockWithPasskey(USER, b, "other", prf)).rejects.toThrow(/pas enregistrée/);
  });

  it("wrapped MK is bound to its owner: another user's id fails", async () => {
    const { bundle, recovery } = await createUserKeys(USER);
    await expect(unlockWithRecovery("user_2", bundle, recovery.display)).rejects.toThrow();
  });

  it("the private X25519 key is recoverable with MK", async () => {
    const { mk, bundle } = await createUserKeys(USER);
    expect(await unwrapPrivateKey(USER, mk, bundle)).toHaveLength(32);
  });

  it("rotating the recovery key retires the old one", async () => {
    const { mk, bundle, recovery } = await createUserKeys(USER);
    const r = await rotateRecovery(USER, mk);
    const b = { ...bundle, mkWrappedRecovery: r.mkWrappedRecovery };
    expect(await unlockWithRecovery(USER, b, r.recovery.display)).toEqual(mk);
    await expect(unlockWithRecovery(USER, b, recovery.display)).rejects.toThrow();
  });
});

describe("trusted device", () => {
  it("silent unlock via the non-extractable device key", async () => {
    const { mk } = await createUserKeys(USER);
    const kek = await createDeviceKek();
    expect(kek.extractable).toBe(false);
    const blob = await wrapForDevice(kek, USER, mk);
    expect(await unwrapForDevice(kek, USER, blob)).toEqual(mk);
    await expect(unwrapForDevice(await createDeviceKek(), USER, blob)).rejects.toThrow();
  });
});

describe("drive / file keys", () => {
  it("DK is wrapped by MK and bound to its drive", async () => {
    const mk = randomBytes(32);
    const dk = generateDriveKey();
    const blob = await wrapDriveKey(mk, "drive_1", dk);
    expect(await unwrapDriveKey(mk, "drive_1", blob)).toEqual(dk);
    await expect(unwrapDriveKey(mk, "drive_2", blob)).rejects.toThrow();
    await expect(unwrapDriveKey(randomBytes(32), "drive_1", blob)).rejects.toThrow();
  });

  it("FK is wrapped by DK and bound to its file", async () => {
    const dk = generateDriveKey();
    const { fk, noncePrefix } = generateFileKey();
    expect(noncePrefix).toHaveLength(7);
    const blob = await wrapFileKey(dk, "file_1", fk);
    expect(await unwrapFileKey(dk, "file_1", blob)).toEqual(fk);
    await expect(unwrapFileKey(dk, "file_2", blob)).rejects.toThrow();
  });

  it("vault key can ride along under MK", async () => {
    const mk = randomBytes(32);
    const vault = randomBytes(32);
    expect(await unwrapVaultKey(mk, USER, await wrapVaultKey(mk, USER, vault))).toEqual(vault);
  });

  it("malformed blobs are rejected", async () => {
    const dk = generateDriveKey();
    for (const bad of ["", "v2.a.b", "v1.onlytwo", "garbage"]) await expect(unwrapFileKey(dk, "f", bad)).rejects.toThrow();
  });
});

describe("metadata", () => {
  it("file meta round-trips and is bound to the file", async () => {
    const fk = await importAesKey(randomBytes(32));
    const meta = { name: "Déclaration 2026.pdf", mime: "application/pdf", size: 1234, mtime: 1700000000000 };
    const blob = await encryptMeta(fk, "file_1", meta);
    expect(blob).not.toContain("Déclaration");
    expect(await decryptMeta(fk, "file_1", blob)).toEqual(meta);
    await expect(decryptMeta(fk, "file_2", blob)).rejects.toThrow(/illisibles/);
    await expect(decryptMeta(await importAesKey(randomBytes(32)), "file_1", blob)).rejects.toThrow();
  });

  it("folder names round-trip and are bound to the folder", async () => {
    const dk = await importAesKey(randomBytes(32));
    const blob = await encryptFolderName(dk, "fld_1", "Impôts");
    expect(await decryptFolderName(dk, "fld_1", blob)).toBe("Impôts");
    await expect(decryptFolderName(dk, "fld_2", blob)).rejects.toThrow();
  });
});

describe("password-protected share", () => {
  it("only the right password recovers FK", async () => {
    const fk = randomBytes(32);
    const { kdf, blob } = await wrapFileKeyForShare(fk, "tok", "mot de passe fort");
    expect(await unwrapFileKeyFromShare(blob, kdf, "tok", "mot de passe fort")).toEqual(fk);
    await expect(unwrapFileKeyFromShare(blob, kdf, "tok", "mauvais")).rejects.toThrow();
    await expect(unwrapFileKeyFromShare(blob, kdf, "other-token", "mot de passe fort")).rejects.toThrow();
  }, 60_000);
});

describe("new-device approval (X25519)", () => {
  it("delivers MK, and both screens show the same code", async () => {
    const mk = randomBytes(32);
    const req = createApprovalRequest();
    const { approverPublicKey, sealedMk } = await approveDevice(USER, mk, req.publicKey);
    expect(await completeApproval(USER, req.secretKey, req.publicKey, approverPublicKey, sealedMk)).toEqual(mk);
    const codeNew = await verificationCode(req.publicKey, approverPublicKey);
    const codeOld = await verificationCode(approverPublicKey, req.publicKey);
    expect(codeNew).toMatch(/^\d{6}$/);
    expect(codeNew).toBe(codeOld);
  });

  it("a server swapping keys makes the codes differ — and the MK undecryptable", async () => {
    const mk = randomBytes(32);
    const req = createApprovalRequest();
    const mitm = createApprovalRequest(); // server's own key pair
    // The approver is told the MITM's key instead of the real requester's.
    const { approverPublicKey, sealedMk } = await approveDevice(USER, mk, mitm.publicKey);
    // The real requester can't open it…
    await expect(completeApproval(USER, req.secretKey, req.publicKey, approverPublicKey, sealedMk)).rejects.toThrow();
    // …and the two screens disagree on the code.
    expect(await verificationCode(req.publicKey, approverPublicKey)).not.toBe(await verificationCode(mitm.publicKey, approverPublicKey));
  });

  it("bound to the user id; bad public keys refused", async () => {
    const mk = randomBytes(32);
    const req = createApprovalRequest();
    const { approverPublicKey, sealedMk } = await approveDevice(USER, mk, req.publicKey);
    await expect(completeApproval("user_2", req.secretKey, req.publicKey, approverPublicKey, sealedMk)).rejects.toThrow();
    await expect(approveDevice(USER, mk, new Uint8Array(5))).rejects.toThrow();
  });
});

describe("misc", () => {
  it("normalizePhrase", () => {
    expect(normalizePhrase("  a   b\tc ")).toBe("a b c");
    expect(normalizePhrase("ﬁ")).toBe("fi"); // NFKC
  });
});

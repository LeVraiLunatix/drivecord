import { describe, expect, it } from "vitest";
import { hexDecode, randomBytes } from "@/lib/crypto/e2ee";
import { driveKeyToHex } from "./drive-key-export";

describe("driveKeyToHex", () => {
  it("encodes the 32 key bytes as 64 lowercase hex characters", () => {
    const raw = Uint8Array.from({ length: 32 }, (_, i) => i * 8);
    const hex = driveKeyToHex(raw);
    expect(hex).toBe("0008101820283038404850586068707880889098a0a8b0b8c0c8d0d8e0e8f0f8");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("round-trips with hexDecode", () => {
    const raw = randomBytes(32);
    expect(hexDecode(driveKeyToHex(raw))).toEqual(raw);
  });

  it("refuses anything that is not exactly 32 bytes", () => {
    expect(() => driveKeyToHex(new Uint8Array(16))).toThrow(/32 octets/);
    expect(() => driveKeyToHex(new Uint8Array(33))).toThrow(/32 octets/);
  });
});

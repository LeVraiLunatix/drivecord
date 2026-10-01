import { describe, expect, it } from "vitest";
import { formatLocalAndUtc } from "./format-time";

describe("formatLocalAndUtc", () => {
  it("keeps the UTC part short when both fall on the same day", () => {
    const s = formatLocalAndUtc("2026-10-20T10:00:00Z", "Europe/Paris");
    expect(s).toMatch(/12:00 \(heure locale\) · 10:00 UTC$/);
  });
  it("repeats the date in UTC when the local day differs", () => {
    const s = formatLocalAndUtc("2026-10-20T22:30:00Z", "Europe/Paris");
    expect(s).toContain("21 oct. 2026");
    expect(s).toMatch(/· 20 oct\. 2026, 22:30 UTC$/);
  });
});

import { test, vi } from "vitest";
import assert from "node:assert/strict";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { deviceLabel } = await import("./device.ts");

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";

test("the iOS app is named as such, not as Safari", () => {
  assert.equal(deviceLabel(`${IOS} Version/17.0 Mobile/15E148 Safari/604.1 DrivecordNative/1`), "App Drivecord sur iOS");
});

test("iOS browsers other than Safari keep their name", () => {
  assert.equal(deviceLabel(`${IOS} CriOS/129.0 Mobile/15E148 Safari/604.1`), "Chrome sur iOS");
  assert.equal(deviceLabel(`${IOS} FxiOS/130.0 Mobile/15E148 Safari/605.1.15`), "Firefox sur iOS");
  assert.equal(deviceLabel(`${IOS} EdgiOS/129.0 Mobile/15E148 Safari/605.1.15`), "Edge sur iOS");
  assert.equal(deviceLabel(`${IOS} Version/18.0 Mobile/15E148 Safari/604.1`), "Safari sur iOS");
});

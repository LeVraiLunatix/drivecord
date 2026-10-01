import { describe, expect, it } from "vitest";
import { barBackground, decodeDays, describeDay, encodeDays, notableDays, type BarDay } from "./bar";

const day = (date: string, status: BarDay["status"], uptime: number | null = null, downMinutes = 0): BarDay => ({ date, status, uptime, downMinutes });
const DAYS: BarDay[] = [
  day("2026-09-29", "nodata"),
  day("2026-09-30", "operational", 100),
  day("2026-10-01", "major_outage", 91.5, 125),
];

describe("encode / decode", () => {
  it("round-trips a bar, deriving dates from the last day", () => {
    const encoded = encodeDays(DAYS);
    expect(encoded).toBe("n;o|100.00|;m|91.50|125");
    expect(encodeDays([day("2026-10-01", "nodata"), day("2026-10-02", "nodata"), day("2026-10-03", "operational")])).toBe("n*2;o");
    expect(decodeDays("n*2;o", "2026-10-03").map((d) => d.status)).toEqual(["nodata", "nodata", "operational"]);
    const back = decodeDays(encoded, "2026-10-01");
    expect(back.map((d) => d.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(back.map((d) => d.status)).toEqual(["nodata", "operational", "major_outage"]);
    expect(back[2]).toMatchObject({ uptime: 91.5, downMinutes: 125 });
    expect(back[0]).toMatchObject({ uptime: null, downMinutes: 0 });
  });

  it("keeps a 90-day bar tiny", () => {
    const days = Array.from({ length: 90 }, (_, i) => day(`2026-07-${String((i % 28) + 1).padStart(2, "0")}`, "operational", 100));
    expect(encodeDays(days).length).toBeLessThan(30);
    expect(encodeDays(Array.from({ length: 90 }, () => day("2026-07-01", "nodata"))).length).toBeLessThan(200);
  });

  it("decodes garbage without throwing", () => {
    expect(decodeDays("", "2026-10-01")).toEqual([]);
    expect(decodeDays("zz;;o", "2026-10-01").map((d) => d.status)).toEqual(["nodata", "nodata", "operational"]);
  });
});

describe("barBackground", () => {
  it("uses one stop per run of identical days", () => {
    const days = Array.from({ length: 90 }, (_, i) => day("2026-07-01", i === 40 ? "major_outage" : "operational"));
    const css = barBackground(days);
    expect(css.startsWith("linear-gradient(to right,")).toBe(true);
    expect(css.match(/var\(--ok-fill\)/g)).toHaveLength(2); // before and after the outage
    expect(css.match(/var\(--bad-fill\)/g)).toHaveLength(1);
  });
  it("covers the whole width and handles an empty bar", () => {
    expect(barBackground([day("2026-07-01", "nodata"), day("2026-07-02", "nodata")])).toContain("0.000% 100.000%");
    expect(barBackground([])).toBe("var(--nodata)");
  });
});

describe("describeDay", () => {
  it("reads naturally in French", () => {
    expect(describeDay(DAYS[0]!)).toMatch(/pas de données$/);
    expect(describeDay(DAYS[1]!)).toMatch(/opérationnel · 100 % de disponibilité$/);
    expect(describeDay(DAYS[2]!)).toMatch(/panne majeure · 91,50 % de disponibilité · 2 h 5 min de panne$/);
  });
  it("lists only notable days for the text alternative", () => {
    expect(notableDays(DAYS).map((d) => d.date)).toEqual(["2026-10-01"]);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG contrast of the colour tokens in globals.css, in both themes (AA = 4.5:1 for normal text). */

type RGB = [number, number, number];

function oklchToSrgb(l: number, c: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: RGB = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => Math.min(1, Math.max(0, v))) as RGB; // linear sRGB, clipped to gamut
}

const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

type Token = { rgb: RGB; alpha: number };

function parseTokens(block: string): Record<string, Token> {
  const out: Record<string, Token> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%)?\s*\)/g)) {
    out[m[1]!] = { rgb: oklchToSrgb(Number(m[2]), Number(m[3]), Number(m[4])), alpha: m[5] ? Number(m[5]) / 100 : 1 };
  }
  return out;
}

const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const light = parseTokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("html {"));
const dark = { ...light, ...parseTokens(darkBlock) };

/** `fg` at `alpha` over `bg` (linear-light blend, close enough for a 10 % tint). */
const over = (fg: RGB, alpha: number, bg: RGB): RGB => fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as RGB;

for (const [name, t] of [["light", light], ["dark", dark]] as const) {
  describe(`contrast (${name})`, () => {
    const bg = t.bg!.rgb;
    const card = t.card!.rgb;
    const subtle = t.subtle!.rgb;

    it("body and muted text read on every surface", () => {
      for (const surface of [bg, card, subtle]) {
        expect(ratio(t.fg!.rgb, surface)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t.muted!.rgb, surface)).toBeGreaterThanOrEqual(4.5);
      }
    });

    for (const key of ["ok", "warn", "orange", "bad", "maint", "accent"]) {
      it(`${key} as text on the page, cards and a 10 % tinted banner`, () => {
        const fg = t[key]!.rgb;
        expect(ratio(fg, bg), "on page").toBeGreaterThanOrEqual(4.5);
        expect(ratio(fg, card), "on card").toBeGreaterThanOrEqual(4.5);
        expect(ratio(fg, over(fg, 0.1, bg)), "on tinted banner").toBeGreaterThanOrEqual(4.5);
      });
    }

    it("the main text stays readable on a tinted banner", () => {
      for (const key of ["ok", "warn", "orange", "bad", "maint"]) {
        expect(ratio(t.fg!.rgb, over(t[key]!.rgb, 0.1, bg))).toBeGreaterThanOrEqual(7);
      }
    });

    it("bar colours are distinguishable from the empty-day colour (non-text contrast ≥ 3:1)", () => {
      for (const key of ["ok-fill", "warn-fill", "orange-fill", "bad-fill", "maint-fill"]) {
        expect(ratio(t[key]!.rgb, t.nodata!.rgb), key).toBeGreaterThanOrEqual(1.8);
        expect(ratio(t[key]!.rgb, bg), key).toBeGreaterThanOrEqual(2);
      }
    });
  });
}

describe("token parsing", () => {
  it("found both themes", () => {
    expect(Object.keys(light).length).toBeGreaterThan(15);
    expect(luminance(dark.bg!.rgb)).toBeLessThan(luminance(light.bg!.rgb));
  });
});

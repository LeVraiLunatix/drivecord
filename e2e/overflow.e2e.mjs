/** Checks public pages for horizontal overflow and console errors at phone + desktop widths. */
import { chromium } from "playwright-core";
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const pages = ["/", "/login", "/register", "/conditions", "/supporters", "/docs", "/docs/faq", "/docs/securite/chiffrement", "/docs/securite/modele-de-menace", "/docs/technique/api-v2", "/docs/technique/api", "/docs/technique/sdk", "/docs/technique/applications", "/docs/technique/fonctionnement"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let bad = 0;
for (const w of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  for (const p of pages) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
    await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const o = await page.evaluate(() => {
      const de = document.documentElement; const over = de.scrollWidth - de.clientWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > de.clientWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 40));
      return { over, wide };
    });
    if (o.over > 0 || errs.length) { bad++; console.log(w, p, o.over > 0 ? `overflow ${o.over}px ${o.wide.join(" ")}` : "", errs.join(" | ")); }
    await page.close();
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} page(s) with problems` : "all clean");

// Prueba de extremo a extremo con viewport de iPhone 13 (opcional).
// Requiere: npm i -D playwright && npx playwright install chromium
// Uso: python3 -m http.server 8765 & node tests/e2e.mjs
import { chromium, devices } from "playwright";
const out = new URL("../shots/", import.meta.url).pathname;
const BASE = process.env.BASE || "http://localhost:8765/";
import { mkdirSync } from "node:fs"; mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "light" });
const page = await ctx.newPage();
const errs = [];
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push(String(e)));
await page.goto(BASE);
await page.waitForSelector(".row");
await page.screenshot({ path: out + "1-lista.png" });
// nueva frase, tecleando atajos
await page.click("#addFrase");
await page.fill("#fFrase", "Si llueve, no salgo.");
await page.fill("#fAtomos", "P: llueve\nQ: (yo) salgo");
await page.click("#fFormula");
await page.keyboard.type("p -> !q");
const v = await page.inputValue("#fFormula");
console.log("formula:", JSON.stringify(v));
await page.click('#kbar button[data-k="∧"]');
await page.click('#kbar button[data-k="⌫"]');
console.log("after kbar:", JSON.stringify(await page.inputValue("#fFormula")), "kbar visible:", await page.isVisible("#kbar"));
await page.click('.tab[data-tab="tabla"]');
await page.screenshot({ path: out + "2-editor-tabla.png", fullPage: true });
// razonamiento
await page.click("#backBtn");
await page.click("#addArg");
await page.click("#fFormula");
await page.keyboard.type("p>q, q : p");
await page.waitForTimeout(100);
console.log("arg:", await page.inputValue("#fFormula"), "| status:", await page.textContent("#status"), "| tabs:", await page.textContent("#tabs"), "| hash:", await page.evaluate(()=>location.hash)); console.log("verdict:", await page.textContent(".verdict"));
await page.screenshot({ path: out + "3-validez.png", fullPage: true });
await page.click('.tab[data-tab="cla"]');
console.log("clauses:", await page.textContent(".clauses"));
// borrar + deshacer
await page.click("#delBtn");
console.log("toast:", await page.textContent("#toastMsg"));
await page.click("#toastAction");
console.log("rows:", await page.locator(".row").count());
// persistencia tras recarga
await page.reload(); await page.waitForSelector(".row");
console.log("rows after reload:", await page.locator(".row").count());
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
console.log("sw registered:", sw);
// menú + ayuda en oscuro
await page.emulateMedia({ colorScheme: "dark" });
await page.click("#menuBtn"); await page.click('[data-act="help"]');
await page.screenshot({ path: out + "4-ayuda-oscuro.png" });
await page.keyboard.press("Escape");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log("horizontal overflow:", overflow);
console.log("errors:", errs);
await browser.close();

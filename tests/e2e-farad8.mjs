// E2E del plugin FARAD-8 con viewport de iPhone 13 (opcional, requiere Playwright).
// Uso: python3 -m http.server 8765 & node tests/e2e-farad8.mjs
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
const out = new URL("../shots/", import.meta.url).pathname; mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8765/";
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
let remoteMode = "ok";
await page.route("https://farad8-test.example.workers.dev/**", (r) => remoteMode === "ok"
  ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ text: "PONG ⚡ cerebro online listo", actions: [{ type: "abrir_pestana", tab: "tabla" }] }) })
  : r.abort());

await page.goto(BASE);
await page.waitForSelector(".f8-fab");
await page.click("#addFrase");
await page.fill("#fFrase", "No estudio ni trabajo.");
await page.fill("#fAtomos", "P: (yo) estudio\nQ: (yo) trabajo");
await page.fill("#fFormula", "¬(P ∧ Q)");
await page.locator("#fFormula").blur();
await page.waitForSelector(".f8-bubble:not([hidden])", { timeout: 8000 });
console.log("bubble 1:", await page.textContent(".f8-bubble-text"));
await page.waitForFunction(() => /ni/.test(document.querySelector(".f8-bubble-text").textContent) && !document.querySelector(".f8-bubble").hidden, null, { timeout: 15000 });
console.log("bubble 2:", await page.textContent(".f8-bubble-text"));
await page.screenshot({ path: out + "f8-1-burbuja.png" });

await page.click(".f8-fab");
await page.waitForTimeout(300);
await page.click('[data-a="hint"]'); await page.click('[data-a="hint"]'); await page.click('[data-a="read"]');
await page.waitForTimeout(6000);
const logTxt = await page.textContent(".f8-log");
console.log("log has hint1:", logTxt.includes("PISTA 1/2"), "| hint2 concreta:", logTxt.includes("niega las dos"), "| lectura:", logTxt.includes("no es cierto que"));
await page.screenshot({ path: out + "f8-2-consola.png" });

await page.click('[data-a="quiz"]');
for (let i = 0; i < 3; i++) {
  await page.waitForSelector(".f8-opts button:not([disabled])", { timeout: 5000 });
  await page.locator(".f8-opts button").first().click();
  await page.waitForTimeout(2000);
}
console.log("meter:", await page.textContent(".f8-meter"));

// online: endpoint simulado
await page.click('[data-a="settings"]');
await page.fill("#f8ep", "https://farad8-test.example.workers.dev");
await page.click('[data-a="test"]');
await page.waitForFunction(() => /Conectado|No responde/.test(document.querySelector(".f8-test").textContent), null, { timeout: 12000 });
console.log("test:", await page.textContent(".f8-test"));
await page.click('[data-a="saveSettings"]');
console.log("mode:", await page.textContent(".f8-mode"));
await page.fill("#f8q", "¿qué es una condición necesaria?"); await page.press("#f8q", "Enter");
await page.waitForTimeout(2500);
console.log("online reply:", (await page.textContent(".f8-log")).includes("PONG"));
console.log("acción abrir_pestana:", await page.locator(".f8-chip").count() > 0, "| pestaña:", await page.getAttribute('#tabs [aria-selected="true"]', "data-tab"));
// el endpoint cae → modo cartucho
remoteMode = "down";
await page.fill("#f8q", "¿qué es una condición necesaria?"); await page.press("#f8q", "Enter");
await page.waitForTimeout(4000);
const t2 = await page.textContent(".f8-log");
console.log("fallback:", t2.includes("modo cartucho"), "| respuesta local:", t2.includes("Lo necesario va a la derecha"), "| mode:", await page.textContent(".f8-mode"));
// sin red
await ctx.setOffline(true); await page.waitForTimeout(500);
console.log("offline mode:", await page.textContent(".f8-mode"));
await page.screenshot({ path: out + "f8-3-offline.png" });
await ctx.setOffline(false); await page.waitForTimeout(500);
console.log("errors:", errs);
await browser.close();

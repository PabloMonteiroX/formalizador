// Tests del cerebro online de FARAD-8: motor como herramientas, acciones y bucle (API simulada).
import test from "node:test";
import assert from "node:assert/strict";
import worker, { runTool, checkAction, findLeaks, TOOLS, SYSTEM } from "../server/farad8-worker.js";

const ORIGIN = "http://localhost:8765";
const post = (body) => new Request("https://farad8.test/", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });

test("motor: analizar_formula", () => {
  const r = runTool("analizar_formula", { formula: "P & !Q -> R" });
  assert.equal(r.bien_formada, true);
  assert.equal(r.conectiva_principal, "→ implicación");
  assert.equal(r.minima, "P ∧ ¬Q → R");
  assert.equal(r.clasificacion, "contingente");
  const e = runTool("analizar_formula", { formula: "(P ∧ Q" });
  assert.equal(e.bien_formada, false);
  assert.match(e.error.mensaje, /\)/);
  const arg = runTool("analizar_formula", { formula: "P → Q, Q ∴ P" });
  assert.equal(arg.validez.estado, "no válido");
});

test("motor: tabla, comparar y razonamiento", () => {
  const t = runTool("tabla_verdad", { formula: "P ∨ ¬P" });
  assert.equal(t.clasificacion, "tautologia");
  assert.equal(t.filas.length, 2);
  assert.deepEqual(runTool("comparar_formulas", { a: "¬(P ∨ Q)", b: "¬P ∧ ¬Q" }).equivalentes, true);
  const d = runTool("comparar_formulas", { a: "¬(P ∧ Q)", b: "¬P ∧ ¬Q" });
  assert.equal(d.equivalentes, false);
  assert.ok(d.fila_distinta);
  assert.equal(runTool("comprobar_razonamiento", { razonamiento: "P → Q, P ∴ Q" }).estado, "válido");
  assert.ok(runTool("comprobar_razonamiento", { razonamiento: "P → Q" }).error);
  assert.ok(runTool("nada", {}).error);
});

test("acciones: solo las permitidas y con pestañas reales", () => {
  const ctx = { pestanas: ["estr", "tabla"] };
  assert.deepEqual(checkAction({ accion: "abrir_pestana", pestana: "tabla" }, ctx).action, { type: "abrir_pestana", tab: "tabla" });
  assert.ok(checkAction({ accion: "abrir_pestana", pestana: "val" }, ctx).error);
  assert.ok(checkAction({ accion: "escribir_formula" }, ctx).error);
  assert.ok(checkAction({ accion: "iniciar_quiz" }, null).error);
  assert.deepEqual(checkAction({ accion: "iniciar_quiz" }, ctx).action, { type: "iniciar_quiz" });
});

test("prompt y herramientas coherentes", () => {
  for (const t of TOOLS) assert.ok(SYSTEM.includes(t.name), t.name);
  assert.match(SYSTEM, /NUNCA escribas la formalización completa/);
});

test("bucle: usa el motor, devuelve acciones y el texto final", async (t) => {
  const sent = [];
  const replies = [
    { stop_reason: "tool_use", content: [
      { type: "tool_use", id: "t1", name: "analizar_formula", input: { formula: "¬(P ∧ Q)" } },
      { type: "tool_use", id: "t2", name: "controlar_app", input: { accion: "abrir_pestana", pestana: "tabla" } },
      { type: "tool_use", id: "t3", name: "controlar_app", input: { accion: "abrir_pestana", pestana: "val" } },
    ] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Te abro la Tabla. ¿En qué fila cambia?" }] },
  ];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  });
  const res = await worker.fetch(post({ question: "¿está bien?", history: [], context: { formula: "¬(P ∧ Q)", pestanas: ["estr", "tabla", "fn", "cmp"] } }), { ANTHROPIC_API_KEY: "x" });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.text, "Te abro la Tabla. ¿En qué fila cambia?");
  assert.deepEqual(j.actions, [{ type: "abrir_pestana", tab: "tabla" }]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].model, "claude-haiku-4-5");
  const results = sent[1].messages.at(-1).content;
  assert.equal(results.length, 3);
  assert.match(results[0].content, /"conectiva_principal":"¬ negación"/);
  assert.equal(results[2].is_error, true);
});

test("bucle: la última ronda prohíbe herramientas y el modelo se puede cambiar", async (t) => {
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const b = JSON.parse(init.body); sent.push(b);
    const reply = b.tool_choice?.type === "none"
      ? { stop_reason: "end_turn", content: [{ type: "text", text: "Listo." }] }
      : { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + sent.length, name: "tabla_verdad", input: { formula: "P" } }] };
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  const j = await (await worker.fetch(post({ question: "hola" }), { ANTHROPIC_API_KEY: "x", MODEL: "claude-sonnet-5-5" })).json();
  assert.equal(j.text, "Listo.");
  assert.equal(sent.length, 4);
  assert.equal(sent[0].model, "claude-sonnet-5-5");
  // Sin tarjeta abierta no hay acciones posibles.
  assert.deepEqual(j.actions, []);
});

test("errores: origen, modelo caído", async (t) => {
  const bad = await worker.fetch(new Request("https://farad8.test/", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), {});
  assert.equal(bad.status, 403);
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 529 }));
  const down = await worker.fetch(post({ question: "hola" }), { ANTHROPIC_API_KEY: "x" });
  assert.equal(down.status, 502);
  assert.equal((await down.json()).status, 529);
});

test("guardián: detecta la solución con los átomos del alumno, no los ejemplos", () => {
  const ctx = { atomos: "P: estudio\nQ: trabajo", formula: "¬(P ∧ Q)" };
  // La respuesta real que dio Haiku en producción.
  assert.deepEqual(findLeaks("La frase significa «no estudio Y no trabajo», que es ¬P ∧ ¬Q.", ctx), ["¬P ∧ ¬Q"]);
  assert.deepEqual(findLeaks("Equivale a ¬(P ∨ Q), piénsalo.", ctx), ["¬(P ∨ Q)"]);
  assert.deepEqual(findLeaks("Tu fórmula ¬(P ∧ Q) niega «las dos a la vez»; mira P ∧ Q por dentro.", ctx), []);
  assert.deepEqual(findLeaks("Con otros átomos: «no A ni B» es ¬A ∧ ¬B.", ctx), []);
  assert.deepEqual(findLeaks("Sin fórmulas aquí.", null), []);
  // Fórmulas que el alumno escribe en su pregunta no son una filtración.
  assert.deepEqual(findLeaks("P → Q, Q ∴ P no es válido: P → Q no garantiza Q → P.", ctx, "¿Es válido P → Q, Q ∴ P?"), ["Q → P"]);
  assert.deepEqual(findLeaks("No, P → Q con Q no da P.", ctx, "¿Es válido P → Q, Q ∴ P?"), []);
  // Fórmula del alumno con errores: cualquier fórmula completa con sus átomos cuenta.
  assert.equal(findLeaks("Sería ¬P ∧ ¬Q.", { atomos: "P: a\nQ: b", formula: "¬(P ∧" }).length, 1);
});

test("guardián: pide reescribir y, si insiste, tacha la fórmula", async (t) => {
  const sent = [];
  const replies = [
    { stop_reason: "end_turn", content: [{ type: "text", text: "Es ¬P ∧ ¬Q." }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Vale: ¬P ∧ ¬Q. ¿Lo ves?" }] },
  ];
  t.mock.method(globalThis, "fetch", async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(replies.shift()), { status: 200 }); });
  const j = await (await worker.fetch(post({ question: "dame la solución", context: { atomos: "P: estudio\nQ: trabajo", formula: "¬(P ∧ Q)", pestanas: [] } }), { ANTHROPIC_API_KEY: "x" })).json();
  assert.equal(sent.length, 2);
  assert.match(sent[1].messages.at(-1).content, /CONTROL DE INTEGRIDAD/);
  assert.ok(!j.text.includes("¬P ∧ ¬Q"));
  assert.match(j.text, /la escribes tú/);
});

test("bucle: si actúa sin decir nada, se le pide el texto; sin markdown", async (t) => {
  const sent = [];
  const replies = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "controlar_app", input: { accion: "iniciar_quiz" } }] },
    { stop_reason: "end_turn", content: [] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Es el error de **afirmar el consecuente** (*clásico*). ¿Lo ves?" }] },
  ];
  t.mock.method(globalThis, "fetch", async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(replies.shift()), { status: 200 }); });
  const j = await (await worker.fetch(post({ question: "¿la entiendo?", context: { formula: "P", pestanas: ["estr"] } }), { ANTHROPIC_API_KEY: "x" })).json();
  assert.equal(sent.length, 3);
  assert.equal(sent[2].tool_choice.type, "none");
  assert.equal(sent[2].messages.at(-1).content.at(-1).type, "text");
  assert.equal(j.text, "Es el error de afirmar el consecuente (clásico). ¿Lo ves?");
  assert.deepEqual(j.actions, [{ type: "iniciar_quiz" }]);
});

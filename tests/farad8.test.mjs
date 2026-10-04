// Tests del cerebro local de FARAD-8 con los errores reales de la sesión.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/logic.js";
import * as B from "../js/plugins/farad8/brain.js";

const ids = (frase, formula, atomos = "") => B.diagnose({ frase, formula }, L.analyze(formula, atomos)).map((d) => d.id);

test("«ni» mal formalizado", () => {
  assert.ok(ids("No estudio ni trabajo.", "¬(P ∧ Q)").includes("ni"));
  assert.deepEqual(ids("No estudio ni trabajo.", "¬P ∧ ¬Q"), []);
  assert.deepEqual(ids("No estudio ni trabajo.", "¬(P ∨ Q)"), []);
});

test("o exclusiva que falta o que sobra", () => {
  assert.ok(ids("Voy al gimnasio o salgo a correr, pero no las dos cosas.", "P ∨ Q").includes("excl-falta"));
  assert.deepEqual(ids("Voy al gimnasio o salgo a correr, pero no las dos cosas.", "(P ∨ Q) ∧ ¬(P ∧ Q)"), []);
  assert.ok(ids("Si hace sol y no trabajo, voy a la playa o a la montaña.", "(P∧¬Q)→((R∨S)∧¬(R∧S))").includes("excl-sobra"));
  assert.deepEqual(ids("Si hace sol y no trabajo, voy a la playa o a la montaña.", "(P ∧ ¬Q) → (R ∨ S)"), []);
});

test("coma + «y» y «cuando» al final", () => {
  assert.ok(ids("Leo, y escucho música cuando estoy solo.", "(¬R → Q) → P").includes("coma-y"));
  assert.deepEqual(ids("Leo, y escucho música cuando estoy solo.", "P ∧ (R → Q)"), []);
  const d = ids("Leo y escucho música, cuando estoy solo.", "(P ∧ Q) ∧ R");
  assert.equal(d[0], "cond-final");
  assert.deepEqual(ids("Leo y escucho música, cuando estoy solo.", "R → P ∧ Q"), []);
});

test("→ que sobra y condición necesaria", () => {
  assert.ok(ids("Estudio lógica y escucho música.", "P → Q").includes("cond-sobra"));
  assert.ok(ids("Sólo si estudias aprobarás.", "E → A").includes("necesaria"));
});

test("lectura en castellano", () => {
  const a = L.analyze("F ∧ ¬A → C ∨ M", "F: hace frío\nA: te abrigas\nC: te constipas\nM: lo pasas mal");
  assert.equal(B.readAloud(a.res.f, a.atomsMap), "si [«hace frío» y no «te abrigas»], entonces [«te constipas» o «lo pasas mal»]");
});

test("quiz coherente", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const a = L.analyze("P → Q", "");
  const qs = B.makeQuiz(a, rnd);
  assert.equal(qs.length, 3);
  for (const q of qs) { assert.ok(q.correct >= 0 && q.correct < q.options.length); assert.equal(new Set(q.options).size, q.options.length); }
  assert.equal(qs[0].options[qs[0].correct], "→ implicación");
  const arg = B.makeQuiz(L.analyze("P → Q, Q ∴ P", ""), rnd);
  assert.equal(arg[0].options[arg[0].correct], "No válido");
});

test("pistas: nunca vacías y la 1 es más suave que la 2", () => {
  const card = { frase: "No estudio ni trabajo.", formula: "¬(P ∧ Q)", atomos: "P: estudio\nQ: trabajo" };
  const a = L.analyze(card.formula, card.atomos);
  const h1 = B.hint(card, a, 1), h2 = B.hint(card, a, 2);
  assert.ok(h1.length && h2.length && h1 !== h2);
  assert.match(B.hint({ frase: "x", formula: "P ∧", atomos: "" }, L.analyze("P ∧", ""), 1), /acaba en una conectiva/);
});

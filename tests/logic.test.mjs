// Ejecutar: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/logic.js";

const F = (s) => { const r = L.parseAll(s); assert.equal(r.arg, false); return r.f; };

test("normalización de atajos", () => {
  assert.equal(L.conv("p & !q -> r | s"), "P ∧ ¬Q → R ∨ S");
  assert.equal(L.conv("a v b"), "A ∨ B");
  assert.equal(L.conv("p, q : r"), "P, Q ∴ R");
  assert.deepEqual(L.normalizeAt("p -", 3), { value: "P -", caret: 3 });
});

test("prioridad y asociatividad del módulo", () => {
  assert.equal(L.full(F("P ∨ ¬Q → R ∧ S → P")), "(((P ∨ (¬Q)) → (R ∧ S)) → P)");
  assert.equal(L.full(F("P ∧ Q ∨ R")), "((P ∧ Q) ∨ R)");
  assert.equal(L.mini(F("(P → Q) → R")), "P → Q → R");
  assert.equal(L.mini(F("P → (Q → R)")), "P → (Q → R)");
  assert.equal(L.mini(F("¬(P ∧ Q)")), "¬(P ∧ Q)");
});

test("errores con posición", () => {
  assert.throws(() => L.parseAll("P ∧"), /Falta algo al final/);
  assert.throws(() => L.parseAll("(P ∧ Q"), (e) => e.pos === 6);
  assert.throws(() => L.parseAll("P Q"), /Falta una conectiva/);
  assert.throws(() => L.parseAll("P)"), /Sobra/);
  assert.throws(() => L.parseAll("P # Q"), /Carácter no válido/);
});

test("clasificación", () => {
  assert.equal(L.classify(F("P ∨ ¬P")).kind, "tautologia");
  assert.equal(L.classify(F("P ∧ ¬P")).kind, "antinomia");
  assert.equal(L.classify(F("P → Q")).kind, "contingente");
});

test("equivalencias del módulo", () => {
  assert.equal(L.equivalent(F("¬A → ¬B"), F("B → A")).equal, true);
  assert.equal(L.equivalent(F("¬P ∧ ¬Q"), F("¬(P ∨ Q)")).equal, true);
  const r = L.equivalent(F("¬P ∧ ¬Q"), F("¬(P ∧ Q)"));
  assert.equal(r.equal, false);
});

test("validez de razonamientos", () => {
  const ok = L.parseAll("P → Q, P ∴ Q");
  assert.equal(L.validity(ok.premises, ok.conclusion).status, "valido");
  const bad = L.parseAll("P → Q, Q ∴ P");
  const v = L.validity(bad.premises, bad.conclusion);
  assert.equal(v.status, "no-valido");
  assert.equal(v.bad.length, 1);
  const inc = L.parseAll("P, ¬P ∴ Q");
  assert.equal(L.validity(inc.premises, inc.conclusion).status, "inconsistentes");
  const mod = L.parseAll("I ∧ C → D, D → A ∴ ¬A ∧ I → ¬C"); // ejemplo 4 del módulo
  assert.equal(L.validity(mod.premises, mod.conclusion).status, "valido");
});

test("formas normales equivalentes a la original", () => {
  for (const s of ["P → Q", "(F ∧ ¬A) → (C ∨ M)", "¬(P → Q) ∨ R", "(P ∨ Q) ∧ ¬(P ∧ Q)", "P → Q → R"]) {
    const f = F(s), nf = L.normalForms(f);
    const cnf = nf.cnf.length ? F(L.showCNF(nf.cnf)) : null;
    const dnf = nf.dnf.length ? F(L.showDNF(nf.dnf)) : null;
    if (cnf) assert.equal(L.equivalent(f, cnf).equal, true, "FNC " + s);
    if (dnf) assert.equal(L.equivalent(f, dnf).equal, true, "FND " + s);
  }
  assert.equal(L.normalForms(F("P ∨ ¬P")).cnf.length, 0);
});

test("conjunto de cláusulas para resolución", () => {
  const r = L.parseAll("P → Q, P ∴ Q");
  const s = L.resolutionSet(r.premises, r.conclusion).map((x) => x.c.join(" ∨ ") + "@" + x.from);
  assert.deepEqual(s, ["¬P ∨ Q@P1", "P@P2", "¬Q@¬C"]);
});

test("avisos de átomos", () => {
  const a = L.analyze("P ∧ Q", "P: no llueve\nR: ir a la playa");
  assert.ok(a.warnings.some((w) => w.includes("Sin definir: Q")));
  assert.ok(a.warnings.some((w) => w.includes("«no»")));
  assert.ok(a.warnings.some((w) => w.includes("infinitivo")));
});

test("resumen para la lista", () => {
  assert.equal(L.summary("P → Q, Q ∴ P").label, "No válido");
  assert.equal(L.summary("P ∨ ¬P").label, "Tautología");
  assert.equal(L.summary("P ∧").label, "Error");
});

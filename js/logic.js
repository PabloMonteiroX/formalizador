// logic.js — motor de lógica de enunciados (sin dependencias, sin DOM).
// Convenciones del módulo UOC "Lógica de enunciados":
//   prioridad ¬ > (∧ = ∨) > →, asociatividad izquierda, ∨ no exclusiva.

export const SYM = { and: "∧", or: "∨", imp: "→" };
export const PREC = { imp: 1, and: 2, or: 2, not: 3, atom: 4 };
export const NAME = {
  imp: "Implicación (→)", and: "Conjunción (∧)", or: "Disyunción (∨)",
  not: "Negación (¬)", atom: "Átomo",
};
export const MAX_ATOMS = 12;   // 4096 filas como máximo
export const CLAUSE_LIMIT = 256;

/* ---------- normalización de lo que se teclea ---------- */
// Convierte atajos ASCII en símbolos. keepTrailingDash deja un "-" final
// sin convertir para que "->" pueda completarse.
export function conv(str, keepTrailingDash = false) {
  let trail = "";
  if (keepTrailingDash && str.endsWith("-")) { trail = "-"; str = str.slice(0, -1); }
  str = str
    .replace(/->|=>/g, "→").replace(/>/g, "→")
    .replace(/[!~¬-]/g, "¬")
    .replace(/[&*^]/g, "∧")
    .replace(/[|+]/g, "∨").replace(/v/g, "∨")
    .replace(/:/g, "∴").replace(/;/g, ",")
    .replace(/[\[{]/g, "(").replace(/[\]}]/g, ")")
    .replace(/[a-z]/g, (c) => c.toUpperCase());
  return str + trail;
}

// Normaliza respetando la posición del cursor. Devuelve {value, caret}.
export function normalizeAt(value, caret) {
  const b = conv(value.slice(0, caret), true);
  const a = conv(value.slice(caret), false);
  return { value: b + a, caret: b.length };
}

/* ---------- parser ---------- */
export class ParseError extends Error {
  constructor(msg, pos) { super(msg); this.pos = pos; }
}

function tokenize(s) {
  const t = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    if (/[A-Z]/.test(ch)) t.push({ k: "atom", v: ch, p: i });
    else if ("¬∧∨→(),∴".includes(ch)) t.push({ k: ch, v: ch, p: i });
    else if (ch === "-") t.push({ k: "¬", v: "¬", p: i });
    else throw new ParseError(`Carácter no válido «${ch}».`, i);
  }
  return t;
}

class Parser {
  constructor(t, len) { this.t = t; this.i = 0; this.len = len; }
  peek() { return this.t[this.i]; }
  impl() {
    let l = this.bin();
    while (this.peek()?.k === "→") { this.i++; l = { t: "imp", l, r: this.bin() }; }
    return l;
  }
  bin() {
    let l = this.un();
    while (this.peek() && (this.peek().k === "∧" || this.peek().k === "∨")) {
      const op = this.peek().k; this.i++;
      l = { t: op === "∧" ? "and" : "or", l, r: this.un() };
    }
    return l;
  }
  un() {
    const x = this.peek();
    if (!x) throw new ParseError(this.i === 0 ? "Fórmula vacía." : "Falta algo al final: se esperaba un átomo, ¬ o «(».", this.len);
    if (x.k === "¬") { this.i++; return { t: "not", a: this.un() }; }
    if (x.k === "atom") { this.i++; return { t: "atom", n: x.v }; }
    if (x.k === "(") {
      const open = x.p; this.i++;
      const n = this.impl();
      const y = this.peek();
      if (!y || y.k !== ")") throw new ParseError(`Falta el «)» que cierra el «(» de la posición ${open + 1}.`, y ? y.p : this.len);
      this.i++; return n;
    }
    if (x.k === ")") throw new ParseError("Sobra un «)» o falta algo antes de él.", x.p);
    throw new ParseError(`Se esperaba un átomo, ¬ o «(», y aparece «${x.v}».`, x.p);
  }
}

// Devuelve null (vacío), {arg:false, f} o {arg:true, premises, conclusion}.
export function parseAll(src) {
  const toks = tokenize(src);
  if (!toks.length) return null;
  const P = new Parser(toks, src.length);
  const parts = []; let concl = null;
  if (P.peek().k === "∴") { P.i++; concl = P.impl(); } else parts.push(P.impl());
  while (P.peek()) {
    const x = P.peek();
    if (x.k === ",") {
      if (concl) throw new ParseError("Después de ∴ solo va la conclusión.", x.p);
      P.i++; parts.push(P.impl()); continue;
    }
    if (x.k === "∴") {
      if (concl) throw new ParseError("Solo puede haber un ∴.", x.p);
      P.i++; concl = P.impl(); continue;
    }
    if (x.k === "atom" || x.k === "(" || x.k === "¬") throw new ParseError(`Falta una conectiva antes de «${x.v}».`, x.p);
    if (x.k === ")") throw new ParseError("Sobra este «)»: no hay ningún «(» abierto.", x.p);
    throw new ParseError(`«${x.v}» inesperado.`, x.p);
  }
  if (concl || parts.length > 1) return { arg: true, premises: parts, conclusion: concl };
  return { arg: false, f: parts[0] };
}

/* ---------- impresión ---------- */
export function full(n) {
  if (n.t === "atom") return n.n;
  if (n.t === "not") return `(¬${full(n.a)})`;
  return `(${full(n.l)} ${SYM[n.t]} ${full(n.r)})`;
}
export function mini(n) {
  if (n.t === "atom") return n.n;
  if (n.t === "not") { const s = mini(n.a); return "¬" + (PREC[n.a.t] < 3 ? `(${s})` : s); }
  const p = PREC[n.t];
  let l = mini(n.l), r = mini(n.r);
  if (PREC[n.l.t] < p) l = `(${l})`;
  if (PREC[n.r.t] <= p) r = `(${r})`;
  return `${l} ${SYM[n.t]} ${r}`;
}

/* ---------- semántica ---------- */
export function atomsOf(n, set = new Set()) {
  if (n.t === "atom") set.add(n.n);
  else if (n.t === "not") atomsOf(n.a, set);
  else { atomsOf(n.l, set); atomsOf(n.r, set); }
  return set;
}
export function atomList(...forms) {
  const s = new Set(); forms.forEach((f) => atomsOf(f, s)); return [...s].sort();
}
export function ev(n, e) {
  switch (n.t) {
    case "atom": return e[n.n];
    case "not": return !ev(n.a, e);
    case "and": return ev(n.l, e) && ev(n.r, e);
    case "or": return ev(n.l, e) || ev(n.r, e);
    case "imp": return !ev(n.l, e) || ev(n.r, e);
  }
}
// Filas en el orden del módulo: empezando por todo V.
export function rows(atoms) {
  const out = [], k = atoms.length;
  for (let m = 0; m < (1 << k); m++) {
    const e = {};
    for (let j = 0; j < k; j++) e[atoms[j]] = !((m >> (k - 1 - j)) & 1);
    out.push(e);
  }
  return out;
}
export function depth(n) { return n.t === "atom" ? 0 : n.t === "not" ? 1 + depth(n.a) : 1 + Math.max(depth(n.l), depth(n.r)); }
export function countConn(n) { return n.t === "atom" ? 0 : n.t === "not" ? 1 + countConn(n.a) : 1 + countConn(n.l) + countConn(n.r); }
// Subfórmulas no atómicas, de dentro hacia fuera, sin repetir.
export function subs(n, acc = [], seen = new Set()) {
  if (n.t === "atom") return acc;
  if (n.t === "not") subs(n.a, acc, seen); else { subs(n.l, acc, seen); subs(n.r, acc, seen); }
  const k = mini(n); if (!seen.has(k)) { seen.add(k); acc.push(n); }
  return acc;
}
export function classify(f, atoms = atomList(f)) {
  const R = rows(atoms); let t = 0;
  for (const e of R) if (ev(f, e)) t++;
  const kind = t === R.length ? "tautologia" : t === 0 ? "antinomia" : "contingente";
  return { kind, trueRows: t, total: R.length };
}
export function equivalent(f, g) {
  const atoms = atomList(f, g);
  if (atoms.length > MAX_ATOMS) return { tooMany: true };
  for (const e of rows(atoms)) if (ev(f, e) !== ev(g, e)) return { equal: false, row: e, atoms, fv: ev(f, e), gv: ev(g, e) };
  return { equal: true, atoms, same: full(f) === full(g) };
}
// Validez por tabla: crit = filas con todas las premisas V; bad = contraejemplos.
export function validity(premises, conclusion) {
  const atoms = atomList(...premises, ...(conclusion ? [conclusion] : []));
  if (atoms.length > MAX_ATOMS) return { tooMany: true, atoms };
  const R = rows(atoms), crit = [], bad = [];
  R.forEach((e, i) => {
    if (premises.every((p) => ev(p, e))) { crit.push(i); if (conclusion && !ev(conclusion, e)) bad.push(i); }
  });
  let status;
  if (!crit.length) status = "inconsistentes";
  else if (!conclusion) status = "consistentes";
  else status = bad.length ? "no-valido" : "valido";
  return { atoms, rows: R, crit, bad, status };
}

/* ---------- formas normales ---------- */
export const NOT = (a) => ({ t: "not", a });
export function elim(n) {
  if (n.t === "atom") return n;
  if (n.t === "not") return NOT(elim(n.a));
  if (n.t === "imp") return { t: "or", l: NOT(elim(n.l)), r: elim(n.r) };
  return { t: n.t, l: elim(n.l), r: elim(n.r) };
}
export function nnf(n) {
  if (n.t === "atom") return n;
  if (n.t === "and" || n.t === "or") return { t: n.t, l: nnf(n.l), r: nnf(n.r) };
  if (n.t === "imp") return { t: "or", l: nnf(NOT(n.l)), r: nnf(n.r) };
  const a = n.a;
  if (a.t === "atom") return n;
  if (a.t === "not") return nnf(a.a);
  if (a.t === "and") return { t: "or", l: nnf(NOT(a.l)), r: nnf(NOT(a.r)) };
  if (a.t === "or") return { t: "and", l: nnf(NOT(a.l)), r: nnf(NOT(a.r)) };
  return { t: "and", l: nnf(a.l), r: nnf(NOT(a.r)) }; // ¬(A→B) ≡ A ∧ ¬B
}
const lit = (n) => (n.t === "atom" ? n.n : "¬" + n.a.n);
function cross(A, B) {
  if (A.length * B.length > CLAUSE_LIMIT) throw new RangeError("demasiadas cláusulas");
  const o = []; for (const a of A) for (const b of B) o.push(a.concat(b)); return o;
}
export function cnf(n) { if (n.t === "atom" || n.t === "not") return [[lit(n)]]; if (n.t === "and") return cnf(n.l).concat(cnf(n.r)); return cross(cnf(n.l), cnf(n.r)); }
export function dnf(n) { if (n.t === "atom" || n.t === "not") return [[lit(n)]]; if (n.t === "or") return dnf(n.l).concat(dnf(n.r)); return cross(dnf(n.l), dnf(n.r)); }
const litKey = (s) => s.replace("¬", "") + (s[0] === "¬" ? "1" : "0");
// Sin literales repetidos, sin P y ¬P juntos, sin duplicados y con absorción.
export function simplify(cl) {
  const seen = new Set(), out = [];
  for (const c of cl) {
    const ls = [...new Set(c)].sort((a, b) => (litKey(a) < litKey(b) ? -1 : 1));
    if (ls.some((l) => l[0] !== "¬" && ls.includes("¬" + l))) continue;
    const k = ls.join("|"); if (!seen.has(k)) { seen.add(k); out.push(ls); }
  }
  return out.filter((c, i) => !out.some((d, j) => j !== i && d.length < c.length && d.every((l) => c.includes(l))));
}
export const showCNF = (cl) => cl.map((c) => (c.length > 1 ? `(${c.join(" ∨ ")})` : c[0])).join(" ∧ ");
export const showDNF = (cl) => cl.map((c) => (c.length > 1 ? `(${c.join(" ∧ ")})` : c[0])).join(" ∨ ");
export function normalForms(f) {
  const step1 = elim(f), step2 = nnf(step1);
  return { step1, step2, cnf: simplify(cnf(step2)), dnf: simplify(dnf(step2)) };
}
// Cláusulas para resolución: premisas + conclusión negada (conjunto de apoyo).
export function resolutionSet(premises, conclusion) {
  const items = [];
  premises.forEach((p, i) => simplify(cnf(nnf(p))).forEach((c) => items.push({ c, from: `P${i + 1}` })));
  if (conclusion) simplify(cnf(nnf(NOT(conclusion)))).forEach((c) => items.push({ c, from: "¬C" }));
  return items;
}

/* ---------- átomos escritos por el usuario ---------- */
const CONN_WORDS = ["si", "no", "y", "e", "o", "u", "ni", "pero", "entonces", "cuando", "sólo", "solo", "siempre", "aunque", "nunca"];
export function parseAtoms(txt) {
  const map = {}, issues = [];
  for (const line of txt.split(/\n/)) {
    const m = line.match(/^\s*([A-Za-z])\s*[:=]\s*(.*)$/);
    if (!m) { if (line.trim()) issues.push(`No entiendo la línea «${line.trim()}». Usa el formato P: significado.`); continue; }
    const L = m[1].toUpperCase(), mean = m[2].trim();
    if (map[L] !== undefined) issues.push(`El átomo ${L} está definido dos veces.`);
    map[L] = mean;
    const words = mean.toLowerCase().split(/[^a-záéíóúüñ]+/).filter(Boolean);
    const bad = words.filter((w) => CONN_WORDS.includes(w));
    if (bad.length) issues.push(`El significado de ${L} contiene «${bad.join("», «")}». Los átomos van sin palabras de conectiva y en positivo; la negación se pone con ¬.`);
    if (/^[a-záéíóúñ]*(ar|er|ir)\s/i.test(mean)) issues.push(`El significado de ${L} empieza por infinitivo («${mean.split(/\s+/)[0]}»). Escríbelo como frase declarativa: «(yo) voy…», «(él) estudia…».`);
  }
  return { map, issues };
}

/* ---------- análisis completo de una tarjeta ---------- */
export function analyze(formula, atomsText) {
  const A = parseAtoms(atomsText || "");
  const out = { atomsMap: A.map, warnings: A.issues.slice() };
  try { out.res = parseAll(formula || ""); } catch (e) { out.error = e; return out; }
  if (!out.res) return out;
  const forms = out.res.arg ? [...out.res.premises, ...(out.res.conclusion ? [out.res.conclusion] : [])] : [out.res.f];
  out.atoms = atomList(...forms);
  const undef = out.atoms.filter((L) => A.map[L] === undefined);
  if (undef.length) out.warnings.unshift(`Sin definir: ${undef.join(", ")}. Define cada átomo antes de usarlo.`);
  const unused = Object.keys(A.map).filter((L) => !out.atoms.includes(L));
  if (unused.length) out.warnings.push(`Definido pero no usado: ${unused.join(", ")}.`);
  return out;
}

// Resumen corto para la lista (pill).
export function summary(formula) {
  let r;
  try { r = parseAll(formula || ""); } catch { return { label: "Error", tone: "err" }; }
  if (!r) return { label: "Vacía", tone: "idle" };
  if (r.arg) {
    const v = validity(r.premises, r.conclusion);
    if (v.tooMany) return { label: "Razonamiento", tone: "mid" };
    return ({
      valido: { label: "Válido", tone: "ok" },
      "no-valido": { label: "No válido", tone: "err" },
      inconsistentes: { label: "Premisas inconsistentes", tone: "warn" },
      consistentes: { label: "Sin conclusión", tone: "mid" },
    })[v.status];
  }
  const a = atomList(r.f);
  if (a.length > MAX_ATOMS) return { label: "Fórmula", tone: "mid" };
  const c = classify(r.f, a).kind;
  return ({ tautologia: { label: "Tautología", tone: "ok" }, antinomia: { label: "Antinomia", tone: "err" }, contingente: { label: "Contingente", tone: "mid" } })[c];
}

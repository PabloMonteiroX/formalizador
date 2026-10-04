// brain.js — "cerebro cartucho" de FARAD-8. Funciona 100 % sin conexión.
// Puro: sin DOM. Recibe la tarjeta y el análisis del motor lógico y devuelve texto.
// Regla de integridad: guía con pistas y preguntas; nunca escribe la formalización por ti.
import * as L from "../../logic.js";

export const NAME = "FARAD-8";

/* ---------- personalidad ---------- */
export const LINES = {
  hello: [
    "MOV AX, LOGICA ; arrancando… ¡Hola! Soy FARAD-8. Escribe una frase y la desmontamos juntos.",
    "PRESS START ▸ Soy FARAD-8, tu copiloto de 8 bits para la lógica de enunciados.",
    "Bobina cargada al 100 %. Soy FARAD-8: yo pongo las pistas, tú pones el cerebro.",
  ],
  greetCard: [
    "Nueva tarjeta en el cartucho. Primero los átomos, luego las conectivas.",
    "LOAD \"FRASE\",8,1 … listo. ¿Empezamos por los átomos?",
    "PERFORM ANALIZAR-FRASE. ← así lo diría en COBOL. Tú empieza por los átomos.",
  ],
  think: ["Procesando… ▒▒▓▓░░", "; calculando acarreo lógico…", "(car (cdr frase)) … hmm.", "Compilando pista… 0 warnings (de momento)."],
  ok: ["¡1-UP! Correcto.", "STATUS: OK. Así se hace.", "Bien. Faraday estaría orgulloso de esa inducción.", "JMP SIGUIENTE ; acertaste."],
  fail: ["Casi. CONTINUE? ▸ 9…8…", "Segfault lógico, nada grave. Mira la explicación.", "if (!acierto) { aprender(); } ← justo esto.", "Chispa sin tierra: revisa la explicación."],
  understood: ["★ COMPRENDIDO ★ Esta fórmula ya es tuya.", "Nivel superado. Guardado en la memoria de la batería."],
  offline: [
    "Sin señal. Jaula de Faraday activada: sigo funcionando en modo cartucho.",
    "La antena no conecta… no pasa nada: tengo el cerebro de serie en la ROM.",
    "Modo offline. Sin nube, pero con todas las pistas locales.",
  ],
  back: ["¡Señal recuperada! Bobina recargada, vuelvo a tener cerebro online.", "Reconectado. Aterrizaje vertical completado."],
  degraded: ["El cerebro online no responde. Paso a modo cartucho y lo vuelvo a intentar más tarde."],
  glitch: ["▓▒░ ¿me has visto parpadear? Es personalidad, no un fallo. ░▒▓", "BRK ; perdón, un pixel suelto.", "01000110 01000001 01010010… digo, ¡hola!"],
  idle: [
    "¿Te atascas? Pulsa PISTA. La primera es suave.",
    "Truco: pulsa LEER y compara mi lectura con tu frase, palabra por palabra.",
    "Cuando la tengas, pulsa QUIZ: 3 preguntas y sabremos si la entiendes de verdad.",
  ],
};
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

/* ---------- utilidades de árbol ---------- */
const some = (n, pred) => pred(n) || (n.t === "not" ? some(n.a, pred) : n.t !== "atom" && (some(n.l, pred) || some(n.r, pred)));
const isImp = (n) => n.t === "imp";
const isNiPattern = (n) => (n.t === "and" && n.l.t === "not" && n.r.t === "not") || (n.t === "not" && n.a.t === "or");
const isExclusive = (n) => n.t === "and" && ((n.l.t === "or" && n.r.t === "not" && n.r.a.t === "and") || (n.r.t === "or" && n.l.t === "not" && n.l.a.t === "and"));

/* ---------- leer la fórmula en castellano ---------- */
export function readAloud(n, map = {}) {
  const at = (x) => (map[x] ? `«${map[x]}»` : x);
  const part = (c) => { const s = readAloud(c, map); return c.t === "atom" || c.t === "not" ? s : `[${s}]`; };
  switch (n.t) {
    case "atom": return at(n.n);
    case "not": return n.a.t === "atom" ? `no ${at(n.a.n)}` : `no es cierto que ${part(n.a)}`;
    case "and": return `${part(n.l)} y ${part(n.r)}`;
    case "or": return `${part(n.l)} o ${part(n.r)}`;
    case "imp": return `si ${part(n.l)}, entonces ${part(n.r)}`;
  }
  return "";
}

/* ---------- diagnóstico: frase frente a fórmula ---------- */
const norm = (s) => ` ${(s || "").toLowerCase().replace(/\s+/g, " ").trim()} `;
const RX = {
  ni: /\sni\s/,
  excl: /pero no (a )?(los|las) dos|pero no ambos|pero no ambas|pero no a la vez|no las dos cosas|no los dos/,
  cond: /\s(si|cuando|siempre que|basta con|en caso de que|s[oó]lo si|s[oó]lo cuando|es necesario|hace falta|para que)\s/,
  necessary: /s[oó]lo si|s[oó]lo cuando|es necesario|hace falta|\sdebe\s|\sdebes\s|tiene que|tienes que/,
  trailingCond: /,\s*(cuando|si|siempre que)\s+[^,]+[.!]?\s*$/,
  leadingCond: /^\s*(si|cuando|siempre que)\s/,
  commaY: /,\s*(y|e)\s/,
};

// Devuelve pistas ordenadas por importancia: {id, zone (pista suave), text (pista concreta)}.
export function diagnose(card, analysis) {
  const out = [];
  if (!analysis?.res || !card?.frase?.trim()) return out;
  const res = analysis.res;
  const forms = res.arg ? [...res.premises, ...(res.conclusion ? [res.conclusion] : [])] : [res.f];
  const anyF = (pred) => forms.some((f) => some(f, pred));
  const fr = norm(card.frase);
  const single = !res.arg ? res.f : null;

  if (RX.ni.test(fr) && !anyF(isNiPattern))
    out.push({ id: "ni", zone: "Mira cómo has traducido la palabra «ni».", text: "La frase usa «ni». «No A ni B» niega las dos cosas: tienen que quedar «no A» y «no B». ¿Tu fórmula niega las dos o solo «las dos a la vez»?" });
  if (RX.excl.test(fr) && !anyF(isExclusive))
    out.push({ id: "excl-falta", zone: "La frase dice «pero no las dos». ¿Dónde está eso en tu fórmula?", text: "«A o B, pero no las dos» es una o exclusiva. Con las conectivas del módulo se escribe como una disyunción y, además, la negación de que pasen las dos." });
  if (!RX.excl.test(fr) && anyF(isExclusive))
    out.push({ id: "excl-sobra", zone: "Revisa la «o» de tu fórmula.", text: "Tu fórmula dice «pero no las dos» (o exclusiva). La ∨ del módulo NO es exclusiva salvo que la frase lo diga explícitamente. ¿Lo dice?" });
  if (single && RX.trailingCond.test(fr) && single.t !== "imp")
    out.push({ id: "cond-final", zone: "Fíjate en lo que va después de la última coma.", text: "La frase termina en «…, cuando/si …». Eso suele ser la condición de TODO lo anterior: la conectiva principal debería ser →, con esa condición a la izquierda." });
  if (single && RX.leadingCond.test(fr) && single.t !== "imp")
    out.push({ id: "cond-inicio", zone: "¿Cómo empieza la frase?", text: "La frase empieza por «si/cuando»: lo normal es que la conectiva principal sea →. La tuya es " + L.NAME[single.t].toLowerCase() + "." });
  if (RX.cond.test(fr) && !anyF(isImp))
    out.push({ id: "cond-falta", zone: "En la frase hay una condición.", text: "Veo «si», «cuando», «sólo si» o algo parecido, y tu fórmula no tiene ninguna →. Las condiciones se formalizan con →." });
  if (!RX.cond.test(fr) && !RX.necessary.test(fr) && anyF(isImp))
    out.push({ id: "cond-sobra", zone: "¿De dónde sale tu →?", text: "Tu fórmula tiene →, pero en la frase no veo «si», «cuando», «sólo si», «es necesario»… ¿Qué palabra expresa esa condición? Si no hay ninguna, probablemente sea una ∧." });
  if (RX.necessary.test(fr) && anyF(isImp))
    out.push({ id: "necesaria", zone: "Comprueba la dirección de la flecha.", text: "La frase tiene una condición NECESARIA («sólo si», «es necesario», «para … debe…»). Lo necesario va a la DERECHA: «sólo si X, B» es B → X (o ¬X → ¬B). ¿Tu flecha apunta así?" });
  if (single && RX.commaY.test(fr) && single.t !== "and" && !RX.trailingCond.test(fr))
    out.push({ id: "coma-y", zone: "Mira la coma antes de la «y».", text: "«…, y …»: esa coma suele separar dos bloques que se unen con ∧ como conectiva principal." });
  if (single && L.atomList(single).length <= L.MAX_ATOMS) {
    const k = L.classify(single).kind;
    if (k !== "contingente") out.push({ id: "taut", zone: "Mira la pestaña Tabla.", text: `Tu fórmula es una ${k === "tautologia" ? "tautología (siempre V)" : "antinomia (siempre F)"}. Una frase normal casi nunca lo es: revisa si has repetido o negado un átomo de más.` });
  }
  return out;
}

/* ---------- explicaciones ---------- */
export function explainError(err) {
  const m = err?.message || "";
  if (/Falta el «\)»/.test(m)) return "Hay un «(» sin cerrar. Cuenta: cada ( necesita su ). Truco de ensamblador: PUSH al abrir, POP al cerrar; al final la pila debe quedar vacía.";
  if (/Sobra/.test(m)) return "Hay un «)» de más, o falta algo justo antes. Mira dónde señala el ^.";
  if (/Falta una conectiva/.test(m)) return "Hay dos piezas seguidas sin conectiva entre ellas (por ejemplo, «P Q»). ¿Qué las une en la frase: y, o, si…?";
  if (/Falta algo al final/.test(m)) return "La fórmula acaba en una conectiva. Después de ∧, ∨ o → siempre tiene que venir algo.";
  if (/Carácter no válido/.test(m)) return "Ese carácter no existe en el lenguaje de enunciados. Usa la barra de conectivas.";
  if (/Se esperaba/.test(m)) return "Ahí debería empezar una fórmula (un átomo, un ¬ o un «(»), y hay otra cosa.";
  return m || "Algo no cuadra en la sintaxis.";
}

export function explainCounterexample(v, map = {}) {
  if (!v?.bad?.length) return "";
  const e = v.rows[v.bad[0]];
  const parts = v.atoms.map((x) => `${map[x] ? "«" + map[x] + "»" : x} es ${e[x] ? "verdad" : "falso"}`);
  return `Imagina un mundo donde ${parts.join(", ")}. Ahí todas las premisas se cumplen y la conclusión falla. Un solo mundo así basta para que el razonamiento no sea válido.`;
}

const THEORY = [
  [/principal/, "La conectiva principal es la ÚLTIMA que se aplica: la que queda fuera de todos los paréntesis. Con las prioridades del módulo (¬ > ∧ = ∨ > →), si hay → fuera de paréntesis, suele ser la principal."],
  [/necesari|s[oó]lo si/, "«A es necesario para B» = sin A no hay B. Se formaliza B → A (o ¬A → ¬B). Lo necesario va a la derecha."],
  [/suficient/, "«A es suficiente para B» = basta con A para tener B. Se formaliza A → B. Lo suficiente va a la izquierda."],
  [/\bni\b/, "«No A ni B» = no A y no B: ¬A ∧ ¬B, que equivale a ¬(A ∨ B). Ojo: ¬(A ∧ B) es otra cosa («no las dos a la vez»)."],
  [/exclusiv|pero no/, "La ∨ del módulo es inclusiva. «A o B, pero no los dos» se escribe (A ∨ B) ∧ ¬(A ∧ B)."],
  [/v[aá]lid|contraejemplo/, "Un razonamiento es válido si no existe ninguna fila con todas las premisas V y la conclusión F. Esa fila, si existe, es el contraejemplo."],
  [/tabla|verdad/, "La tabla prueba todas las combinaciones de V y F de los átomos. Con n átomos hay 2^n filas."],
  [/fnc|fnd|normal|cl[aá]usula/, "FNC = conjunción de cláusulas (disyunciones de literales). Pasos: quitar → (A → B ≡ ¬A ∨ B), meter las ¬ hacia dentro (De Morgan) y distribuir."],
  [/[aá]tomo/, "Un átomo es una frase declarativa simple, en positivo y sin conectivas dentro: «(yo) salgo», no «no salgo» ni «si salgo»."],
  [/par[eé]ntesis|prioridad/, "Prioridad: ¬ primero, luego ∧ y ∨ (iguales) y por último →. Con la misma prioridad se agrupa de izquierda a derecha."],
];

// Respuesta local a una pregunta libre (modo cartucho).
export function localAnswer(question, card, analysis) {
  const q = (question || "").toLowerCase();
  if (/pista|ayuda|atasc|no s[eé]/.test(q)) return null; // la UI lo trata como PISTA
  for (const [rx, text] of THEORY) if (rx.test(q)) return text;
  if (/lee|dice|significa/.test(q) && analysis?.res && !analysis.res.arg) return "Tu fórmula dice: " + readAloud(analysis.res.f, analysis.atomsMap) + ".";
  return "En modo cartucho entiendo palabras clave: conectiva principal, necesaria, suficiente, «ni», exclusiva, válido, tabla, FNC, átomo, paréntesis. O usa los botones PISTA, LEER y QUIZ.";
}

/* ---------- quiz de comprensión ---------- */
function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mcq(q, correct, wrong, why, rnd) {
  const opts = shuffle([correct, ...wrong.filter((w) => w !== correct)].filter((v, i, s) => s.indexOf(v) === i), rnd);
  return { q, options: opts, correct: opts.indexOf(correct), why };
}
const MAIN = { imp: "→ implicación", and: "∧ conjunción", or: "∨ disyunción", not: "¬ negación" };
function swapTop(n) {
  if (n.t === "imp") return { t: "imp", l: n.r, r: n.l };
  if (n.t === "and") return { ...n, t: "or" };
  if (n.t === "or") return { ...n, t: "and" };
  if (n.t === "not") return n.a;
  return { t: "not", a: n };
}
function evalSteps(f, env) {
  return L.subs(f).map((s) => `${L.mini(s)} = ${L.ev(s, env) ? "V" : "F"}`).join(" · ");
}

export function makeQuiz(analysis, rnd = Math.random) {
  const res = analysis?.res; if (!res) return [];
  const map = analysis.atomsMap || {};
  const qs = [];
  if (!res.arg) {
    const f = res.f, atoms = L.atomList(f);
    if (atoms.length > L.MAX_ATOMS) return [];
    if (f.t !== "atom") qs.push(mcq("¿Cuál es la conectiva principal de tu fórmula?", MAIN[f.t], Object.values(MAIN), `Es la última que se aplica: queda fuera de todo en ${L.mini(f)}.`, rnd));
    const env = L.rows(atoms)[Math.floor(rnd() * (1 << atoms.length))];
    const val = L.ev(f, env) ? "V" : "F";
    qs.push(mcq(`Si ${atoms.map((x) => `${x} = ${env[x] ? "V" : "F"}`).join(", ")}, ¿cuánto vale la fórmula?`, val, ["V", "F"], "Paso a paso, de dentro hacia fuera: " + evalSteps(f, env), rnd));
    if (f.t !== "atom") {
      const right = readAloud(f, map), wrong1 = readAloud(swapTop(f), map);
      const wrong2 = f.t === "imp" ? readAloud({ t: "and", l: f.l, r: f.r }, map) : readAloud({ t: "not", a: f }, map);
      qs.push(mcq("¿Qué dice exactamente tu fórmula?", right, [wrong1, wrong2], f.t === "imp" ? "En A → B, A es lo suficiente (va primero, tras el «si») y B es lo que se garantiza." : "Lee la conectiva principal primero y después cada lado.", rnd));
    }
  } else {
    const v = L.validity(res.premises, res.conclusion);
    if (v.tooMany || !res.conclusion) return [];
    const lab = { valido: "Válido", "no-valido": "No válido", inconsistentes: "Premisas inconsistentes" }[v.status];
    qs.push(mcq("¿Este razonamiento es válido?", lab, ["Válido", "No válido", "Premisas inconsistentes"],
      v.status === "no-valido" ? explainCounterexample(v, map) : v.status === "valido" ? "En todas las filas donde las premisas son V, la conclusión también lo es." : "Las premisas nunca son V a la vez, así que se deduce cualquier cosa.", rnd));
    const c = res.conclusion;
    if (c.t !== "atom") qs.push(mcq("¿Cuál es la conectiva principal de la conclusión?", MAIN[c.t], Object.values(MAIN), `En ${L.mini(c)} es la que queda fuera de todo.`, rnd));
    const env = v.rows[Math.floor(rnd() * v.rows.length)];
    const allP = res.premises.every((p) => L.ev(p, env));
    qs.push(mcq(`Con ${v.atoms.map((x) => `${x} = ${env[x] ? "V" : "F"}`).join(", ")}, ¿son verdaderas TODAS las premisas?`, allP ? "Sí" : "No", ["Sí", "No"],
      res.premises.map((p, i) => `P${i + 1}: ${L.mini(p)} = ${L.ev(p, env) ? "V" : "F"}`).join(" · "), rnd));
  }
  return qs;
}

/* ---------- escalera de pistas ---------- */
// level 1 = suave (zona), level 2 = concreta. Nunca da la fórmula final.
export function hint(card, analysis, level = 1) {
  if (!card?.formula?.trim()) {
    if (!card?.atomos?.trim()) return "Empieza por los átomos: busca las frases declarativas más simples y escríbelas en positivo, una por línea (P: …).";
    return "Ya tienes átomos. Ahora busca en la frase las palabras que hacen de conectiva: «y», «o», «no», «ni», «si», «cuando», «sólo si».";
  }
  if (analysis?.error) return explainError(analysis.error);
  const d = diagnose(card, analysis);
  if (d.length) return level <= 1 ? d[0].zone : d[0].text;
  const und = analysis?.warnings?.find((w) => w.startsWith("Sin definir"));
  if (und) return "Te falta definir algún átomo. En la PEC es obligatorio.";
  return level <= 1
    ? "No veo errores típicos. Pulsa LEER y compara mi lectura con tu frase, palabra por palabra."
    : "Comprueba tú mismo: lee la frase en voz alta, después mi lectura (LEER). Si dicen lo mismo, haz el QUIZ para confirmarlo.";
}

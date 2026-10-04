// store.js — persistencia local (localStorage) + copia de seguridad JSON.
const KEY = "formalizador:v1";
const FLAGS = "formalizador:flags";
export const SCHEMA = 1;

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 12);

export function blankCard(kind = "frase", n = 1) {
  const now = Date.now();
  return { id: uid(), tag: (kind === "razonamiento" ? "Razonamiento " : "Frase ") + n, kind, frase: "", atomos: "", formula: "", compare: "", tab: kind === "razonamiento" ? "val" : "estr", example: false, createdAt: now, updatedAt: now };
}

export function exampleCards() {
  const now = Date.now();
  return [
    { id: uid(), tag: "Ejemplo · frase", kind: "frase", example: true, tab: "estr", createdAt: now, updatedAt: now - 1,
      frase: "Te constiparás o lo pasarás mal, si hace frío y no te abrigas antes de salir a la calle.",
      atomos: "C: (tú) te constiparás\nM: (tú) lo pasarás mal\nF: hace frío\nA: (tú) te abrigas antes de salir a la calle",
      formula: "F ∧ ¬A → C ∨ M", compare: "" },
    { id: uid(), tag: "Ejemplo · razonamiento", kind: "razonamiento", example: true, tab: "val", createdAt: now, updatedAt: now - 2,
      frase: "Cuando los informáticos hacen bien su trabajo y los clientes hacen peticiones razonables, los directivos se muestran amables con sus subordinados. Cuando los directivos son amables con sus subordinados, los accionistas minoritarios compran más acciones. De todo esto se desprende que si los accionistas minoritarios no compran más acciones, pero los informáticos hacen bien su trabajo, los clientes no hacen peticiones razonables.",
      atomos: "I: los informáticos hacen bien su trabajo\nC: los clientes hacen peticiones razonables\nD: los directivos se muestran amables con sus subordinados\nA: los accionistas minoritarios compran más acciones",
      formula: "I ∧ C → D, D → A ∴ ¬A ∧ I → ¬C", compare: "" },
  ];
}

function sanitize(c) {
  const s = (v, max = 5000) => (typeof v === "string" ? v.slice(0, max) : "");
  if (!c || typeof c !== "object") return null;
  const now = Date.now();
  return {
    id: s(c.id, 40) || uid(), tag: s(c.tag, 60), kind: c.kind === "razonamiento" ? "razonamiento" : "frase",
    frase: s(c.frase), atomos: s(c.atomos), formula: s(c.formula, 1000), compare: s(c.compare, 1000),
    tab: s(c.tab, 10) || "estr", example: !!c.example,
    createdAt: Number.isFinite(c.createdAt) ? c.createdAt : now, updatedAt: Number.isFinite(c.updatedAt) ? c.updatedAt : now,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.cards)) return d.cards.map(sanitize).filter(Boolean);
    }
  } catch { /* datos corruptos o almacenamiento bloqueado */ }
  return null; // null = primera vez
}

export function save(cards) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, savedAt: Date.now(), cards }));
    return true;
  } catch { return false; }
}

export function getFlag(name) { try { return JSON.parse(localStorage.getItem(FLAGS) || "{}")[name]; } catch { return undefined; } }
export function setFlag(name, value) {
  try { const f = JSON.parse(localStorage.getItem(FLAGS) || "{}"); f[name] = value; localStorage.setItem(FLAGS, JSON.stringify(f)); } catch { /* sin almacenamiento */ }
}

export function bytesUsed() {
  try { return (localStorage.getItem(KEY) || "").length * 2; } catch { return 0; }
}

// Pide al navegador que no borre los datos en caso de poco espacio.
export async function requestPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); return true; }
  catch { return false; }
}

export function toBackup(cards) {
  return JSON.stringify({ app: "formalizador", schema: SCHEMA, exportedAt: new Date().toISOString(), cards }, null, 2);
}

// Devuelve las tarjetas válidas del fichero; lanza Error si no es una copia.
export function fromBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error("El fichero no es JSON válido."); }
  if (!d || d.app !== "formalizador" || !Array.isArray(d.cards)) throw new Error("El fichero no es una copia de Formalizador.");
  return d.cards.map(sanitize).filter(Boolean);
}

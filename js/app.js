// app.js — interfaz de Formalizador (lista + editor), PWA y barra de conectivas para iOS.
import * as L from "./logic.js";
import * as S from "./store.js";
import { createHost, PLUGINS } from "./plugins/registry.js";

export const APP_VERSION = "1.1.0";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const VF = (b) => (b ? "V" : "F");

const state = { cards: [], currentId: null, query: "", lastSym: null, undo: null };

/* ================= persistencia ================= */
let saveTimer = 0;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = () => { if (!S.save(state.cards)) toast("No se ha podido guardar: el almacenamiento está lleno o bloqueado."); };
  if (now) run(); else saveTimer = setTimeout(run, 250);
}
const current = () => state.cards.find((c) => c.id === state.currentId) || null;
const userCards = () => state.cards.filter((c) => !c.example);

/* ================= navegación ================= */
function route() {
  const m = location.hash.match(/^#\/c\/([\w-]+)$/);
  const card = m && state.cards.find((c) => c.id === m[1]);
  if (card) openEditor(card); else showList();
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

function showList() {
  state.currentId = null;
  document.body.classList.remove("editing");
  $("viewEdit").hidden = true; $("viewList").hidden = false;
  $("backBtn").hidden = true; $("addBar").hidden = false;
  if (shouldHint()) $("installBanner").hidden = false;
  $("title").textContent = "Formalizador";
  document.title = "Formalizador";
  hideKbar();
  renderList();
  host?.emit("close");
}

/* ================= lista ================= */
function renderList() {
  const q = state.query.trim().toLowerCase();
  const sorted = [...state.cards].sort((a, b) => b.updatedAt - a.updatedAt);
  const items = q ? sorted.filter((c) => (c.tag + " " + c.frase + " " + c.formula).toLowerCase().includes(q)) : sorted;
  $("empty").hidden = state.cards.length > 0;
  $("noResults").hidden = !(state.cards.length && !items.length);
  $("list").innerHTML = items.map((c) => {
    const s = L.summary(c.formula);
    return `<li><button class="row" type="button" data-id="${esc(c.id)}">
      <span class="row-tag">${esc(c.tag || "Sin nombre")}</span>
      <span class="pill ${s.tone}">${esc(s.label)}</span>
      ${c.frase ? `<span class="row-text">${esc(c.frase)}</span>` : ""}
      <span class="row-formula${c.formula ? "" : " empty-f"}">${c.formula ? esc(c.formula) : "Sin fórmula"}</span>
    </button></li>`;
  }).join("");
}

function createCard(kind) {
  const c = S.blankCard(kind, userCards().filter((x) => x.kind === kind).length + 1);
  state.cards.push(c); persist(true);
  go("#/c/" + c.id);
  requestAnimationFrame(() => $("fFrase").focus({ preventScroll: true }));
}

/* ================= editor ================= */
function openEditor(card) {
  state.currentId = card.id;
  document.body.classList.add("editing");
  $("viewList").hidden = true; $("viewEdit").hidden = false;
  $("backBtn").hidden = false; $("addBar").hidden = true; $("installBanner").hidden = true;
  $("title").textContent = card.tag || "Sin nombre";
  document.title = (card.tag || "Sin nombre") + " · Formalizador";
  for (const el of document.querySelectorAll("#viewEdit [data-f]")) el.value = card[el.dataset.f] || "";
  $("fFormula").placeholder = card.kind === "razonamiento" ? "P → Q, P ∴ Q" : "P ∧ Q → ¬R";
  window.scrollTo(0, 0);
  $("title").focus({ preventScroll: true });
  host?.emit("open", { card });
  analyzeNow();
}

let rafId = 0;
function scheduleAnalyze() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(analyzeNow); }

function tabsFor(res) {
  if (!res) return [];
  if (res.arg) return [["estr", "Estructura"], ["val", "Validez"], ["cla", "Cláusulas"]];
  return [["estr", "Estructura"], ["tabla", "Tabla"], ["fn", "Formas normales"], ["cmp", "Comparar"]];
}

function analyzeNow() {
  const c = current(); if (!c) return;
  const a = L.analyze(c.formula, c.atomos);
  queueMicrotask(() => host?.emit("analyze", { card: c, analysis: a }));
  $("warns").innerHTML = a.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("");
  $("cmpBox").hidden = true; $("tabs").innerHTML = ""; $("panel").innerHTML = "";

  if (a.error) {
    const p = Math.max(0, Math.min(a.error.pos ?? 0, c.formula.length));
    $("status").innerHTML = `<div class="status err"><span class="dot"></span><div>${esc(a.error.message)}<div class="caret-line">${esc(c.formula)}\n${" ".repeat(p)}^</div></div></div>`;
    return;
  }
  if (!a.res) {
    $("status").innerHTML = `<div class="status idle"><span class="dot"></span><div>Escribe la fórmula. Las conectivas están en la barra de encima del teclado.</div></div>`;
    return;
  }
  const res = a.res;
  $("status").innerHTML = res.arg
    ? `<div class="status ok"><span class="dot"></span><div>Razonamiento bien formado: ${res.premises.length} premisa(s)${res.conclusion ? " y conclusión." : ". Falta «∴ conclusión»."}</div></div>`
    : `<div class="status ok"><span class="dot"></span><div>Fórmula bien formada.</div></div>`;

  // La pestaña elegida se conserva aunque la fórmula pase un momento por otro tipo mientras se teclea.
  const T = tabsFor(res);
  const tab = T.some(([k]) => k === c.tab) ? c.tab : (res.arg ? "val" : "estr");
  const view = { ...c, tab };
  $("tabs").innerHTML = T.map(([k, n]) => `<button class="tab" type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("");
  $("panel").innerHTML = res.arg ? argPanel(view, res, a.atoms) : formulaPanel(view, res.f, a.atoms);
  if (!res.arg && tab === "cmp") { $("cmpBox").hidden = false; renderCompare(c, res.f); }
}

/* ---------- paneles de fórmula ---------- */
function treeHTML(n) {
  const li = (n) => {
    if (n.t === "atom") return `<li><span class="at">${n.n}</span></li>`;
    const kids = n.t === "not" ? [n.a] : [n.l, n.r];
    return `<li><span class="op">${n.t === "not" ? "¬" : L.SYM[n.t]}</span> <span class="sf">${esc(L.mini(n))}</span><ul>${kids.map(li).join("")}</ul></li>`;
  };
  return `<div class="tree"><ul>${li(n)}</ul></div>`;
}
const KIND = { tautologia: ["Tautología", "ok"], antinomia: ["Antinomia (contradicción)", "err"], contingente: ["Contingente", "mid"] };

function formulaPanel(c, f, atoms) {
  const tooMany = atoms.length > L.MAX_ATOMS;
  if (c.tab === "estr") {
    const k = tooMany ? null : KIND[L.classify(f, atoms).kind];
    return `<dl class="out">
      <dt>Conectiva principal</dt><dd>${L.NAME[f.t]}</dd>
      <dt>Paréntesis mínimos</dt><dd>${esc(L.mini(f))}</dd>
      <dt>Todos los paréntesis</dt><dd>${esc(L.full(f))}</dd>
      <dt>Átomos</dt><dd>${atoms.join(", ")}</dd>
      <dt>Conectivas</dt><dd>${L.countConn(f)} · profundidad ${L.depth(f)}</dd>
      ${k ? `<dt>Tipo</dt><dd><span class="pill ${k[1]}">${k[0]}</span></dd>` : ""}
    </dl>${treeHTML(f)}`;
  }
  if (c.tab === "tabla") {
    if (tooMany) return `<p class="note">Más de ${L.MAX_ATOMS} átomos: demasiadas filas.</p>`;
    const cl = L.classify(f, atoms), k = KIND[cl.kind];
    let h = `<p class="verdict ${k[1]}"><strong>${k[0]}.</strong> Verdadera en ${cl.trueRows} de ${cl.total} filas.</p>`;
    if (atoms.length <= 6) {
      const S2 = L.subs(f), R = L.rows(atoms);
      const head = `<tr>${atoms.map((x) => `<th scope="col">${x}</th>`).join("")}${S2.map((s, i) => `<th scope="col" class="${i === 0 ? "sep " : ""}${s === f ? "res" : ""}">${esc(L.mini(s))}</th>`).join("")}</tr>`;
      const body = R.map((e) => `<tr>${atoms.map((x) => `<td class="${VF(e[x])}">${VF(e[x])}</td>`).join("")}${S2.map((s, i) => { const v = L.ev(s, e); return `<td class="${VF(v)}${i === 0 ? " sep" : ""}${s === f ? " res" : ""}">${VF(v)}</td>`; }).join("")}</tr>`).join("");
      h += `<div class="tt-wrap"><table class="tt"><thead>${head}</thead><tbody>${body}</tbody></table></div><p class="note">Una columna por subfórmula, de dentro hacia fuera; la última es la fórmula completa. Desliza la tabla en horizontal si no cabe.</p>`;
    } else h += `<p class="note">Con ${atoms.length} átomos hay ${cl.total} filas; la tabla se dibuja con 6 átomos o menos.</p>`;
    return h;
  }
  if (c.tab === "fn") {
    let nf;
    try { nf = L.normalForms(f); } catch { return `<p class="note">La forma normal tiene más de ${L.CLAUSE_LIMIT} cláusulas y no se muestra.</p>`; }
    return `<ol class="steps">
        <li><span class="sn">Paso 1</span><span class="sf2">${esc(L.mini(nf.step1))}</span></li>
        <li><span class="sn">Paso 2</span><span class="sf2">${esc(L.mini(nf.step2))}</span></li>
      </ol>
      <p class="note">Paso 1: eliminar → con A → B ≡ ¬A ∨ B. Paso 2: interiorizar ¬ con De Morgan y doble negación.</p>
      <dl class="out">
        <dt>FNC</dt><dd>${nf.cnf.length ? esc(L.showCNF(nf.cnf)) : '<span class="pill ok">Tautología: no queda ninguna cláusula</span>'}</dd>
        <dt>FND</dt><dd>${nf.dnf.length ? esc(L.showDNF(nf.dnf)) : '<span class="pill err">Antinomia: no queda ningún término</span>'}</dd>
      </dl>
      ${nf.cnf.length ? `<div class="lbl">Cláusulas</div><div class="clauses">${nf.cnf.map((x) => `<span class="cl">${esc(x.join(" ∨ "))}</span>`).join("")}</div>` : ""}
      <p class="note">Simplificadas: sin literales repetidos, sin cláusulas con P y ¬P, y con absorción.</p>`;
  }
  return `<p class="note">Escribe abajo otra fórmula para saber si es equivalente a la tuya. Por ejemplo, ¬A → ¬B y B → A lo son.</p>`;
}

function renderCompare(c, f) {
  const out = $("cmpOut"), src = (c.compare || "").trim();
  if (!src) { out.innerHTML = ""; return; }
  let g;
  try {
    const r = L.parseAll(src);
    if (!r) { out.innerHTML = ""; return; }
    if (r.arg) { out.innerHTML = `<p class="verdict err">Compara solo fórmulas sueltas, sin comas ni ∴.</p>`; return; }
    g = r.f;
  } catch (e) { out.innerHTML = `<p class="verdict err">La otra fórmula tiene un error: ${esc(e.message)}</p>`; return; }
  const r = L.equivalent(f, g);
  if (r.tooMany) out.innerHTML = `<p class="note">Demasiados átomos para comparar.</p>`;
  else if (r.equal) out.innerHTML = `<p class="verdict ok">${r.same ? "Es la misma fórmula." : "Equivalentes: tienen el mismo valor en todas las filas, aunque se escriben distinto."}</p>`;
  else out.innerHTML = `<p class="verdict err">No son equivalentes. Con ${r.atoms.map((x) => `${x}=${VF(r.row[x])}`).join(", ")} la tuya da ${VF(r.fv)} y la otra da ${VF(r.gv)}.</p>`;
}

/* ---------- paneles de razonamiento ---------- */
function argPanel(c, res, atoms) {
  const P = res.premises, K = res.conclusion;
  if (c.tab === "estr") {
    let h = `<dl class="out">${P.map((f, i) => `<dt>Premisa ${i + 1}</dt><dd>${esc(L.mini(f))}</dd>`).join("")}${K ? `<dt>Conclusión</dt><dd>∴ ${esc(L.mini(K))}</dd>` : ""}<dt>Átomos</dt><dd>${atoms.join(", ")}</dd></dl>`;
    h += `<p class="note">Formato del módulo: ${esc(P.map(L.mini).join(", ") + (K ? " ∴ " + L.mini(K) : ""))}</p>`;
    [...P, ...(K ? [K] : [])].forEach((f, i) => { h += `<div class="lbl">${i < P.length ? "Premisa " + (i + 1) : "Conclusión"} · ${L.NAME[f.t]}</div>${treeHTML(f)}`; });
    return h;
  }
  if (c.tab === "val") {
    const v = L.validity(P, K);
    if (v.tooMany) return `<p class="note">Más de ${L.MAX_ATOMS} átomos: demasiadas filas.</p>`;
    let h;
    if (v.status === "inconsistentes") h = `<p class="verdict warn"><strong>Premisas inconsistentes.</strong> Nunca son verdaderas a la vez, así que de ellas se deduce cualquier conclusión (apartado 3.6).</p>`;
    else if (v.status === "consistentes") h = `<p class="verdict mid">Premisas consistentes: verdaderas a la vez en ${v.crit.length} fila(s). Añade «∴ conclusión» para comprobar la validez.</p>`;
    else if (v.status === "valido") h = `<p class="verdict ok"><strong>Razonamiento válido.</strong> En las ${v.crit.length} filas donde todas las premisas son V, la conclusión también es V.</p>`;
    else { const e = v.rows[v.bad[0]]; h = `<p class="verdict err"><strong>Razonamiento no válido.</strong> Contraejemplo: ${v.atoms.map((x) => `${x}=${VF(e[x])}`).join(", ")}. Las premisas son V y la conclusión es F. Hay ${v.bad.length} contraejemplo(s).</p>`; }
    if (v.atoms.length <= 6) {
      const cols = [...P, ...(K ? [K] : [])], last = cols.length - 1;
      const head = `<tr>${v.atoms.map((x) => `<th scope="col">${x}</th>`).join("")}${cols.map((f, i) => `<th scope="col" class="${i === 0 ? "sep " : ""}${K && i === last ? "res" : ""}">${K && i === last ? "∴ " : ""}${esc(L.mini(f))}</th>`).join("")}</tr>`;
      const body = v.rows.map((e, ri) => {
        const cls = v.bad.includes(ri) ? "bad" : v.crit.includes(ri) ? "crit" : "";
        return `<tr class="${cls}">${v.atoms.map((x) => `<td class="${VF(e[x])}">${VF(e[x])}</td>`).join("")}${cols.map((f, i) => { const val = L.ev(f, e); return `<td class="${VF(val)}${i === 0 ? " sep" : ""}${K && i === last ? " res" : ""}">${VF(val)}</td>`; }).join("")}</tr>`;
      }).join("");
      h += `<div class="tt-wrap"><table class="tt"><thead>${head}</thead><tbody>${body}</tbody></table></div><p class="note">Azul: filas con todas las premisas V. Rojo: contraejemplos.</p>`;
    } else h += `<p class="note">La tabla se dibuja con 6 átomos o menos.</p>`;
    return h;
  }
  let items;
  try { items = L.resolutionSet(P, K); } catch { return `<p class="note">Las formas normales tienen más de ${L.CLAUSE_LIMIT} cláusulas y no se muestran.</p>`; }
  return `<p class="note">Conjunto de cláusulas para resolución: la FNC de cada premisa${K ? " y la de la conclusión negada (reducción al absurdo). Las marcadas ¬C forman el conjunto de apoyo." : ". Falta la conclusión."}</p>
    ${items.length ? `<div class="clauses">${items.map((it) => `<span class="cl">${esc(it.c.join(" ∨ "))}<small>${it.from}</small></span>`).join("")}</div>` : `<p class="note">No queda ninguna cláusula: todo son tautologías.</p>`}`;
}

/* ================= edición ================= */
function onFieldInput(e) {
  const el = e.target, f = el.dataset.f, c = current();
  if (!f || !c) return;
  if (el.classList.contains("sym-input")) {
    const pos = el.selectionStart ?? el.value.length;
    const n = L.normalizeAt(el.value, pos);
    if (n.value !== el.value) { el.value = n.value; try { el.setSelectionRange(n.caret, n.caret); } catch { /* */ } }
  }
  c[f] = el.value; c.updatedAt = Date.now();
  if (f === "tag") { $("title").textContent = c.tag || "Sin nombre"; document.title = (c.tag || "Sin nombre") + " · Formalizador"; }
  if (c.example && f !== "tab") c.example = false; // al editar un ejemplo pasa a ser tuyo
  persist();
  if (f !== "tag" && f !== "frase") scheduleAnalyze();
}

function deleteCurrent() {
  const c = current(); if (!c) return;
  const idx = state.cards.indexOf(c);
  state.cards.splice(idx, 1); persist(true);
  state.undo = { card: c, idx };
  go("#/");
  toast(`«${c.tag || "Sin nombre"}» borrada.`, "Deshacer", () => {
    if (!state.undo) return;
    state.cards.splice(Math.min(state.undo.idx, state.cards.length), 0, state.undo.card);
    state.undo = null; persist(true); renderList();
  }, 6000);
}

function duplicateCurrent() {
  const c = current(); if (!c) return;
  const d = { ...c, id: S.uid(), tag: (c.tag || "Sin nombre") + " (copia)", example: false, createdAt: Date.now(), updatedAt: Date.now() };
  state.cards.push(d); persist(true);
  go("#/c/" + d.id);
  toast("Duplicada.");
}

const cardText = (c) => `${c.tag ? "[" + c.tag + "]\n" : ""}${c.frase ? "Frase: " + c.frase + "\n" : ""}${c.atomos ? "Átomos:\n" + c.atomos.trim() + "\n" : ""}Fórmula: ${c.formula || ""}`;

async function copyText(text, okMsg = "Copiado.") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch { /* sigue */ }
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  toast("No se ha podido copiar.");
}

/* ================= barra de conectivas (iOS) ================= */
const KEYS = ["¬", "∧", "∨", "→", "(", ")", ",", "∴", "P", "Q", "R", "S"];
let symTarget = null;

function buildKbar() {
  $("kbarKeys").innerHTML = KEYS.map((k) => `<button type="button" data-k="${k}" aria-label="${k}">${k}</button>`).join("") +
    `<button type="button" class="del" data-k="⌫" aria-label="Borrar">⌫</button>`;
  const bar = $("kbar");
  // Evita que el input pierda el foco (y que el teclado se cierre) al pulsar.
  for (const t of ["pointerdown", "mousedown"]) bar.addEventListener(t, (e) => { if (e.target.closest("button")) e.preventDefault(); }, { passive: false });
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "kbarDone") { symTarget?.blur(); hideKbar(); return; }
    const t = symTarget; if (!t) return;
    t.focus({ preventScroll: true });
    const s = t.selectionStart ?? t.value.length, en = t.selectionEnd ?? s;
    if (b.dataset.k === "⌫") {
      if (s !== en) t.setRangeText("", s, en, "end");
      else if (s > 0) t.setRangeText("", s - 1, s, "end");
    } else t.setRangeText(b.dataset.k, s, en, "end");
    t.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.classList?.contains("sym-input")) { symTarget = e.target; showKbar(); }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target === symTarget) setTimeout(() => { if (!document.activeElement?.classList?.contains("sym-input")) hideKbar(); }, 120);
  });
  if (window.visualViewport) {
    const place = () => {
      if (bar.hidden) return;
      const vv = window.visualViewport;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      bar.style.transform = offset ? `translateY(${-offset}px)` : "";
      bar.classList.toggle("raised", offset > 0);
    };
    visualViewport.addEventListener("resize", place);
    visualViewport.addEventListener("scroll", place);
    bar._place = place;
  }
}
function showKbar() { const b = $("kbar"); b.hidden = false; b._place?.(); document.body.classList.add("kbd"); }
function hideKbar() { const b = $("kbar"); b.hidden = true; b.style.transform = ""; document.body.classList.remove("kbd"); }

/* ================= toast ================= */
let toastTimer = 0;
function toast(msg, actionLabel, action, ms = 2600) {
  clearTimeout(toastTimer);
  $("toastMsg").textContent = msg;
  const btn = $("toastAction");
  btn.hidden = !actionLabel; btn.textContent = actionLabel || "";
  btn.onclick = action ? () => { action(); $("toast").hidden = true; } : null;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; if (actionLabel) state.undo = null; }, ms);
}

/* ================= menú, ayuda, copia de seguridad ================= */
function openInfo(title, html) { $("infoTitle").textContent = title; $("infoBody").innerHTML = html; $("info").showModal(); }

const HELP = `
  <p><strong>Teclas.</strong> Usa la barra que aparece encima del teclado, o estos atajos (también con teclado físico):</p>
  <table>
    <tr><td>¬</td><td><kbd>!</kbd> <kbd>~</kbd> <kbd>-</kbd></td></tr>
    <tr><td>∧</td><td><kbd>&amp;</kbd> <kbd>*</kbd></td></tr>
    <tr><td>∨</td><td><kbd>|</kbd> <kbd>+</kbd> <kbd>v</kbd> (minúscula)</td></tr>
    <tr><td>→</td><td><kbd>&gt;</kbd> <kbd>-&gt;</kbd></td></tr>
    <tr><td>∴</td><td><kbd>:</kbd></td></tr>
  </table>
  <p>Las minúsculas se pasan a mayúsculas, salvo <code>v</code>. Para el átomo V escribe la mayúscula.</p>
  <p><strong>Prioridad.</strong> <code>¬</code> &gt; <code>∧</code> = <code>∨</code> &gt; <code>→</code>. Con la misma prioridad se agrupa de izquierda a derecha: <code>P → Q → R</code> es <code>(P → Q) → R</code>.</p>
  <p><strong>Disyunción.</strong> <code>∨</code> no es exclusiva. La exclusiva se escribe <code>(A ∨ B) ∧ ¬(A ∧ B)</code>. El bicondicional se escribe <code>(A → B) ∧ (B → A)</code>.</p>
  <p><strong>Razonamientos.</strong> Premisas separadas por comas y <code>∴</code> antes de la conclusión: <code>P → Q, P ∴ Q</code>.</p>
  <p><strong>Validez.</strong> Un razonamiento es válido si en ninguna fila de la tabla las premisas son todas V y la conclusión F.</p>
  <p><strong>Condiciones.</strong> «A es suficiente para B»: <code>A → B</code>. «A es necesario para B»: <code>B → A</code> o <code>¬A → ¬B</code>.</p>`;

async function exportBackup() {
  const json = S.toBackup(state.cards);
  const name = `formalizador-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Copia de Formalizador" }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Copia exportada.");
}

async function importBackup(file) {
  try {
    const incoming = S.fromBackup(await file.text());
    const ids = new Set(state.cards.map((c) => c.id));
    let added = 0;
    for (const c of incoming) { if (ids.has(c.id)) c.id = S.uid(); state.cards.push(c); added++; }
    persist(true); renderList();
    toast(`${added} tarjeta(s) importada(s).`);
  } catch (e) { toast(e.message || "No se ha podido importar."); }
}

function about() {
  const kb = (S.bytesUsed() / 1024).toFixed(1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  openInfo("Datos y versión", `
    <p><strong>Versión:</strong> ${APP_VERSION}</p>
    <p><strong>Tarjetas:</strong> ${state.cards.length} · <strong>Espacio usado:</strong> ${kb} KB (el límite habitual es 5 MB)</p>
    <p><strong>Modo:</strong> ${standalone ? "app instalada" : "navegador"} · <strong>Sin conexión:</strong> ${"serviceWorker" in navigator ? "disponible" : "no disponible en este navegador"}</p>
    <p>Todo se guarda solo en este dispositivo. No hay cuentas, servidores ni analítica. En iOS, la app instalada y Safari tienen almacenamientos separados; exporta una copia de seguridad de vez en cuando.</p>`);
}

function addExamples() {
  state.cards.push(...S.exampleCards()); persist(true); renderList(); toast("Ejemplos añadidos.");
}

/* ================= PWA ================= */
function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const ask = (w) => toast("Hay una versión nueva.", "Actualizar", () => w.postMessage("skipWaiting"), 15000);
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) ask(w); });
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => { /* sin SW: la app sigue funcionando online */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

function shouldHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone && !S.getFlag("installHintDone");
}
function installHint() {
  $("installClose").addEventListener("click", () => { $("installBanner").hidden = true; S.setFlag("installHintDone", true); });
}

/* ================= arranque ================= */
function bind() {
  window.addEventListener("hashchange", route);
  $("backBtn").addEventListener("click", () => go("#/"));
  $("list").addEventListener("click", (e) => { const b = e.target.closest(".row"); if (b) go("#/c/" + b.dataset.id); });
  $("search").addEventListener("input", (e) => { state.query = e.target.value; renderList(); });
  $("addFrase").addEventListener("click", () => createCard("frase"));
  $("addArg").addEventListener("click", () => createCard("razonamiento"));
  $("loadExamples").addEventListener("click", addExamples);
  $("viewEdit").addEventListener("input", onFieldInput);
  for (const id of ["fFormula", "fCompare", "fTag"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); const c = current(); if (!b || !c) return;
    c.tab = b.dataset.tab; persist(); analyzeNow();
  });
  $("tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...$("tabs").querySelectorAll(".tab")], i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.click(); $("tabs").querySelector(`[data-tab="${n.dataset.tab}"]`)?.focus();
  });
  $("delBtn").addEventListener("click", deleteCurrent);
  $("dupBtn").addEventListener("click", duplicateCurrent);
  $("copyBtn").addEventListener("click", () => { const c = current(); if (c) copyText(cardText(c)); });

  $("menuBtn").addEventListener("click", () => $("menu").showModal());
  for (const d of [$("menu"), $("info")]) {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.dataset.act === "close") d.close(); });
  }
  $("menu").addEventListener("click", (e) => {
    const act = e.target.dataset?.act; if (!act || act === "close") return;
    if (act === "import") { $("importFile").click(); return; }
    $("menu").close();
    if (act === "help") openInfo("Ayuda y convenciones", HELP);
    if (act === "copyAll") copyText(userCards().map(cardText).join("\n\n") || "(sin tarjetas)", "Todo copiado.");
    if (act === "export") exportBackup();
    if (act === "examples") addExamples();
    if (act === "about") about();
    if (act === "plugins") pluginsDialog();
    if (act.startsWith("plugin:")) host.menuItems().find((m) => "plugin:" + m.id === act)?.fn();
  });
  $("importFile").addEventListener("change", (e) => { const f = e.target.files?.[0]; $("menu").close(); if (f) importBackup(f); e.target.value = ""; });
}

/* ================= plugins ================= */
let host = null;
function renderPluginMenu(items) {
  const list = document.querySelector("#menu .sheet-list");
  list.querySelectorAll("[data-plugin-item]").forEach((b) => b.remove());
  const about = list.querySelector('[data-act="about"]');
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.act = "plugin:" + it.id; b.dataset.pluginItem = "1"; b.textContent = it.label;
    list.insertBefore(b, about);
  }
}
function pluginsDialog() {
  openInfo("Plugins", PLUGINS.map((p) => `<label class="plug"><input type="checkbox" data-plugin="${esc(p.id)}" ${host.isEnabled(p.id) ? "checked" : ""}> <span><strong>${esc(p.name)}</strong><br>${esc(p.desc)}</span></label>`).join("") +
    `<p class="note">Los cambios se aplican al volver a abrir la app.</p>`);
  $("infoBody").querySelectorAll("[data-plugin]").forEach((i) => i.addEventListener("change", () => {
    host.setEnabled(i.dataset.plugin, i.checked);
    toast(i.checked ? "Plugin activado. Recargando…" : "Plugin desactivado. Recargando…");
    setTimeout(() => location.reload(), 900);
  }));
}

function init() {
  const loaded = S.load();
  if (loaded === null) { state.cards = S.exampleCards(); S.save(state.cards); }
  else state.cards = loaded;
  S.requestPersist();
  host = createHost({ getCard: current, logic: L, toast, openInfo, escapeHTML: esc, onMenuChange: renderPluginMenu });
  buildKbar(); bind(); installHint(); route(); registerSW();
  // Los plugins cargan después del primer pintado: nunca retrasan la app.
  const boot = () => host.loadAll().then(() => { const c = current(); if (c) { host.emit("open", { card: c }); analyzeNow(); } });
  (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(boot);
}

init();

// farad8.js — plugin FARAD-8: tutor retro que acompaña, guía y comprueba la comprensión.
// Sin conexión usa el cerebro local (brain.js). Con un endpoint configurado y señal,
// consulta un modelo online; si falla, vuelve solo al modo cartucho y reintenta más tarde.
import * as B from "./brain.js";
import { drawSprite, drawPet } from "./sprite.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
const DEFAULTS = { proactive: true, sound: false, fx: true, pet: true, tutor: false, endpoint: "", greeted: false, progress: {} };

export default function setup(host) {
  const store = host.storage("farad8");
  const cfg = { ...DEFAULTS, ...store.get() };
  const save = () => store.set(cfg);
  const esc = host.escapeHTML;

  /* ---------- estado ---------- */
  const st = {
    card: null, analysis: null, lastAnalyzeAt: 0, hintLevel: {}, shown: {}, lastBubbleAt: 0,
    degradedUntil: 0, history: [], quiz: null, face: "idle", typing: false, quizOffered: {},
  };
  const online = () => !!cfg.endpoint && navigator.onLine && Date.now() > st.degradedUntil;
  const prog = (id) => (cfg.progress[id] ||= { ok: 0, n: 0, done: false });

  /* ---------- DOM ---------- */
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = new URL("./farad8.css", import.meta.url).href;
  document.head.append(css);

  const root = document.createElement("div");
  root.className = "f8";
  root.innerHTML = `
    <button class="f8-fab" type="button" aria-label="Abrir a FARAD-8, tu tutor" aria-haspopup="dialog">
      <canvas width="16" height="16" class="f8-sprite" aria-hidden="true"></canvas>
      <span class="f8-led" aria-hidden="true"></span>
    </button>
    <button class="f8-pet" type="button" aria-label="Ohm, el gato de FARAD-8">
      <canvas width="12" height="11" class="f8-pet-sprite" aria-hidden="true"></canvas>
    </button>
    <div class="f8-bubble" role="status" aria-live="polite" hidden>
      <button class="f8-bubble-text" type="button"></button>
      <button class="f8-bubble-x" type="button" aria-label="Cerrar aviso">×</button>
    </div>
    <dialog class="f8-sheet" aria-label="FARAD-8">
      <div class="f8-shell">
        <div class="f8-screen">
          <div class="f8-head">
            <canvas width="16" height="16" class="f8-sprite big" aria-hidden="true"></canvas>
            <canvas width="12" height="11" class="f8-pet-sprite mini" aria-hidden="true"></canvas>
            <div class="f8-id">
              <strong>FARAD-8</strong>
              <span class="f8-mode"></span>
              <span class="f8-meter" aria-label="Comprensión"></span>
            </div>
          </div>
          <div class="f8-log" aria-live="polite"></div>
          <div class="f8-quiz" hidden></div>
        </div>
        <div class="f8-pad" role="group" aria-label="Acciones">
          <button type="button" data-a="hint">PISTA</button>
          <button type="button" data-a="read">LEER</button>
          <button type="button" data-a="quiz">QUIZ</button>
          <button type="button" data-a="why">¿POR QUÉ?</button>
        </div>
        <form class="f8-ask" autocomplete="off">
          <label class="f8-vh" for="f8q">Pregunta a FARAD-8</label>
          <input id="f8q" type="text" maxlength="400" placeholder="Pregunta… (p. ej.: ¿qué es una condición necesaria?)" enterkeyhint="send">
          <button type="submit" aria-label="Enviar">▶</button>
        </form>
        <div class="f8-foot">
          <button type="button" data-a="settings">AJUSTES</button>
          <button type="button" data-a="close">CERRAR</button>
        </div>
      </div>
    </dialog>
    <dialog class="f8-settings" aria-label="Ajustes de FARAD-8">
      <div class="f8-shell">
        <h2>AJUSTES</h2>
        <label class="f8-row"><input type="checkbox" data-k="proactive"> Avisos proactivos mientras escribes</label>
        <label class="f8-row"><input type="checkbox" data-k="fx"> Efectos retro (parpadeos y píxeles sueltos)</label>
        <label class="f8-row"><input type="checkbox" data-k="sound"> Sonido 8 bits</label>
        <label class="f8-row"><input type="checkbox" data-k="pet"> Ohm, el gato de FARAD-8</label>
        <label class="f8-row"><input type="checkbox" data-k="tutor"> Modo tutor: solo pistas, sin soluciones (para practicar)</label>
        <label class="f8-field" for="f8ep">Cerebro online (opcional): URL de tu endpoint</label>
        <input id="f8ep" type="url" inputmode="url" placeholder="https://farad8.tu-usuario.workers.dev" autocapitalize="off" autocorrect="off" spellcheck="false">
        <p class="f8-small">Con un endpoint, la frase, los átomos y la fórmula de la tarjeta abierta se envían a ese servidor. Sin endpoint o sin señal, FARAD-8 funciona en modo cartucho, todo en el dispositivo.</p>
        <div class="f8-foot">
          <button type="button" data-a="test">PROBAR</button>
          <button type="button" data-a="saveSettings">GUARDAR</button>
          <button type="button" data-a="closeSettings">CERRAR</button>
        </div>
        <p class="f8-small f8-test" aria-live="polite"></p>
      </div>
    </dialog>`;
  document.body.append(root);

  const $ = (s) => root.querySelector(s);
  const fab = $(".f8-fab"), sheet = $(".f8-sheet"), settings = $(".f8-settings"), bubble = $(".f8-bubble");
  const sprites = [...root.querySelectorAll(".f8-sprite")];
  const log = $(".f8-log"), quizBox = $(".f8-quiz");

  /* ---------- sprite, LED y efectos ---------- */
  const paint = (face = st.face, opts) => { st.face = face; sprites.forEach((c) => drawSprite(c, face, opts)); };
  const setFace = (face, ms) => { paint(face); if (ms) setTimeout(() => paint(online() || !cfg.endpoint ? "idle" : "offline"), ms); };
  function refreshMode() {
    const on = online();
    root.classList.toggle("is-online", on);
    $(".f8-mode").textContent = (on ? "⚡ ONLINE" : cfg.endpoint ? "▣ CARTUCHO (sin señal)" : "▣ CARTUCHO") + (cfg.tutor ? " · TUTOR" : on ? " · AYUDANTE" : "");
    if (!st.typing) paint(on || !cfg.endpoint ? "idle" : "offline");
  }
  function refreshMeter() {
    const p = st.card ? prog(st.card.id) : null;
    $(".f8-meter").textContent = !p ? "" : p.done ? "★ COMPRENDIDO" : `COMPRENSIÓN ${"█".repeat(Math.min(p.ok, 3))}${"░".repeat(3 - Math.min(p.ok, 3))}`;
  }

  // Parpadeo natural y "fallos" de carácter cada cierto tiempo.
  setInterval(() => { if (!st.typing && st.face === "idle") { paint("blink"); setTimeout(() => st.face === "blink" && paint("idle"), 140); } }, 4200);
  (function glitchLoop() {
    setTimeout(() => {
      if (cfg.fx && !REDUCED.matches && document.visibilityState === "visible") {
        root.classList.add("f8-glitch");
        paint(st.face, { pixelate: Math.random() < 0.6, shift: Math.random() < 0.5 ? 1 : -1 });
        setTimeout(() => { root.classList.remove("f8-glitch"); paint(st.face); }, 380);
        if (sheet.open && Math.random() < 0.15) say(B.pick(B.LINES.glitch), "glitch");
      }
      glitchLoop();
    }, 14000 + Math.random() * 22000);
  })();

  /* ---------- sonido (WebAudio, solo tras un toque del usuario) ---------- */
  let ac = null;
  function blip(freq = 880, ms = 18) {
    if (!cfg.sound) return;
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square"; o.frequency.value = freq; g.gain.value = 0.035;
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000);
    } catch { /* sin audio */ }
  }

  /* ---------- Ohm, el gato: mueve la cola, parpadea, se duerme y se alegra contigo ---------- */
  const pet = (() => {
    const btn = $(".f8-pet"), canvases = [...root.querySelectorAll(".f8-pet-sprite")];
    let state = "idle", frame = 0, lastActive = Date.now(), moodTimer = 0;
    const draw = () => canvases.forEach((c) => drawPet(c, state, frame));
    const set = (s, ms) => {
      state = s; root.classList.toggle("f8-pet-sleep", s === "sleep"); draw();
      clearTimeout(moodTimer); if (ms) moodTimer = setTimeout(() => set("idle"), ms);
    };
    const hop = () => { btn.classList.remove("f8-pet-hop"); void btn.offsetWidth; btn.classList.add("f8-pet-hop"); };
    const show = () => { btn.hidden = !cfg.pet; canvases[1].hidden = !cfg.pet; };
    setInterval(() => {
      if (document.visibilityState !== "visible" || REDUCED.matches) return;
      if (state !== "sleep" && Date.now() - lastActive > 60000) set("sleep");
      if (state === "idle") { frame ^= 1; if (Math.random() < 0.12) { state = "blink"; draw(); setTimeout(() => state === "blink" && set("idle"), 160); return; } draw(); }
    }, 700);
    btn.addEventListener("click", () => {
      lastActive = Date.now(); set("happy", 1400); hop();
      blip(1046, 40); setTimeout(() => blip(1318, 60), 70);
      bubbleSay(B.pick(B.LINES.pet), { force: true });
    });
    show(); draw();
    return {
      show,
      wake() { lastActive = Date.now(); if (state === "sleep") set("idle"); },
      cheer() { lastActive = Date.now(); set("happy", 2200); hop(); },
    };
  })();

  /* ---------- de vez en cuando, FARAD-8 le lanza una chispa a Ohm ---------- */
  function zap() {
    const a = fab.getBoundingClientRect(), b = $(".f8-pet").getBoundingClientRect();
    if (!a.width || !b.width) return;
    const z = document.createElement("div"); z.className = "f8-zap"; root.append(z);
    const x0 = a.left + a.width / 2, y0 = a.top + 10, x1 = b.left + b.width / 2, y1 = b.top + 8;
    paint("happy");
    z.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 46}px) scale(1.5)`, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0.3 },
    ], { duration: 700, easing: "cubic-bezier(.3, .6, .4, 1)" }).finished
      .then(() => { z.remove(); pet.cheer(); blip(1568, 30); paint("idle"); }, () => z.remove());
  }
  (function zapLoop() {
    setTimeout(() => {
      if (cfg.fx && cfg.pet && !REDUCED.matches && document.visibilityState === "visible" && !sheet.open && bubble.hidden && !document.body.classList.contains("kbd")) zap();
      zapLoop();
    }, 70000 + Math.random() * 80000);
  })();

  /* ---------- registro de diálogo con efecto máquina de escribir ---------- */
  const queue = [];
  function say(text, kind = "f8") { queue.push({ text, kind }); if (!st.typing) pump(); }
  function then(fn) { queue.push({ fn }); if (!st.typing) pump(); } // se ejecuta cuando termina de hablar
  function you(text) { const p = document.createElement("p"); p.className = "f8-you"; p.textContent = "> " + text; log.append(p); trim(); log.scrollTop = log.scrollHeight; }
  function trim() { while (log.children.length > 40) log.firstChild.remove(); }
  function pump() {
    const m = queue.shift(); if (!m) { st.typing = false; refreshMode(); return; }
    st.typing = true;
    if (m.fn) { try { m.fn(); } catch (e) { console.error("[farad8]", e); } return pump(); }
    const p = document.createElement("p"); p.className = "f8-msg " + m.kind; log.append(p); trim();
    if (REDUCED.matches || !sheet.open) { p.textContent = m.text; log.scrollTop = log.scrollHeight; pump(); return; }
    let i = 0; paint("talk");
    const tick = () => {
      i = Math.min(m.text.length, i + 2);
      p.textContent = m.text.slice(0, i) + (i < m.text.length ? "▌" : "");
      if (i % 6 === 0) { paint(st.face === "talk" ? "idle" : "talk"); blip(660 + (i % 5) * 60); }
      log.scrollTop = log.scrollHeight;
      if (i < m.text.length) setTimeout(tick, 14); else { paint("idle"); setTimeout(pump, 120); }
    };
    tick();
  }

  /* ---------- burbuja proactiva ---------- */
  let bubbleTimer = 0, pending = null, pendingTimer = 0;
  function bubbleSay(text, { force = false } = {}) {
    if (!force && (!cfg.proactive || sheet.open)) return;
    const wait = 9000 - (Date.now() - st.lastBubbleAt);
    if (!force && wait > 0) { // no atropella al aviso anterior: espera su turno
      pending = text; clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => { const t = pending; pending = null; if (t) bubbleSay(t); }, wait + 50);
      return;
    }
    st.lastBubbleAt = Date.now();
    $(".f8-bubble-text").textContent = text;
    bubble.hidden = false; root.classList.add("f8-alert");
    setFace("think", 900); blip(990, 30);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, 12000);
  }
  function hideBubble() { bubble.hidden = true; root.classList.remove("f8-alert"); }

  /* ---------- acciones ---------- */
  const ctxReady = () => st.card && st.analysis;
  function doHint() {
    if (!st.card) return say("Abre una tarjeta y te acompaño. Desde la lista solo veo títulos.");
    const lvl = (st.hintLevel[st.card.id] = Math.min(2, (st.hintLevel[st.card.id] || 0) + 1));
    say(`PISTA ${lvl}/2 ▸ ` + B.hint(st.card, st.analysis, lvl));
    if (lvl === 2) say(cfg.tutor ? "Más allá no voy: estás en modo tutor y la formalización la escribes tú."
      : online() ? "¿Quieres la solución completa? Pídemela abajo y te la doy verificada con el motor."
      : "La solución completa necesita el cerebro online; en modo cartucho llego hasta aquí.", "aside");
  }
  function doRead() {
    if (!ctxReady() || !st.analysis.res) return say("Todavía no hay fórmula que leer. Escribe una y pulsa LEER.");
    const a = st.analysis;
    if (a.res.arg) {
      a.res.premises.forEach((p, i) => say(`P${i + 1}: ${B.readAloud(p, a.atomsMap)}.`));
      if (a.res.conclusion) say(`∴ Por tanto: ${B.readAloud(a.res.conclusion, a.atomsMap)}.`);
    } else say(`Tu fórmula dice: ${B.readAloud(a.res.f, a.atomsMap)}.`);
    say("¿Dice lo mismo que tu frase? Compáralas palabra por palabra.", "aside");
  }
  function doWhy() {
    if (!ctxReady()) return say("Abre una tarjeta primero.");
    const a = st.analysis;
    if (a.error) return say(B.explainError(a.error));
    if (!a.res) return say(B.hint(st.card, a, 1));
    if (a.res.arg && a.res.conclusion) {
      const v = host.logic.validity(a.res.premises, a.res.conclusion);
      if (v.status === "no-valido") return say(B.explainCounterexample(v, a.atomsMap));
      if (v.status === "valido") return say("Es válido: he probado todas las filas y en ninguna se cumplen las premisas sin que se cumpla la conclusión. Para la PEC tendrás que demostrarlo además por deducción natural.");
      return say("Las premisas se contradicen entre sí: nunca son V a la vez. De algo imposible se deduce cualquier cosa (apartado 3.6).");
    }
    const d = B.diagnose(st.card, a);
    say(d.length ? d[0].text : `Conectiva principal: ${host.logic.NAME[a.res.f.t].toLowerCase()}. Es la última que se aplica en ${host.logic.mini(a.res.f)}.`);
  }

  /* ---------- quiz de comprensión ---------- */
  function startQuiz() {
    if (!ctxReady() || !st.analysis.res) return say("Para el QUIZ necesito una fórmula bien formada.");
    const qs = B.makeQuiz(st.analysis);
    if (!qs.length) return say("Esta fórmula es demasiado grande para un quiz rápido.");
    st.quiz = { qs, i: 0, ok: 0 };
    say(B.pick(["INSERT COIN ▸ 3 preguntas. Sin prisa.", "QUIZ.EXE cargado. Responde con calma.", "PERFORM QUIZ VARYING I FROM 1 BY 1 UNTIL I > 3."]));
    renderQuestion();
  }
  function renderQuestion() {
    const z = st.quiz; if (!z) return;
    const q = z.qs[z.i];
    quizBox.hidden = false;
    quizBox.innerHTML = `<p class="f8-q">${z.i + 1}/${z.qs.length} · ${esc(q.q)}</p>
      <div class="f8-opts">${q.options.map((o, k) => `<button type="button" data-opt="${k}">${String.fromCharCode(65 + k)}. ${esc(o)}</button>`).join("")}</div>`;
    quizBox.querySelector("button")?.focus({ preventScroll: true });
  }
  function answer(k) {
    const z = st.quiz; if (!z) return;
    const q = z.qs[z.i], ok = k === q.correct;
    quizBox.querySelectorAll("button").forEach((b, idx) => { b.disabled = true; if (idx === q.correct) b.classList.add("ok"); else if (idx === k) b.classList.add("bad"); });
    if (ok) z.ok++;
    setFace(ok ? "happy" : "sad", 900); blip(ok ? 1320 : 220, ok ? 60 : 120);
    say(`${B.pick(ok ? B.LINES.ok : B.LINES.fail)} ${q.why}`);
    setTimeout(() => {
      z.i++;
      if (z.i < z.qs.length) return renderQuestion();
      quizBox.hidden = true; quizBox.innerHTML = "";
      const p = prog(st.card.id); p.n += z.qs.length; p.ok = Math.max(p.ok, z.ok);
      if (z.ok === z.qs.length) { p.done = true; p.formula = st.card.formula; say(B.pick(B.LINES.understood)); setFace("happy", 1500); pet.cheer(); }
      else say(`${z.ok}/${z.qs.length}. Repasa la explicación de las que fallaste y repite el QUIZ: cambia los valores cada vez.`);
      st.quiz = null; save(); refreshMeter();
    }, ok ? 900 : 1800);
  }

  /* ---------- preguntas libres: online con escape a modo cartucho ---------- */
  async function ask(question) {
    you(question);
    st.history.push({ role: "user", content: question }); st.history = st.history.slice(-8);
    if (online()) {
      paint("think"); say(B.pick(B.LINES.think), "aside");
      try {
        const { text, actions } = await askRemote(cfg.endpoint, {
          question, history: st.history.slice(0, -1), mode: cfg.tutor ? "tutor" : "ayudante",
          context: st.card ? contextFor(st.card, st.analysis) : null,
        });
        st.history.push({ role: "assistant", content: text });
        say(text); runActions(actions); return;
      } catch (e) {
        st.degradedUntil = Date.now() + 60000; refreshMode();
        say(B.pick(B.LINES.degraded), "aside");
      }
    } else if (cfg.endpoint && !navigator.onLine) say(B.pick(B.LINES.offline), "aside");
    const local = B.localAnswer(question, st.card, st.analysis);
    if (local === null) doHint(); else say(local);
  }
  function contextFor(card, a) {
    const res = a?.res, p = prog(card.id);
    const pestanas = (host.tabsFor?.(res) || []).map(([k]) => k);
    return {
      frase: card.frase.slice(0, 1500), atomos: card.atomos.slice(0, 800), formula: card.formula.slice(0, 400),
      error: a?.error?.message || null,
      tipo: !res ? null : res.arg ? "razonamiento" : "formula",
      lectura: res && !res.arg ? B.readAloud(res.f, a.atomsMap) : null,
      diagnostico: B.diagnose(card, a).map((d) => d.text),
      avisos: (a?.warnings || []).slice(0, 4),
      pestanas, pestana_actual: pestanas.includes(card.tab) ? card.tab : null,
      progreso: { comprendida: p.done, mejor_quiz: `${p.ok}/3`, pistas_pedidas: st.hintLevel[card.id] || 0 },
    };
  }

  /* ---------- acciones que decide el cerebro online ---------- */
  const TAB_NAME = { estr: "Estructura", tabla: "Tabla", fn: "Formas normales", cmp: "Comparar", val: "Validez", cla: "Cláusulas" };
  const ACTIONS = { iniciar_quiz: startQuiz, leer_formula: doRead, dar_pista: doHint, explicar_error: doWhy };
  function runActions(actions) {
    for (const a of (Array.isArray(actions) ? actions : []).slice(0, 2)) {
      if (a?.type === "abrir_pestana" && TAB_NAME[a.tab]) then(() => {
        if (!host.openTab?.(a.tab)) return;
        const b = document.createElement("button");
        b.type = "button"; b.className = "f8-chip"; b.textContent = `▸ VER ${TAB_NAME[a.tab].toUpperCase()}`;
        b.addEventListener("click", () => sheet.close(), { once: true });
        log.append(b); trim(); log.scrollTop = log.scrollHeight;
      });
      else if (ACTIONS[a?.type]) then(ACTIONS[a.type]);
    }
  }
  async function askRemote(url, payload, ms = 30000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (typeof j.text !== "string" || !j.text.trim()) throw new Error("respuesta vacía");
      return { text: j.text.slice(0, 2000), actions: Array.isArray(j.actions) ? j.actions : [] };
    } finally { clearTimeout(t); }
  }

  /* ---------- proactividad: reacciona a lo que haces ---------- */
  let proTimer = 0;
  host.on("open", ({ card }) => {
    st.card = card; st.analysis = null; refreshMeter();
    if (!cfg.greeted) { cfg.greeted = true; save(); bubbleSay(B.pick(B.LINES.hello) + " Tócame cuando quieras.", { force: true }); }
    else if (B.dayLine() && cfg.dayShown !== new Date().toDateString()) { cfg.dayShown = new Date().toDateString(); save(); bubbleSay(B.dayLine()); }
    else if (!card.formula && !card.atomos) bubbleSay(B.pick(B.LINES.greetCard));
  });
  host.on("close", () => { st.card = null; st.analysis = null; hideBubble(); refreshMeter(); quizBox.hidden = true; st.quiz = null; });
  host.on("analyze", ({ card, analysis }) => {
    st.card = card; st.analysis = analysis; st.lastAnalyzeAt = Date.now(); pet.wake();
    const p = prog(card.id);
    if (p.done && p.formula !== card.formula) { p.done = false; p.ok = 0; save(); } // si cambias la fórmula, hay que volver a comprobarla
    refreshMeter();
    clearTimeout(proTimer);
    proTimer = setTimeout(() => proactive(card, analysis), analysis.error ? 4000 : 3200);
  });
  function proactive(card, a) {
    if (st.card?.id !== card.id) return;
    const seen = (st.shown[card.id] ||= new Set());
    if (a.error) {
      const key = "err:" + a.error.message;
      if (!seen.has(key)) { seen.add(key); bubbleSay(B.explainError(a.error)); }
      return;
    }
    if (!a.res) return;
    const d = B.diagnose(card, a).find((x) => !seen.has(x.id));
    if (d) { seen.add(d.id); bubbleSay(d.zone + " (tócame para la pista)"); return; }
    const p = prog(card.id);
    if (!p.done && !st.quizOffered[card.id + card.formula]) {
      st.quizOffered[card.id + card.formula] = true;
      setTimeout(() => { if (st.card?.id === card.id && Date.now() - st.lastAnalyzeAt > 6000) bubbleSay("¿La tienes? Tócame y haz el QUIZ: 3 preguntas para comprobar que la entiendes."); }, 6500);
    }
  }
  window.addEventListener("online", () => { refreshMode(); if (cfg.endpoint) { st.degradedUntil = 0; bubbleSay(B.pick(B.LINES.back), { force: sheet.open === false }); if (sheet.open) say(B.pick(B.LINES.back), "aside"); } });
  window.addEventListener("offline", () => { refreshMode(); if (cfg.endpoint) { if (sheet.open) say(B.pick(B.LINES.offline), "aside"); else bubbleSay(B.pick(B.LINES.offline)); } });

  /* ---------- eventos de la interfaz ---------- */
  function openSheet() {
    hideBubble(); sheet.showModal(); refreshMode(); refreshMeter();
    if (!st.booted) { st.booted = true; B.boot(host.version).forEach((l) => say(l, "boot")); }
    if (!log.querySelector(".f8-msg:not(.boot)")) { say(B.pick(B.LINES.hello)); const d = B.dayLine(); if (d) say(d, "aside"); }
    if (st.card && st.analysis) {
      const d = st.analysis.error ? null : B.diagnose(st.card, st.analysis)[0];
      if (st.analysis.error) say("Veo un error de sintaxis. Pulsa ¿POR QUÉ? y te lo explico.");
      else if (d) say(d.zone + " Pulsa PISTA si quieres más.");
      else if (!st.card.formula) say(B.hint(st.card, st.analysis, 1));
      else if (!prog(st.card.id).done) say(B.pick(B.LINES.idle));
    }
  }
  fab.addEventListener("click", openSheet);
  $(".f8-bubble-text").addEventListener("click", openSheet);
  $(".f8-bubble-x").addEventListener("click", hideBubble);
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) return sheet.close();
    const a = e.target.closest("[data-a]")?.dataset.a;
    const opt = e.target.closest("[data-opt]")?.dataset.opt;
    if (opt !== undefined) return answer(Number(opt));
    if (a === "hint") doHint();
    if (a === "read") doRead();
    if (a === "quiz") startQuiz();
    if (a === "why") doWhy();
    if (a === "close") sheet.close();
    if (a === "settings") openSettings();
  });
  $(".f8-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#f8q"), q = inp.value.trim(); if (!q) return;
    inp.value = ""; ask(q);
  });

  function openSettings() {
    settings.querySelectorAll("[data-k]").forEach((i) => { i.checked = !!cfg[i.dataset.k]; });
    settings.querySelector("#f8ep").value = cfg.endpoint || "";
    settings.querySelector(".f8-test").textContent = "";
    settings.showModal();
  }
  function readSettings() {
    settings.querySelectorAll("[data-k]").forEach((i) => { cfg[i.dataset.k] = i.checked; });
    const url = settings.querySelector("#f8ep").value.trim();
    cfg.endpoint = /^https:\/\/[^\s]+$/i.test(url) ? url : "";
    return url && !cfg.endpoint;
  }
  settings.addEventListener("click", async (e) => {
    if (e.target === settings) return settings.close();
    const a = e.target.closest("[data-a]")?.dataset.a;
    const out = settings.querySelector(".f8-test");
    if (a === "closeSettings") settings.close();
    if (a === "saveSettings") {
      const bad = readSettings(); save(); st.degradedUntil = 0; refreshMode(); pet.show();
      if (bad) { out.textContent = "La URL tiene que empezar por https://"; return; }
      settings.close(); host.toast("Ajustes de FARAD-8 guardados.");
    }
    if (a === "test") {
      const bad = readSettings();
      if (bad || !cfg.endpoint) { out.textContent = "Escribe una URL https:// primero."; return; }
      out.textContent = "Probando…";
      try { const { text: t } = await askRemote(cfg.endpoint, { question: "ping", history: [], context: null }, 10000); out.textContent = "Conectado ✓ " + t.slice(0, 80); }
      catch (err) { out.textContent = `No responde (${err.name === "AbortError" ? "tiempo agotado" : err.message}). Seguiré en modo cartucho.`; }
    }
  });

  host.addMenuItem("farad8", "FARAD-8: ajustes del tutor", openSettings);
  refreshMode(); refreshMeter(); paint("idle");
}

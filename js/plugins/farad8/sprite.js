// sprite.js — FARAD-8 en 16×16 píxeles, paleta Game Boy + chispa de bobina Tesla.
export const PALETTE = { 1: "#0f380f", 2: "#306230", 3: "#8bac0f", 4: "#9bbc0f", 5: "#f8e058" };

// e = ojo, m = boca, s = chispa. El resto: índice de paleta o "." transparente.
const BASE = [
  ".......s........",
  ".......1........",
  "......121.......",
  ".......1........",
  "...1111111111...",
  "..122222222221..",
  "..12ee2222ee21..",
  "..12ee2222ee21..",
  "..122222222221..",
  "..1222mmmm2221..",
  "..122222222221..",
  "...1111111111...",
  "....13333331....",
  "..113311113311..",
  "...133333333....",
  "....11....11....",
];

// Cada expresión define las dos filas de ojos (2 px cada una), la boca (4 px) y la chispa.
const FACES = {
  idle:    { eyes: ["44", "44"], mouth: "1111", spark: "5" },
  blink:   { eyes: ["22", "11"], mouth: "1111", spark: "5" },
  talk:    { eyes: ["44", "44"], mouth: "1441", spark: "5" },
  think:   { eyes: ["44", "22"], mouth: "2112", spark: "3" },
  happy:   { eyes: ["22", "44"], mouth: "4114", spark: "5" },
  sad:     { eyes: ["11", "44"], mouth: "2112", spark: "." },
  offline: { eyes: ["33", "33"], mouth: "1111", spark: "." },
};

export function drawSprite(canvas, face = "idle", { pixelate = false, shift = 0 } = {}) {
  const f = FACES[face] || FACES.idle;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  BASE.forEach((row, y) => {
    let eyeIdx = 0, mouthIdx = 0;
    const dx = shift && (y === 6 || y === 9) ? shift : 0; // "glitch" de líneas sueltas
    [...row].forEach((ch, x) => {
      let c = ch;
      if (ch === "e") c = f.eyes[y - 6][eyeIdx++ % 2];
      else if (ch === "m") c = f.mouth[mouthIdx++];
      else if (ch === "s") c = f.spark;
      if (c === "." || !PALETTE[c]) return;
      ctx.fillStyle = PALETTE[c];
      ctx.fillRect(x + dx, y, 1, 1);
    });
  });
  if (pixelate) {
    // Pierde resolución a propósito: 16 → 8 → 16. Parece un fallo; es su carácter.
    const tmp = document.createElement("canvas"); tmp.width = tmp.height = 8;
    const t = tmp.getContext("2d"); t.imageSmoothingEnabled = false;
    t.drawImage(canvas, 0, 0, 8, 8);
    ctx.clearRect(0, 0, 16, 16); ctx.drawImage(tmp, 0, 0, 16, 16);
  }
}

/* ---------- Ohm, el gato de FARAD-8 (12×11) ---------- */
// e = ojo, n = nariz, t = cola arriba (fotograma 0), u = cola abajo (fotograma 1), b = barriga.
const PET = [
  "...1.....1..",
  "...11...11..",
  "...1222221..",
  "...12e2e21..",
  "t..122n221..",
  "t...12221...",
  "t..1222221..",
  ".t.12bbb21..",
  "..u12bbb21..",
  "..u1222221..",
  "...11.1.11..",
];
const PET_STATES = {
  idle:  { eye: "4", nose: "5", belly: "3" },
  blink: { eye: "1", nose: "5", belly: "3" },
  sleep: { eye: "1", nose: "2", belly: "3" },
  happy: { eye: "5", nose: "5", belly: "4" },
};
export const PET_SIZE = { w: 12, h: 11 };

export function drawPet(canvas, state = "idle", frame = 0) {
  const s = PET_STATES[state] || PET_STATES.idle;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PET_SIZE.w, PET_SIZE.h);
  PET.forEach((row, y) => [...row].forEach((ch, x) => {
    let c = ch;
    if (ch === "e") c = s.eye;
    else if (ch === "n") c = s.nose;
    else if (ch === "b") c = s.belly;
    else if (ch === "t") c = frame === 0 ? "1" : ".";
    else if (ch === "u") c = frame === 1 ? "1" : ".";
    if (c === "." || !PALETTE[c]) return;
    ctx.fillStyle = PALETTE[c];
    ctx.fillRect(x, y, 1, 1);
  }));
}

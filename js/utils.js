/* ============================================================
   utils.js  —  matemática, cores, canvas e helpers gerais
   ============================================================ */
window.VS = window.VS || {};

VS.U = (function () {
  const TAU = Math.PI * 2;

  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const chance = (p) => Math.random() < p;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const norm = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  /* ruído simples para tremer a câmera */
  const shake = (ms) => { shake.ms = Math.max(shake.ms, ms); shake.p = Math.max(shake.p, 6); };
  shake.ms = 0; shake.p = 0;

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.floor(n));
  }

  function hexRgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function mix(c1, c2, t) {
    const p = (c) => { const h = c.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const a = p(c1), b = p(c2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }

  /* ponto mais próximo do alvo dentro de um cone de visão */
  function inCone(px, py, dir, spread, tx, ty, range) {
    const d = dist(px, py, tx, ty);
    if (d > range) return false;
    return Math.abs(norm(angleTo(px, py, tx, ty) - dir)) <= spread / 2;
  }

  /* remove elementos mortos de um array (marcados com .dead) */
  function sweep(arr) {
    let n = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[n++] = arr[i];
    arr.length = n;
    return arr;
  }

  return { TAU, rand, randInt, chance, pick, clamp, lerp, dist, dist2, angleTo, norm, shake, fmtTime, fmtNum, hexRgba, mix, inCone, sweep };
})();

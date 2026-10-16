/* ============================================================
   audio.js  —  efeitos sonoros sintetizados (sem arquivos)
   ============================================================ */
window.VS = window.VS || {};

VS.Audio = (function () {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  /* bipe simples */
  function tone(freq, dur, type = 'square', vol = 0.5, slide = 0) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  /* ruído curto (explosões / golpes) */
  function noise(dur = 0.15, vol = 0.35) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    s.connect(f); f.connect(g); g.connect(master);
    s.start();
  }

  const SFX = {
    hit: () => { if (Math.random() < 0.25) noise(0.07, 0.16); },
    slash: () => noise(0.1, 0.2),
    shoot: () => tone(560, 0.06, 'square', 0.16, -220),
    zap: () => { tone(1400, 0.09, 'sawtooth', 0.2, -900); noise(0.05, 0.12); },
    boom: () => { noise(0.28, 0.4); tone(120, 0.3, 'sine', 0.3, -70); },
    coin: () => tone(980, 0.07, 'triangle', 0.22, 260),
    gem: () => tone(700, 0.1, 'triangle', 0.25, 500),
    chest: () => { tone(520, 0.12, 'square', 0.25, 200); setTimeout(() => tone(880, 0.2, 'square', 0.25, 300), 110); },
    level: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.3), i * 80)); },
    fusion: () => { [392, 523, 659, 880, 1174].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.22), i * 70)); },
    hurt: () => { tone(200, 0.16, 'sawtooth', 0.3, -120); noise(0.1, 0.2); },
    die: () => { tone(300, 0.9, 'sawtooth', 0.3, -260); noise(0.6, 0.3); },
    boss: () => { tone(90, 1.2, 'sawtooth', 0.35, 30); },
    buy: () => tone(760, 0.12, 'square', 0.25, 400),
    deny: () => tone(180, 0.15, 'square', 0.22, -60)
  };

  addEventListener('pointerdown', resume, { once: false });
  addEventListener('keydown', resume, { once: false });

  return { SFX, resume, get muted() { return muted; }, toggle() { muted = !muted; return muted; } };
})();

/* ============================================================
   sprites.js  —  carrega as imagens e corta a margem
                  transparente (guarda o retangulo de origem)
   ============================================================ */
window.VS = window.VS || {};

VS.SPR = (function () {
  const LIST = [
    /* olhos de fogo (inimigo novo) */
    ...['south', 'east', 'north', 'west'].flatMap(d =>
      [0, 1, 2, 3].map(i => ({ key: `eye_${d}_${i}`, file: `assets/eye_${d}_${i}.png` }))),
    /* professores (chefe) */
    ...[1, 2, 3, 4, 5, 6].flatMap(i => [
      { key: `prof_${i}`, file: `assets/prof_0${i}.png` },
      { key: `prof_${i}_flip`, file: `assets/prof_0${i}_flip.png` }
    ]),
    /* cleber (segundo chefe) — andando para as 4 direco + 4 poses de soco */
    { key: 'cleber_s1', file: 'assets/cleber_s1.png' },
    { key: 'cleber_s2', file: 'assets/cleber_s2.png' },
    { key: 'cleber_s3', file: 'assets/cleber_s3.png' },
    { key: 'cleber_n1', file: 'assets/cleber_n1.png' },
    { key: 'cleber_n2', file: 'assets/cleber_n2.png' },
    { key: 'cleber_n3', file: 'assets/cleber_n3.png' },
    { key: 'cleber_e1', file: 'assets/cleber_e1.png' },
    { key: 'cleber_w1', file: 'assets/cleber_w1.png' },
    { key: 'cleber_atk_s', file: 'assets/cleber_atk_s.png' },
    { key: 'cleber_atk_e', file: 'assets/cleber_atk_e.png' },
    { key: 'cleber_atk_w', file: 'assets/cleber_atk_w.png' },
    { key: 'cleber_atk_n', file: 'assets/cleber_atk_n.png' },
    /* NOTA: nao existe sprite do personagem (player_*.png) no projeto,
       entao o personagem e desenhado no canvas e a skin pinta ele direto. */
    /* as 20 reliquias (cards ilustrados) */
    ...Array.from({ length: 20 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return { key: 'relic_' + n, file: `assets/relics/relic_${n}.png` };
    })
  ];

  const frames = Object.create(null);
  let total = 0, carregados = 0;

  function cutTransparent(img) {
    /* encontra o retangulo com conteudo para nao dibujar a margem vazia */
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++) {
      for (let xx = 0; xx < c.width; xx++) {
        if (d[(y * c.width + xx) * 4 + 3] > 12) {
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { img, x: 0, y: 0, w: c.width, h: c.height };
    return { img, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function load() {
    for (const it of LIST) {
      total++;
      const img = new Image();
      img.onload = () => {
        frames[it.key] = cutTransparent(img);
        carregados++;
        if (carregados === total) VS.Game && VS.Game.spritesReady && VS.Game.spritesReady();
      };
      img.onerror = () => { /* sprite faltando: o jogo usa o desenho antigo */ };
      img.src = it.file;
    }
  }

  /* devolve {img,x,y,w,h} ou null ( enquanto carrega / se falhou */
  function get(key) { return frames[key] || null; }

  /* desenha centralizado horizontalmente, com a base (pes) alinhada em y+foot */
  function draw(ctx, key, x, y, h, foot) {
    const f = frames[key];
    if (!f) return false;
    const w = h * (f.w / f.h);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x - w / 2, y - h + (foot || 0), w, h);
    return true;
  }

  /* desenha mantendo a proporcao dentro de uma caixa (w x h) */
  function drawBox(ctx, key, x, y, bw, bh) {
    const f = frames[key];
    if (!f) return false;
    const k = Math.min(bw / f.w, bh / f.h);
    const w = f.w * k, h = f.h * k;
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x - w / 2, y - h / 2, w, h);
    return true;
  }

  /* ============================================================
     SKIN — pinta o sprite com as cores da skin (mantém o sombreado
     original). O resultado fica em cache, então custa quase nada.
     ============================================================ */
  const tintCache = Object.create(null);

  function tint(key, cor, cor2) {
    if (!cor) return null;
    const ck = key + '|' + cor + '|' + (cor2 || '');
    if (tintCache[ck]) return tintCache[ck];
    const f = frames[key];
    if (!f) return null;
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const x = c.getContext('2d');
    x.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    x.globalCompositeOperation = 'source-atop';
    if (cor2) {
      const grd = x.createLinearGradient(0, 0, 0, c.height);
      grd.addColorStop(0, cor);
      grd.addColorStop(1, cor2);
      x.fillStyle = grd;
    } else {
      x.fillStyle = cor;
    }
    x.globalAlpha = 0.82;                 /* deixa passar um pouco do desenho original */
    x.fillRect(0, 0, c.width, c.height);
    tintCache[ck] = c;
    return c;
  }

  /* desenha o sprite ja pintado com a skin */
  function drawSkin(ctx, key, x, y, h, foot, cor, cor2) {
    const t = tint(key, cor, cor2);
    if (!t) return false;
    const w = h * (t.width / t.height);
    ctx.drawImage(t, x - w / 2, y - h + (foot || 0), w, h);
    return true;
  }

  /* desenha cabendo dentro de um raio (para inimigos) */
  function drawInRadius(ctx, key, x, y, r) {
    const f = frames[key];
    if (!f) return false;
    const h = r * 2.25, w = h * (f.w / f.h);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x - w / 2, y - h * 0.86, w, h);
    return true;
  }

  return { load, get, draw, drawBox, drawInRadius, drawSkin, tint, ready: () => carregados === total, count: () => carregados + '/' + total };
})();

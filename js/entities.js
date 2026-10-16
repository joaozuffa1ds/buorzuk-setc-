/* ============================================================
   entities.js  —  tipos de inimigo, IA, ondas e desenho deles
   ============================================================ */
window.VS = window.VS || {};

VS.Entities = (function () {
  const U = VS.U;
  const { TAU, rand, randInt, chance, pick, clamp } = U;

  /* ---------------- TIPOS ---------------- */
  const TYPES = {
    slime: { name: 'Gosma', hp: 12, speed: 44, dmg: 6, xp: 1, r: 15, color: '#7dff8e', ai: 'chase', cost: 1 },
    bat: { name: 'Morcego', hp: 9, speed: 92, dmg: 5, xp: 1, r: 12, color: '#cc96ff', ai: 'chase', cost: 1 },
    swarm: { name: 'Enxame', hp: 6, speed: 118, dmg: 4, xp: 1, r: 9, color: '#ff8fa3', ai: 'swarm', cost: 0.6 },
    ghost: { name: 'Fantasma', hp: 20, speed: 70, dmg: 7, xp: 2, r: 16, color: '#c9f4ff', ai: 'wavy', cost: 1.6, ghost: true },
    shooter: { name: 'Cuspidor', hp: 18, speed: 38, dmg: 8, xp: 3, r: 15, color: '#ffc861', ai: 'shoot', cost: 2 },
    drake: { name: 'Draco', hp: 46, speed: 62, dmg: 12, xp: 5, r: 20, color: '#ff7461', ai: 'shoot', cost: 3 },
    brute: { name: 'Brutamonte', hp: 90, speed: 34, dmg: 16, xp: 7, r: 26, color: '#d1a173', ai: 'chase', cost: 4, heavy: true },
    olho: { name: 'Olho de Fogo', hp: 26, speed: 108, dmg: 9, xp: 3, r: 17, color: '#ff5a4a', ai: 'chase', cost: 2.2, sprite: 'eye' },
    boss: { name: 'O Professor', hp: 1400, speed: 42, dmg: 24, xp: 90, r: 48, color: '#c92153', ai: 'boss', cost: 0, boss: true, sprite: 'prof', bossKind: 'prof' },
    cleber: { name: 'Cleber', hp: 1750, speed: 52, dmg: 27, xp: 120, r: 48, color: '#a4622a', ai: 'boss', cost: 0, boss: true, sprite: 'cleber', bossKind: 'cleber' }
  };

  /* inimigos liberados por onda (peso de escolha) */
  function waveTable(wave) {
    const t = [];
    t.push(['slime', 10]);
    if (wave >= 2) t.push(['bat', 8 + wave]);
    if (wave >= 3) t.push(['swarm', 5 + wave * 1.2]);
    if (wave >= 4) t.push(['olho', 4 + wave * 1.1]);
    if (wave >= 4) t.push(['ghost', 5 + wave * 0.8]);
    if (wave >= 5) t.push(['shooter', 3 + wave * 0.7]);
    if (wave >= 7) t.push(['drake', 2 + wave * 0.6]);
    if (wave >= 9) t.push(['brute', 1 + wave * 0.45]);
    return t;
  }

  function pickType(wave) {
    const t = waveTable(wave);
    let total = 0;
    for (const [, w] of t) total += w;
    let r = Math.random() * total;
    for (const [id, w] of t) { r -= w; if (r <= 0) return id; }
    return 'slime';
  }

  /* ---------------- CRIAÇÃO ---------------- */
  function make(g, type, x, y) {
    const t = TYPES[type], m = g.mode;
    const w = g.depth || g.wave;      /* profundidade = fase/sala, escala com o jogo */
    const scale = 1 + w * 0.115 + Math.pow(w, 1.7) * 0.0016;      /* cresce com o tempo */
    const elite = !t.boss && w >= 6 && chance(0.035 + w * 0.002);   /* elites mais fortes */
    const em = elite ? 2.4 : 1;

    return {
      type, x, y, r: t.r * (elite ? 1.25 : 1),
      hp: t.hp * scale * m.hp * em, maxHp: t.hp * scale * m.hp * em,
      dmg: t.dmg * (1 + w * 0.05) * m.dmg * (elite ? 1.3 : 1),
      speed: t.speed * m.speed * (elite ? 1.08 : 1) * (1 + Math.min(0.4, w * 0.008)),
      xp: t.xp * (elite ? 5 : 1) * m.xp,
      coin: Math.round((0.6 + t.xp * 0.7) * (elite ? 3 : 1) * m.coin),
      color: t.color, ai: t.ai, boss: !!t.boss, heavy: !!t.heavy, ghost: !!t.ghost, elite,
      bossKind: t.bossKind || null,
      name: t.name,
      kx: 0, ky: 0,                                  /* empurrão */
      slow: 0, slowT: 0, freeze: 0,
      poisonT: 0, poisonDps: 0, poisonTick: 0,
      bleedT: 0,
      flash: 0, atkCd: rand(0.6, 2.4), atkT: 0, wob: rand(TAU), dead: false,
      combo: 0,                                        /* etapa do combo do Cleber (0-2) */
      sprite: t.sprite || null, dir: 'south', anim: rand(0, 0.4)
    };
  }

  /* ---------------- IA / ATUALIZAÇÃO ---------------- */
  function update(g, dt) {
    const p = g.p, RW = g.roomW, RH = g.roomH;
    const grid = g.grid, gw = g.gw, gh = g.gh, cell = g.cell;
    const kd = Math.pow(0.0016, dt);          /* amortecimento calculado 1x por frame */

    for (const e of g.enemies) {
      if (e.dead) continue;

      /* ---- efeitos de status ---- */
      if (e.freeze > 0) e.freeze -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonTick -= dt;
        if (e.poisonTick <= 0) { e.poisonTick = 0.5; g.damage(e, e.poisonDps * 0.5, { noCrit: true, dot: true }); }
      }
      if (e.bleedT > 0) e.bleedT -= dt;
      if (e.flash > 0) e.flash -= dt;

      /* ---- movimento ---- */
      let sp = e.speed * (1 - e.slow) * (e.freeze > 0 ? 0 : 1);
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx);
      let mx = 0, my = 0;

      switch (e.ai) {
        case 'wavy':
          e.wob += dt * 4;
          mx = Math.cos(a) * sp + Math.cos(e.wob) * sp * 0.55;
          my = Math.sin(a) * sp + Math.sin(e.wob) * sp * 0.55;
          break;
        case 'swarm': {
          e.wob += dt * 7;
          mx = Math.cos(a + Math.sin(e.wob) * 0.6) * sp;
          my = Math.sin(a + Math.sin(e.wob) * 0.6) * sp;
          break;
        }
        case 'shoot':
          if (d < 250) { mx = -Math.cos(a) * sp; my = -Math.sin(a) * sp; }
          else if (d > 420) { mx = Math.cos(a) * sp; my = Math.sin(a) * sp; }
          else { mx = Math.cos(a + 1.57) * sp * 0.6; my = Math.sin(a + 1.57) * sp * 0.6; }
          break;
        case 'boss':
          mx = Math.cos(a) * sp; my = Math.sin(a) * sp;
          break;
        default:
          mx = Math.cos(a) * sp; my = Math.sin(a) * sp;
      }

      /* ---- repulsão entre inimigos (grade da sala) ---- */
      if (!e.boss && !e.ghost) {
        let cx = (e.x / cell) | 0, cy = (e.y / cell) | 0;
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          if (gy < 0 || gy >= gh) continue;
          for (let gx = cx - 1; gx <= cx + 1; gx++) {
            if (gx < 0 || gx >= gw) continue;
            const cl = grid[gy * gw + gx];
            if (!cl || !cl.length) continue;
            for (let i = 0; i < cl.length; i++) {
              const o = cl[i];
              if (o === e || o.dead) continue;
              const ox = e.x - o.x, oy = e.y - o.y;
              const dd = ox * ox + oy * oy;
              const min = (e.r + o.r) * 0.82;
              if (dd < min * min && dd > 0.01) {
                const l = Math.sqrt(dd);
                const push = (min - l) / min * (e.heavy ? 22 : 46);
                mx += (ox / l) * push;
                my += (oy / l) * push;
              }
            }
          }
        }
      }

      /* obstaculos da arena: o bixo tambem nao atravessa parede e
         nao e expulso para o lado de dentro dela */
      const mvx = (mx + e.kx) * dt, mvy = (my + e.ky) * dt;
      if (g.obstacles && g.obstacles.length) {
        /* se travou numa parede, perde a velocidade que sobrou */
        if (g.moveBody(e, mvx, mvy, e.r)) { e.kx *= 0.3; e.ky *= 0.3; }
      } else { e.x += mvx; e.y += mvy; }
      e.kx *= kd; e.ky *= kd;
      e.x = clamp(e.x, 0, RW); e.y = clamp(e.y, 0, RH);

      /* direcao do sprite + quadro de animacao */
      if (e.sprite) {
        const vx = mx + e.kx, vy = my + e.ky;
        if (Math.abs(vx) > Math.abs(vy)) e.dir = vx < 0 ? 'west' : 'east';
        else e.dir = vy < 0 ? 'north' : 'south';
        e.anim += dt * (e.boss ? 4.5 : 9);
      }

      if (e.atkT > 0) e.atkT -= dt;

      /* chefe enfurece na metade da vida: mais rapido e com o anel extra */
      if (e.boss && !e.phase2 && e.hp < e.maxHp * 0.5) {
        e.phase2 = true;
        e.speed *= 1.25;
        e.dmg *= 1.15;
      }

      /* ---- ataques ---- */
      if (e.ai === 'shoot' || e.boss) {
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          if (e.boss) {
            if (e.bossKind === 'cleber') cleberPattern(g, e);
            else { bossPattern(g, e); e.atkCd = 2.4; }
          }
          else {
            /* nao atira através da parede: o tiro morre nela */
            if (g.losBlocked && g.losBlocked(e.x, e.y, p.x, p.y)) { e.atkCd = 0.5; continue; }
            const shots = e.type === 'drake' ? 3 : 1;
            for (let i = 0; i < shots; i++) {
              const ang = a + (i - (shots - 1) / 2) * 0.28;
              g.spawnEBullet(e.x, e.y, ang, e.boss ? 210 : 180, e.dmg * 0.7, e.color, e.r * 0.6);
            }
            e.atkCd = e.type === 'drake' ? 2.1 : 2.6;
          }
        }
      }

      /* boss invoca lacaios */
      if (e.boss && chance(dt * (e.bossKind === 'cleber' ? 0.22 : 0.35))) {
        const t2 = pickType(3 + g.depth);
        const s = g.spawnEnemy(t2, e.x + rand(-90, 90), e.y + rand(-90, 90));
        if (s) { s.hp = s.maxHp = s.maxHp * 0.7; }
      }

      /* ---- dano por contato ---- */
      /* e.dmg 0 = bicho que so incomoda (o parasita da sala PARASITAS
         suga vida pela mecânica, nao pelo toque) */
      if (e.dmg > 0 && d < e.r + p.r && p.iframe <= 0 && !p.dead) g.hurtPlayer(e.dmg, e);
    }
  }

  /* padrão de tiro do chefe: leque + anel girando */
  function bossPattern(g, e) {
    const p = g.p, base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = 0; i < 12; i++) {
      const ang = base + (i - 5.5) * 0.18;
      g.spawnEBullet(e.x, e.y, ang, 190 + i * 3, e.dmg * 0.55, '#ff6b83', 12);
    }
    g.ringShots = (g.ringShots || 0) + 1;
    const off = g.ringShots * 0.35;
    for (let i = 0; i < 16; i++) g.spawnEBullet(e.x, e.y, off + i / 16 * TAU, 130, e.dmg * 0.45, '#ffd76a', 10);
  }


  /* padrão do Cleber: COMBO DE 3 GOLPES encadeados.
     1) jab curto     — investida rapida, leque apertado, recarga curta
     2) cruzado longo — investida mais forte, leque aberto, recarga media
     3) soco final    — pisada no chao: onda de choque + leque, recarga longa
     Depois do 3o o combo reinicia no 1o. Cada golpe usa a pose de soco. */
  const COMBO = [
    { wind: 0.16, dash: 210, cd: 0.85, fan: 3, spread: 0.20, spd: 260, dmg: 0.55, r: 11 },
    { wind: 0.24, dash: 340, cd: 1.10, fan: 5, spread: 0.30, spd: 235, dmg: 0.60, r: 13 },
    { wind: 0.34, dash: 180, cd: 2.30, fan: 7, spread: 0.38, spd: 220, dmg: 0.65, r: 14 }
  ];

  function cleberPattern(g, e) {
    const p = g.p, a = Math.atan2(p.y - e.y, p.x - e.x);
    const step = e.combo % 3;
    const m = COMBO[step];

    e.dir = Math.abs(Math.cos(a)) > 0.35 ? (Math.cos(a) < 0 ? 'west' : 'east')
      : (Math.sin(a) < 0 ? 'north' : 'south');
    e.atkT = m.wind;                          /* segura a pose de soco no sprite */

    /* investida: empurra o proprio corpo na direcao do soco */
    e.kx += Math.cos(a) * m.dash; e.ky += Math.sin(a) * m.dash;

    for (let i = 0; i < m.fan; i++) {
      g.spawnEBullet(e.x, e.y, a + (i - (m.fan - 1) / 2) * m.spread, m.spd, e.dmg * m.dmg, '#ffb03a', m.r);
    }

    if (step === 2) {
      /* soco final: pisada que abre uma onda de choque pelo chao */
      g.spawnShock(e.x, e.y, 300, 340, e.dmg * 0.8, '#ffd76a');
      g.ringShots = (g.ringShots || 0) + 1;
      U.shake(320);
      if (e.phase2) {
        for (let i = 0; i < 10; i++)
          g.spawnEBullet(e.x, e.y, g.ringShots * 0.5 + i / 10 * TAU, 150, e.dmg * 0.4, '#ffd76a', 11);
      }
    } else if (e.phase2 && step === 1) {
      /* enlurecido: anel giratorio no meio do combo */
      g.ringShots = (g.ringShots || 0) + 1;
      for (let i = 0; i < 8; i++)
        g.spawnEBullet(e.x, e.y, g.ringShots * 0.6 + i / 8 * TAU, 140, e.dmg * 0.35, '#ffd76a', 10);
    }

    e.combo = (e.combo + 1) % 3;
    e.atkCd = m.cd;
  }


  /* ============================================================
     SPRITES: olho de fogo, professor (chefe 1) e cleber (chefe 2)
     ============================================================ */
  const DIRS = ['south', 'east', 'north', 'west'];

  function spriteKey(e) {
    const f = Math.floor(e.anim) % 4;
    if (e.sprite === 'eye') return `eye_${e.dir}_${f}`;
    if (e.sprite === 'prof') {
      /* o professor olha pro jogador: usa a pose virada quando vem de cima */
      const back = e.dir === 'north';
      const flip = e.dir === 'west';
      return `prof_${1 + (Math.floor(e.anim) % 6)}${flip || back ? '_flip' : ''}`;
    }
    if (e.sprite === 'cleber') {
      /* pose de soco enquanto o golpe acontece; senao o ciclo de caminhada */
      const k = { south: 's', east: 'e', north: 'n', west: 'w' }[e.dir] || 's';
      if (e.atkT > 0) return 'cleber_atk_' + k;
      const f = Math.floor(e.anim) % 3;
      if (e.dir === 'north') return 'cleber_n' + (1 + f);
      if (e.dir === 'east') return 'cleber_e1';
      if (e.dir === 'west') return 'cleber_w1';
      return 'cleber_s' + (1 + f);
    }
    return null;
  }

  function drawSprite(ctx, g, e) {
    const key = spriteKey(e);
    const h = e.boss ? 118 : 42;
    ctx.save();
    if (e.ghost) ctx.globalAlpha = 0.75;
    if (e.freeze > 0) ctx.globalAlpha *= 0.85;
    if (!e.spr) e.spr = {};                 /* cache do tamanho do quadro */
    const drew = VS.SPR.drawInRadius(ctx, key, e.x, e.y + e.r * 0.55, h / 2.25);

    if (!drew) {                            /* imagem nao carregou: circulo simples */
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.flash > 0 ? '#fff' : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.restore();
      drawStatus(ctx, g, e, e.r);
      return;
    }
    /* brilho branco quando leva dano */
    if (e.flash > 0) {
      ctx.globalAlpha = e.flash / 0.08 * 0.75;
      ctx.fillStyle = '#fff';
      const w = h * 0.62;
      ctx.fillRect(e.x - w / 2, e.y - e.r * 1.5, w, h * 0.9);
    }
    ctx.restore();

    /* contorno de elite (o chefe nao tem: o sprite dele ja destaca) */
    if (e.elite && !e.boss) {
      ctx.save();
      ctx.strokeStyle = '#ff9de2';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    drawStatus(ctx, g, e, e.r);
  }

  /* efeitos de status + barra de vida (comum entre sprite e circulo) */
  function drawStatus(ctx, g, e, r) {
    if (e.freeze > 0) {
      ctx.save(); ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (e.poisonT > 0) {
      for (let i = 0; i < 3; i++) {
        const t = g.time * 2 + i * 2 + e.wob;
        ctx.fillStyle = 'rgba(150,255,90,.55)';
        ctx.beginPath(); ctx.arc(e.x + Math.cos(t) * r, e.y + Math.sin(t * 1.3) * r, 3.5, 0, TAU); ctx.fill();
      }
    }
    if (e.slowT > 0 && e.freeze <= 0) {
      ctx.strokeStyle = 'rgba(150,220,255,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 5, 0, TAU); ctx.stroke();
    }
    if (!e.boss && (e.hp < e.maxHp || e.elite || e.heavy)) {
      const bw = r * 2.4, hp = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(e.x - bw / 2, e.y - r - 13, bw, 5);
      ctx.fillStyle = e.elite ? '#ff9de2' : '#e04a5f';
      ctx.fillRect(e.x - bw / 2, e.y - r - 13, bw * hp, 5);
    }
  }

  /* ---------------- DESENHO ---------------- */
  function draw(ctx, g) {
    const L = g.view.left - 60, R = g.view.right + 60, T = g.view.top - 60, B = g.view.bottom + 60;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.x < L || e.x > R || e.y < T || e.y > B) continue;

      const r = e.r;

      /* ---- sprite (olho de fogo / professor) ---- */
      if (e.sprite) { drawSprite(ctx, g, e); continue; }

      ctx.save();
      ctx.translate(e.x, e.y);

      if (e.ghost) ctx.globalAlpha = 0.72 + Math.sin(g.time * 4 + e.wob) * 0.14;
      if (e.freeze > 0) ctx.globalAlpha *= 0.85;

      /* corpo */
      const flash = e.flash > 0;
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      /* sombra so nos destaqueados: era o gargalo de desenho com muita horda */
      if (!flash && (e.elite || e.boss)) { ctx.shadowColor = e.color; ctx.shadowBlur = e.boss ? 24 : 12; }
      ctx.beginPath();
      if (e.type === 'slime') {
        const sq = 1 + Math.sin(g.time * 8 + e.wob) * 0.07;
        ctx.arc(0, 0, r * 1.08 * sq, 0, TAU);
        ctx.ellipse(0, r * 0.35, r * 1.1, r * 0.4, 0, 0, TAU);
      } else if (e.type === 'bat') {
        const f = Math.sin(g.time * 14 + e.wob) * 0.5;
        ctx.moveTo(0, 0); ctx.lineTo(-r * 1.8, -r * 0.7 + f * r);
        ctx.lineTo(-r * 0.7, r * 0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(r * 1.8, -r * 0.7 + f * r);
        ctx.lineTo(r * 0.7, r * 0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill();
      } else if (e.type === 'brute') {
        ctx.arc(0, 0, r, 0, TAU);
        ctx.rect(-r * 0.9, -r * 1.05, r * 1.8, r * 2.1);
      } else if (e.boss) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = i / 10 * TAU - Math.PI / 2;
          const rad = r * (i % 2 ? 0.72 : 1.12);
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      }

      /* contorno claro -> destaca no chao escuro */
      if (!flash) {
        ctx.shadowBlur = 0;
        ctx.lineWidth = e.boss ? 4 : 2.6;
        ctx.strokeStyle = e.boss ? '#ffe27a' : (e.elite ? '#ffd6f2' : 'rgba(255,255,255,.72)');
        ctx.stroke();
      } else ctx.shadowBlur = 0;

      /* olhos */
      ctx.fillStyle = e.boss ? '#ffe27a' : '#241533';
      const ex = r * 0.34, ey = -r * 0.12, es = Math.max(1.8, r * 0.22);
      ctx.beginPath(); ctx.ellipse(-ex, ey, es, es * 1.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex, ey, es, es * 1.2, 0, 0, TAU); ctx.fill();

      ctx.restore();

      /* contorno de elite (o chefe nao tem: o sprite dele ja destaca) */
      ctx.save();
      if (e.elite && !e.boss) {
        ctx.strokeStyle = '#ff9de2';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      /* status visuais */
      if (e.freeze > 0) {
        ctx.save(); ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.arc(e.x, e.y, r + 2, 0, TAU); ctx.fill();
        ctx.restore();
      }
      if (e.poisonT > 0) {
        for (let i = 0; i < 3; i++) {
          const t = g.time * 2 + i * 2 + e.wob;
          ctx.fillStyle = 'rgba(150,255,90,.5)';
          ctx.beginPath(); ctx.arc(e.x + Math.cos(t) * r, e.y + Math.sin(t * 1.3) * r, 3, 0, TAU); ctx.fill();
        }
      }
      if (e.slowT > 0 && e.freeze <= 0) {
        ctx.strokeStyle = 'rgba(150,220,255,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 4, 0, TAU); ctx.stroke();
      }

      /* barra de vida */
      if (!e.boss && (e.hp < e.maxHp || e.elite || e.heavy)) {
        const bw = r * 2.2, hp = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(e.x - bw / 2, e.y - r - 10, bw, 4);
        ctx.fillStyle = e.elite ? '#ff9de2' : '#e04a5f';
        ctx.fillRect(e.x - bw / 2, e.y - r - 10, bw * hp, 4);
      }
    }
  }

  return { TYPES, make, update, draw, pickType, waveTable };
})();

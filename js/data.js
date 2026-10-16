/* ============================================================
   data.js  —  modos, armas (com estilo de ataque único),
                fusões de armas, passivas e itens da loja
   ============================================================ */
(function () {
  const U = VS.U;
  const { TAU, rand, chance, clamp } = U;

  /* ---------- ESCALA DE STATS POR NÍVEL ---------- */
  function statsFor(def, level) {
    const b = def.stats, gr = def.grow || {}, s = Object.assign({}, b);
    s.level = level;
    s.dmg = b.dmg * (1 + (level - 1) * (gr.dmg !== undefined ? gr.dmg : 0.25));
    s.count = (b.count || 1) + Math.floor((level - 1) * (gr.count !== undefined ? gr.count : 0.34));
    if (b.cd) s.cd = Math.max(0.1, b.cd + (level - 1) * (gr.cd !== undefined ? gr.cd : -0.06));
    if (b.pierce) s.pierce = b.pierce + Math.floor((level - 1) * (gr.pierce !== undefined ? gr.pierce : 0.34));
    if (b.radius) s.radius = b.radius * (1 + (level - 1) * (gr.radius !== undefined ? gr.radius : 0.06));
    if (b.maxR) s.maxR = b.maxR * (1 + (level - 1) * (gr.maxR !== undefined ? gr.maxR : 0.1));
    return s;
  }

  /* ============================================================
     ARMAS — cada uma tem um estilo de ataque DIFERENTE
     ============================================================ */
  const WEAPONS = {

    espada: {
      id: 'espada', name: 'Espada', icon: '⚔️', color: '#e6e6f2', max: 8, passive: false,
      desc: 'Corte em arco na direção em que você olha. Rápida e barata.',
      stats: { dmg: 14, cd: 1.15, count: 1, radius: 118, arc: 1.9, knock: 200 },
      grow: { dmg: 0.32, count: 0.28, cd: -0.07, radius: 0.09 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const off = (i - (s.count - 1) / 2) * 0.34;
          g.spawnSlash({
            x: p.x, y: p.y, ang: g.aim + off, spread: s.arc,
            radius: s.radius, dmg: s.dmg, knock: s.knock, color: '#f0f0ff'
          });
        }
      }
    },

    machado: {
      id: 'machado', name: 'Machado de Guerra', icon: '🪓', color: '#c9c9dc', max: 8,
      desc: 'Lança machados que atravessam e voltam pra você. Ótimo contra grupos.',
      stats: { dmg: 18, cd: 1.5, count: 2, pierce: 2, speed: 430, range: 240 },
      grow: { dmg: 0.28, count: 0.4, cd: -0.08, pierce: 0.34, range: 0.1 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * 0.6;
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 15, dmg: s.dmg,
            color: '#cfd2e6', pierce: s.pierce, knock: 150, life: 2.4,
            boomerang: true, range: s.range, spin: 15, trail: '#8b8ea8'
          });
        }
      }
    },

    lanca: {
      id: 'lanca', name: 'Arco de Ferro', icon: '🏹', color: '#ffd97a', max: 8,
      desc: 'Flechas automáticas miradas nos inimigos mais próximos. Perfura.',
      stats: { dmg: 12, cd: 0.9, count: 1, pierce: 2, speed: 640 },
      grow: { dmg: 0.26, count: 0.5, cd: -0.06, pierce: 0.34 },
      attack(g, p, s) {
        const targets = g.nearest(p.x, p.y, s.count, 760, true);
        for (let i = 0; i < s.count; i++) {
          const t = targets[i];
          const a = t ? U.angleTo(p.x, p.y, t.x, t.y) : g.aim + (i - (s.count - 1) / 2) * 0.4;
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 9, dmg: s.dmg,
            color: '#ffe9a8', pierce: s.pierce, knock: 90, life: 1.6, trail: '#8a6a2a'
          });
        }
      }
    },

    fogo: {
      id: 'fogo', name: 'Cajado de Fogo', icon: '🔥', color: '#ff8a3c', max: 8,
      desc: 'Jatos de fogo em leque que incendeiam (dano contínuo por alguns segundos).',
      stats: { dmg: 10, cd: 1.2, count: 3, spread: 0.34, pierce: 1, speed: 340, burn: 7 },
      grow: { dmg: 0.24, count: 0.4, cd: -0.07, pierce: 0.3 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * s.spread;
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 13, dmg: s.dmg,
            color: '#ff9a4c', pierce: s.pierce, life: 1.5, knock: 60,
            burn: s.burn, trail: '#ff5a1f'
          });
        }
      }
    },

    raio: {
      id: 'raio', name: 'Bastão de Raios', icon: '⚡', color: '#ffe27a', max: 8,
      desc: 'Raios caem do céu em inimigos aleatórios e saltam para os vizinhos.',
      stats: { dmg: 26, cd: 2.2, count: 2, range: 560, chain: 1 },
      grow: { dmg: 0.3, count: 0.42, cd: -0.09, chain: 0.34 },
      attack(g, p, s) {
        const targets = g.randomEnemies(s.count, s.range);
        for (const t of targets) g.strikeLightning(t.x, t.y, s.dmg, s.chain, '#ffe27a');
      }
    },

    orbe: {
      id: 'orbe', name: 'Orbes Arcanos', icon: '🔮', color: '#8ad8ff', max: 8,
      desc: 'Esferas mágicas giram ao seu redor, empurrando tudo que encostam.',
      stats: { dmg: 9, count: 2, radius: 96, speed: 2.5, cd: 0.3 },
      grow: { dmg: 0.26, count: 0.42, radius: 0.07 },
      attack(g, p, s) {
        g.syncOrbiters(s.count, s.radius, s.speed, s.dmg, '#8ad8ff', 0.45);
      }
    },

    onda: {
      id: 'onda', name: 'Onda de Choque', icon: '🌊', color: '#7fd8ff', max: 8,
      desc: 'Anéis de energia curtos que se expandem e arremessam tudo pra longe.',
      stats: { dmg: 16, cd: 2.0, count: 1, maxR: 118, knock: 200 },
      grow: { dmg: 0.3, count: 0.3, cd: -0.08, maxR: 0.06 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnRing({
            x: p.x, y: p.y, r0: 18, r1: s.maxR, dmg: s.dmg,
            color: '#8fdcff', knock: s.knock, delay: i * 0.22, life: 0.55
          });
        }
      }
    },

    adaga: {
      id: 'adaga', name: 'Adagas Tóxicas', icon: '🗡️', color: '#a6ff6e', max: 8,
      desc: 'Adagas em todas as direções que envenenam (dano por tempo).',
      stats: { dmg: 8, cd: 1.4, count: 3, pierce: 1, speed: 400, poison: 6 },
      grow: { dmg: 0.22, count: 0.42, cd: -0.07, pierce: 0.3 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = rand(TAU);
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 10, dmg: s.dmg,
            color: '#b6ff7a', pierce: s.pierce, life: 1.1, knock: 40,
            poison: s.poison, trail: '#5f9e2a', spin: 20
          });
        }
      }
    },

    gelo: {
      id: 'gelo', name: 'Cajado Gélido', icon: '❄️', color: '#bff0ff', max: 8,
      desc: 'Estilhaços que congelam os inimigos: quase param de se mover.',
      stats: { dmg: 7, cd: 1.5, count: 2, speed: 320, slow: 0.5, slowTime: 1.7 },
      grow: { dmg: 0.2, count: 0.42, cd: -0.06, slowTime: 0.15 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = rand(TAU);
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 9, dmg: s.dmg,
            color: '#cbf6ff', pierce: 2, life: 1.2, knock: 30,
            slow: s.slow, slowTime: s.slowTime, trail: '#5fb9d6', spin: 10
          });
        }
      }
    },

    sangue: {
      id: 'sangue', name: 'Sangue Vital', icon: '🩸', color: '#ff4d6a', max: 8,
      desc: 'Pulsa e drena a vida dos inimigos por perto, curando você.',
      stats: { dmg: 8, cd: 0.9, radius: 155, heal: 0.16 },
      grow: { dmg: 0.24, cd: -0.05, radius: 0.08, heal: 0.05 },
      attack(g, p, s) {
        g.spawnDrain({
          x: p.x, y: p.y, radius: s.radius, dmg: s.dmg,
          color: '#ff5d78', heal: s.heal, life: 0.35
        });
      }
    },

    /* ---------- 10 ARMAS NOVAS (mecânicas diferentes) ---------- */

    cruz: {
      id: 'cruz', name: 'Cruz de Ferro', icon: '🔗', color: '#cfd6ff', max: 8,
      desc: 'Braços de ferro giram em volta de você raspando tudo que encosta.',
      stats: { dmg: 12, count: 2, arms: 2, radius: 92, speed: 3.6, cd: 0.25 },
      grow: { dmg: 0.26, count: 0.42, radius: 0.08, speed: 0.05 },
      attack(g, p, s) {
        g.syncSpinners(s.count, s.arms, s.radius, s.speed, s.dmg, '#cfd6ff', 0.32);
      }
    },

    laser: {
      id: 'laser', name: 'Lâmina de Luz', icon: '⚡', color: '#a9f0ff', max: 8,
      desc: 'Feixe contínuo na direção em que você olha. Atravessa a linha inteira.',
      stats: { dmg: 7, cd: 0.42, count: 1, len: 540, width: 26 },
      grow: { dmg: 0.24, cd: -0.03, len: 0.07, width: 0.08 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnBeam({
            x: p.x, y: p.y, ang: g.aim + (i - (s.count - 1) / 2) * 0.14,
            len: s.len, width: s.width, dmg: s.dmg, color: '#a9f0ff'
          });
        }
      }
    },

    espinho: {
      id: 'espinho', name: 'Espinho de Palha', icon: '🌵', color: '#a6ff6e', max: 8,
      desc: 'Finca espinhos no chão que ficam atirando sozinhos nos inimigos.',
      stats: { dmg: 12, cd: 0.9, count: 1, life: 9, speed: 460 },
      grow: { dmg: 0.26, count: 0.34, life: 0.9 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const pos = g.ringSpawn(70, 250);
          g.spawnTurret({ x: pos.x, y: pos.y, dmg: s.dmg, cd: s.cd, speed: s.speed, life: s.life, color: '#a6ff6e' });
        }
      }
    },

    meteoro: {
      id: 'meteoro', name: 'Chuva de Meteoros', icon: '☄️', color: '#ff8a3c', max: 8,
      desc: 'Meteoros caem do céu em cima dos inimigos e deixam o chão pegando fogo.',
      stats: { dmg: 42, cd: 2.3, count: 2, radius: 82, range: 540, field: 7, fieldLife: 2.4 },
      grow: { dmg: 0.32, count: 0.34, cd: -0.08, radius: 0.07 },
      attack(g, p, s) {
        const t = g.randomEnemies(s.count, s.range);
        const pts = t.length ? t : [{ x: p.x + Math.cos(g.aim) * 220, y: p.y + Math.sin(g.aim) * 220 }];
        for (const q of pts) g.spawnMeteor(q.x, q.y, s.dmg, s.radius, '#ff8a3c', { field: s.field, fieldLife: s.fieldLife });
      }
    },

    nuvem: {
      id: 'nuvem', name: 'Nuvem Tóxica', icon: '☁️', color: '#9de84f', max: 8,
      desc: 'Deixa nuvens de veneno no chão que corroem quem passar por cima.',
      stats: { dmg: 8, cd: 1.5, count: 2, radius: 100, life: 4.5, range: 500 },
      grow: { dmg: 0.22, count: 0.4, cd: -0.06, radius: 0.07 },
      attack(g, p, s) {
        const t = g.randomEnemies(s.count, s.range);
        const pts = t.length ? t : [{ x: p.x, y: p.y }];
        for (const q of pts) g.spawnCloud({ x: q.x, y: q.y, radius: s.radius, dmg: s.dmg, life: s.life, color: '#9de84f' });
      }
    },

    tornado: {
      id: 'tornado', name: 'Tornado', icon: '🌪️', color: '#cfd8ff', max: 8,
      desc: 'Vórtices que puxam os inimigos para o centro e os gira dentro deles.',
      stats: { dmg: 11, cd: 1.5, count: 1, radius: 100, pull: 260, life: 4 },
      grow: { dmg: 0.26, count: 0.3, cd: -0.06, radius: 0.08, pull: 0.1 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const pos = g.ringSpawn(90, 300);
          g.spawnTornado({ x: pos.x, y: pos.y, dmg: s.dmg, radius: s.radius, pull: s.pull, life: s.life, color: '#cfd8ff' });
        }
      }
    },

    vespa: {
      id: 'vespa', name: 'Vespa Sucata', icon: '🐝', color: '#ffe27a', max: 8,
      desc: 'Vespas de metal que perseguem o inimigo e explodem ao encostar.',
      stats: { dmg: 11, cd: 1.1, count: 3, speed: 340, boom: 46 },
      grow: { dmg: 0.24, count: 0.42, cd: -0.06 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnBullet({
            x: p.x, y: p.y, ang: g.aim + rand(-0.8, 0.8), speed: s.speed, r: 10, dmg: s.dmg,
            color: '#ffe27a', pierce: 1, life: 3, homing: 2.6, spin: 26, trail: '#c98a00',
            boom: s.boom, boomDmg: s.dmg * 0.7
          });
        }
      }
    },

    sol: {
      id: 'sol', name: 'Raios Solares', icon: '☀️', color: '#ffd76a', max: 8,
      desc: 'Pulsa de 8 raios em volta de você, como explosões de sol.',
      stats: { dmg: 17, cd: 1.8, count: 8, len: 320, width: 22 },
      grow: { dmg: 0.28, count: 0.1, cd: -0.07, len: 0.06 },
      attack(g, p, s) {
        g.spawnRays({ x: p.x, y: p.y, count: s.count, len: s.len, width: s.width, dmg: s.dmg, color: '#ffd76a' });
      }
    },

    muralha: {
      id: 'muralha', name: 'Muralha de Espinhos', icon: '🧱', color: '#8ad8ff', max: 8,
      desc: 'Levanta uma fileira de espinhos na direção em que você olha.',
      stats: { dmg: 19, cd: 1.4, count: 2, len: 330, width: 38 },
      grow: { dmg: 0.28, count: 0.34, cd: -0.07, len: 0.07 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnWall({
            x: p.x, y: p.y, ang: g.aim + (i - (s.count - 1) / 2) * 0.55,
            len: s.len, width: s.width, dmg: s.dmg, color: '#8ad8ff'
          });
        }
      }
    },

    alma: {
      id: 'alma', name: 'Alma Flamejante', icon: '👻', color: '#ff9de2', max: 8,
      desc: 'Uma aura de fogo que gruda em você e queima tudo que encosta.',
      stats: { dmg: 9, radius: 145, tick: 0.45, cd: 0.25 },
      grow: { dmg: 0.26, radius: 0.08, tick: -0.03 },
      attack(g, p, s) {
        g.syncAura(s.radius, s.dmg, s.tick, '#ff9de2');
      }
    }
  };

  /* ============================================================
     FUSÕES — desbloqueiam quando as DUAS armas chegam ao nível 3
     ============================================================ */
  const FUSIONS = {

    chama: {
      id: 'chama', name: 'Chama Ardente', icon: '🔥⚔️', color: '#ff7a2a', max: 5,
      from: ['espada', 'fogo'],
      desc: 'Corte flamejante gigante que deixa o chão pegando fogo.',
      stats: { dmg: 30, cd: 1.0, count: 1, radius: 155, arc: 2.5, field: 8, fieldLife: 3 },
      grow: { dmg: 0.34, count: 0.34, cd: -0.07, radius: 0.1 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * 0.5;
          const x = p.x + Math.cos(a) * 55, y = p.y + Math.sin(a) * 55;
          g.spawnSlash({ x, y, ang: a, spread: s.arc, radius: s.radius, dmg: s.dmg, knock: 220, color: '#ffb347' });
          g.spawnField({ x, y, radius: s.radius * 0.75, dmg: s.field, life: s.fieldLife, tick: 0.4, color: '#ff6a1f' });
        }
      }
    },

    martelo: {
      id: 'martelo', name: 'Martelo de Trovão', icon: '⛈️', color: '#ffe27a', max: 5,
      from: ['machado', 'raio'],
      desc: 'Golpe sísmico nos inimigos: dano em área + raios saltando.',
      stats: { dmg: 42, cd: 2.0, count: 2, radius: 130, chain: 2 },
      grow: { dmg: 0.36, count: 0.3, cd: -0.08, radius: 0.1 },
      attack(g, p, s) {
        const targets = g.randomEnemies(s.count, 520);
        const pts = targets.length ? targets : [{ x: p.x + Math.cos(g.aim) * 120, y: p.y + Math.sin(g.aim) * 120 }];
        for (const t of pts) {
          g.spawnBoom({ x: t.x, y: t.y, radius: s.radius, dmg: s.dmg, color: '#ffd76a', knock: 340 });
          g.strikeLightning(t.x, t.y, s.dmg * 0.4, s.chain, '#ffe27a');
          U.shake(120);
        }
      }
    },

    geada: {
      id: 'geada', name: 'Flechas Gélidas', icon: '❄️🏹', color: '#a9ecff', max: 5,
      from: ['lanca', 'gelo'],
      desc: 'Rajada de projéteis perfurantes que congelam tudo no caminho.',
      stats: { dmg: 24, cd: 0.8, count: 2, pierce: 99, speed: 700, slow: 0.7, slowTime: 2.2 },
      grow: { dmg: 0.3, count: 0.5, cd: -0.05 },
      attack(g, p, s) {
        const targets = g.nearest(p.x, p.y, s.count, 900, true);
        for (let i = 0; i < s.count; i++) {
          const t = targets[i];
          const a = t ? U.angleTo(p.x, p.y, t.x, t.y) : g.aim + rand(-0.5, 0.5);
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 11, dmg: s.dmg,
            color: '#d6f7ff', pierce: s.pierce, life: 1.5, knock: 70,
            slow: s.slow, slowTime: s.slowTime, trail: '#4aa8c8', freeze: 0.25
          });
        }
      }
    },

    drenagem: {
      id: 'drenagem', name: 'Adagas Carmesins', icon: '🩸🗡️', color: '#ff4d6a', max: 5,
      from: ['adaga', 'sangue'],
      desc: 'Adagas envenenadas que drenam vida e explodem ao acertar.',
      stats: { dmg: 20, cd: 1.1, count: 4, pierce: 3, speed: 430, poison: 8, heal: 0.1 },
      grow: { dmg: 0.28, count: 0.42, cd: -0.06, pierce: 0.34 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * 0.42 + rand(-0.15, 0.15);
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 12, dmg: s.dmg,
            color: '#ff6b83', pierce: s.pierce, life: 1.3, knock: 90,
            poison: s.poison, lifesteal: s.heal, trail: '#8e1b3a', spin: 22,
            boom: 46, boomDmg: s.dmg * 0.6
          });
        }
      }
    },

    tempestade: {
      id: 'tempestade', name: 'Orbes de Tempestade', icon: '⚡🔮', color: '#bff0ff', max: 5,
      from: ['orbe', 'raio'],
      desc: 'Orbes que giram e disparam raios em cadeia nos inimigos.',
      stats: { dmg: 16, count: 3, radius: 104, speed: 3.1, cd: 0.45, chain: 2, zapCd: 1.1, zapDmg: 18 },
      grow: { dmg: 0.28, count: 0.42, radius: 0.07, zapDmg: 0.3 },
      attack(g, p, s) {
        g.syncOrbiters(s.count, s.radius, s.speed, s.dmg, '#a9ecff', 0.4);
        g.zapFromOrbiters(s.zapDmg, s.chain);
      }
    },

    inferno: {
      id: 'inferno', name: 'Ondas Infernais', icon: '🌋', color: '#ff5a1f', max: 5,
      from: ['onda', 'fogo'],
      desc: 'Anéis de lava que se expandem queimando o chão por onde passam.',
      stats: { dmg: 28, cd: 1.7, count: 1, maxR: 140, field: 9, fieldLife: 3.5, knock: 200 },
      grow: { dmg: 0.34, count: 0.34, cd: -0.07, maxR: 0.07 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnRing({
            x: p.x, y: p.y, r0: 20, r1: s.maxR, dmg: s.dmg,
            color: '#ff7a2a', knock: s.knock, delay: i * 0.25, life: 0.6,
            field: s.field, fieldLife: s.fieldLife, fieldR: 46
          });
        }
      }
    },

    ceifa: {
      id: 'ceifa', name: 'Ceifa Carmesim', icon: '🩸⚔️', color: '#c9184a', max: 5,
      from: ['espada', 'sangue'],
      desc: 'Corte de 360° que atinge tudo ao redor e devolve vida.',
      stats: { dmg: 26, cd: 1.3, count: 1, radius: 185, heal: 0.18, bleed: 6 },
      grow: { dmg: 0.32, count: 0.34, cd: -0.07, radius: 0.12 },
      attack(g, p, s) {
        g.spawnSlash({
          x: p.x, y: p.y, ang: g.aim, spread: TAU, radius: s.radius,
          dmg: s.dmg, knock: 300, color: '#ff2e63', lifesteal: s.heal, poison: s.bleed, full: true
        });
      }
    },

    incendio: {
      id: 'incendio', name: 'Machados em Chamas', icon: '🔥🪓', color: '#ff8a3c', max: 5,
      from: ['machado', 'fogo'],
      desc: 'Machados que voltam voando deixando rastros de fogo pelo caminho.',
      stats: { dmg: 30, cd: 1.6, count: 3, pierce: 5, speed: 420, range: 270, field: 7, fieldLife: 2.2 },
      grow: { dmg: 0.3, count: 0.42, cd: -0.07, pierce: 0.34 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * 0.5;
          g.spawnBullet({
            x: p.x, y: p.y, ang: a, speed: s.speed, r: 17, dmg: s.dmg,
            color: '#ffb347', pierce: s.pierce, knock: 180, life: 2.6,
            boomerang: true, range: s.range, spin: 16, trail: '#ff5a1f',
            field: s.field, fieldLife: s.fieldLife, fieldR: 34
          });
        }
      }
    },

    onda_trovao: {
      id: 'onda_trovao', name: 'Onda Trovejante', icon: '⚡🌊', color: '#8ad8ff', max: 5,
      from: ['onda', 'raio'],
      desc: 'Onda de choque carregada: eletrifica e deixa os inimigos lentos.',
      stats: { dmg: 26, cd: 2.2, count: 1, maxR: 130, knock: 230, slow: 0.45, slowTime: 2.5, chain: 2 },
      grow: { dmg: 0.32, count: 0.34, cd: -0.08, maxR: 0.07 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const r = g.spawnRing({
            x: p.x, y: p.y, r0: 20, r1: s.maxR, dmg: s.dmg,
            color: '#a9ecff', knock: s.knock, delay: i * 0.25, life: 0.6,
            slow: s.slow, slowTime: s.slowTime
          });
          if (r) r.chain = s.chain;
        }
        g.strikeLightning(p.x, p.y, s.dmg * 0.3, s.chain, '#ffe27a');
      }
    },

    /* ---------- 6 FUSÕES NOVAS (misturam as armas novas) ---------- */

    bastiao: {
      id: 'bastiao', name: 'Bastião de Ferro', icon: '🧱🔗', color: '#8ad8ff', max: 5,
      from: ['espinho', 'muralha'],
      desc: 'Ergue uma muralha de lâminas com espinhos que atiram atrás dela.',
      stats: { dmg: 26, cd: 1.6, count: 3, len: 380, width: 46, turretDmg: 18, life: 8 },
      grow: { dmg: 0.3, count: 0.3, cd: -0.07, len: 0.07 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const a = g.aim + (i - (s.count - 1) / 2) * 0.5;
          g.spawnWall({ x: p.x, y: p.y, ang: a, len: s.len, width: s.width, dmg: s.dmg, color: '#8ad8ff' });
          const d = 120;
          g.spawnTurret({
            x: clamp(p.x + Math.cos(a) * d, 40, g.roomW - 40),
            y: clamp(p.y + Math.sin(a) * d, 40, g.roomH - 40),
            dmg: s.turretDmg, cd: 0.7, speed: 500, life: s.life, color: '#a6ff6e'
          });
        }
      }
    },

    colapso: {
      id: 'colapso', name: 'Colapso Estelar', icon: '☄️💫', color: '#ff5a1f', max: 5,
      from: ['meteoro', 'alma'],
      desc: 'Meteoro colossal com uma aura de tempestade estelar em volta.',
      stats: { dmg: 62, cd: 2.6, count: 3, radius: 130, range: 620, field: 9, fieldLife: 3, aura: 14, auraR: 190 },
      grow: { dmg: 0.36, count: 0.3, cd: -0.09, radius: 0.08 },
      attack(g, p, s) {
        g.syncAura(s.auraR, s.aura, 0.45, '#ffb347');
        const t = g.randomEnemies(s.count, s.range);
        const pts = t.length ? t : [{ x: p.x, y: p.y }];
        for (const q of pts) {
          g.spawnMeteor(q.x, q.y, s.dmg, s.radius, '#ffd76a', { field: s.field, fieldLife: s.fieldLife });
        }
      }
    },

    ciclone: {
      id: 'ciclone', name: 'Ciclone Tóxico', icon: '🌪️☁️', color: '#9de84f', max: 5,
      from: ['tornado', 'nuvem'],
      desc: 'Tornados que deixam um rastro de nuvem venenosa pelo caminho.',
      stats: { dmg: 14, cd: 1.5, count: 2, radius: 120, pull: 300, life: 5.5, cloud: 9, cloudR: 96 },
      grow: { dmg: 0.28, count: 0.34, cd: -0.06, radius: 0.08 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          const pos = g.ringSpawn(90, 320);
          g.spawnTornado({
            x: pos.x, y: pos.y, dmg: s.dmg, radius: s.radius, pull: s.pull, life: s.life,
            color: '#9de84f', trail: { dmg: s.cloud, radius: s.cloudR, every: 0.45 }
          });
        }
      }
    },

    enxame: {
      id: 'enxame', name: 'Enxame de Vespa', icon: '🐝☁️', color: '#ffe27a', max: 5,
      from: ['vespa', 'nuvem'],
      desc: 'Vespa em bando: cada uma solta uma nuvem venenosa ao explodir.',
      stats: { dmg: 14, cd: 1.0, count: 4, speed: 360, boom: 58, cloud: 7 },
      grow: { dmg: 0.26, count: 0.42, cd: -0.06 },
      attack(g, p, s) {
        for (let i = 0; i < s.count; i++) {
          g.spawnBullet({
            x: p.x, y: p.y, ang: g.aim + rand(-0.9, 0.9), speed: s.speed, r: 11, dmg: s.dmg,
            color: '#ffe27a', pierce: 1, life: 3, homing: 3.2, spin: 28, trail: '#c98a00',
            boom: s.boom, boomDmg: s.dmg * 0.6,
            field: s.cloud, fieldR: 62, fieldLife: 2
          });
        }
      }
    },

    eclipse: {
      id: 'eclipse', name: 'Eclipse Total', icon: '☀️⚡', color: '#fff3b0', max: 5,
      from: ['sol', 'laser'],
      desc: 'O sol some e deixa 16 raios de luz varreduraendo a sala inteira.',
      stats: { dmg: 22, cd: 1.5, count: 16, len: 420, width: 26, beamDmg: 9 },
      grow: { dmg: 0.3, count: 0.08, cd: -0.07, len: 0.06 },
      attack(g, p, s) {
        g.spawnRays({ x: p.x, y: p.y, count: s.count, len: s.len, width: s.width, dmg: s.dmg, color: '#fff3b0' });
        g.spawnBeam({ x: p.x, y: p.y, ang: g.aim, len: s.len * 1.6, width: s.width * 1.6, dmg: s.beamDmg, color: '#ffffff' });
      }
    },

    serra: {
      id: 'serra', name: 'Serra Rotativa', icon: '🔗🪓', color: '#cfd6ff', max: 5,
      from: ['cruz', 'machado'],
      desc: 'Lâminas cruzadas que giram e ainda devolvem machados girando pra você.',
      stats: { dmg: 16, count: 3, arms: 4, radius: 108, speed: 4.4, cd: 0.22, axeDmg: 20, axeCount: 2 },
      grow: { dmg: 0.28, count: 0.36, radius: 0.08, speed: 0.05 },
      attack(g, p, s) {
        g.syncSpinners(s.count, s.arms, s.radius, s.speed, s.dmg, '#cfd6ff', 0.3);
        for (let i = 0; i < s.axeCount; i++) {
          g.spawnBullet({
            x: p.x, y: p.y, ang: g.aim + (i - (s.axeCount - 1) / 2) * 0.7,
            speed: 450, r: 16, dmg: s.axeDmg, color: '#e6e6f2', pierce: 4,
            life: 2.4, boomerang: true, range: 260, spin: 16, trail: '#8b8ea8'
          });
        }
      }
    }
  };

  /* ============================================================
     PASSIVAS (ganhas ao subir de nível)
     ============================================================ */
  const PASSIVES = {
    forca: { id: 'forca', name: 'Força', icon: '💪', max: 5, desc: '+12% de dano em todas as armas', color: '#ff8a3c' },
    vida: { id: 'vida', name: 'Vitalidade', icon: '❤️', max: 5, desc: '+20 de vida máxima', color: '#ff4d6a' },
    velo: { id: 'velo', name: 'Agilidade', icon: '👟', max: 5, desc: '+7% de velocidade de movimento', color: '#63e6a0' },
    armadura: { id: 'armadura', name: 'Armadura', icon: '🛡️', max: 4, desc: 'Recebe 1 a menos de dano por golpe', color: '#8ad8ff' },
    magnet: { id: 'magnet', name: 'Magnetismo', icon: '🧲', max: 5, desc: '+30% para pegar gemas e baús', color: '#b14bff' },
    sorte: { id: 'sorte', name: 'Sorte', icon: '🍀', max: 5, desc: '+10% de sorte: mais gemas, baús melhores', color: '#ffcc4d' },
    crit: { id: 'crit', name: 'Poder Fatal', icon: '🎯', max: 5, desc: '+6% de chance crítica (dano x2.2)', color: '#ffd97a' },

    /* ---- passivas novas (usam o campo "per", somado junto das relíquias) ---- */
    cadencia: {
      id: 'cadencia', name: 'Cadência', icon: '⏱️', max: 5, color: '#ffd97a',
      desc: '-8% no tempo de recarga de todas as armas',
      per: { haste: 0.08 }
    },
    alcance: {
      id: 'alcance', name: 'Alcance', icon: '🔭', max: 5, color: '#8ad8ff',
      desc: '+14% no tamanho de todas as áreas de dano',
      per: { range: 0.14 }
    },
    vampiro: {
      id: 'vampiro', name: 'Vampirismo', icon: '🧛', max: 5, color: '#ff4d6a',
      desc: 'Recupera 3% da vida máxima a cada abate',
      per: { healKill: 0.03 }
    },
    explosao: {
      id: 'explosao', name: 'Reação em Cadeia', icon: '💣', max: 3, color: '#ff8a3c',
      desc: 'Inimigos que você mata explodem e pega quem estiver perto',
      per: { boom: 1 }
    },
    queima: {
      id: 'queima', name: 'Incêndio', icon: '🔥', max: 5, color: '#ff5a1f',
      desc: 'Todo dano que você causa passa a queimar',
      per: { burn: 3 }
    },
    experiencia: {
      id: 'experiencia', name: 'Memória', icon: '📚', max: 5, color: '#63e6a0',
      desc: '+18% de experiência em tudo que você coleta',
      per: { xp: 0.18 }
    }
  };

  /* ============================================================
     RELÍQUIAS — achadas em pedestais dentro das salas.
     Cada uma tem uma FUNÇÃO de verdade (campo "per"),
     somada junto com as passivas e com o personagem.
     ============================================================ */
  const RELIC_CHANCE = 0.34;          /* chance de ter relíquia numa sala normal */

  const RELICS = {
    basalto: {
      id: 'basalto', name: 'Coração de Basalto', icon: '🪨', file: 'relic_01', color: '#8ad8ff',
      desc: '+45 de vida máxima', per: { hp: 45 }
    },
    navalha: {
      id: 'navalha', name: 'Fio de Navalha', icon: '⚔️', file: 'relic_02', color: '#e6e6f2',
      desc: '+18% de dano em todas as armas', per: { power: 0.18 }
    },
    cinzas: {
      id: 'cinzas', name: 'Cinzas Quentes', icon: '🔥', file: 'relic_03', color: '#ff5a1f',
      desc: 'Seu dano passa a INCENDIAR (queimadura)', per: { burn: 4 }
    },
    eternal: {
      id: 'eternal', name: 'Gelo Eterno', icon: '❄️', file: 'relic_04', color: '#bff0ff',
      desc: 'Seu dano passa a CONGELAR os inimigos', per: { freeze: 0.3 }
    },
    placa: {
      id: 'placa', name: 'Placa de Ferro', icon: '🛡️', file: 'relic_05', color: '#8ad8ff',
      desc: '+3 de armadura (você aguenta mais golpe)', per: { armor: 3 }
    },
    coturno: {
      id: 'coturno', name: 'Coturno Leve', icon: '👟', file: 'relic_06', color: '#63e6a0',
      desc: '+20% de velocidade de movimento', per: { speed: 0.2 }
    },
    optica: {
      id: 'optica', name: 'Óptica Perfeita', icon: '🎯', file: 'relic_07', color: '#ffd97a',
      desc: '+20% de chance crítica', per: { crit: 0.2 }
    },
    imantado: {
      id: 'imantado', name: 'Núcleo Imantado', icon: '🧲', file: 'relic_08', color: '#b14bff',
      desc: '+100% de alcance do ímã de XP', per: { magnet: 1 }
    },
    trevo: {
      id: 'trevo', name: 'Trevo de Ouro', icon: '🍀', file: 'relic_09', color: '#ffcc4d',
      desc: '+3 de sorte (mais gemas, baús melhores)', per: { luck: 3 }
    },
    ampulheta: {
      id: 'ampulheta', name: 'Ampulheta de Elã', icon: '⏳', file: 'relic_10', color: '#ffe27a',
      desc: '+16% de velocidade de recarga das armas', per: { haste: 0.16 }
    },
    polvora: {
      id: 'polvora', name: 'Pólvora Compacta', icon: '💣', file: 'relic_11', color: '#ff8a3c',
      desc: 'Todo inimigo que você mata EXPLODE', per: { boom: 1 }
    },
    presa: {
      id: 'presa', name: 'Presa de Vampiro', icon: '🩸', file: 'relic_12', color: '#ff4d6a',
      desc: 'Recupera 4% da vida a cada abate', per: { healKill: 0.04 }
    },
    tomo: {
      id: 'tomo', name: 'Tomo da Sabedoria', icon: '📜', file: 'relic_13', color: '#63e6a0',
      desc: '+25% de experiência', per: { xp: 0.25 }
    },
    bolsa: {
      id: 'bolsa', name: 'Bolsa Pesada', icon: '🪙', file: 'relic_14', color: '#ffcc4d',
      desc: '+30% de moedas em toda a partida', per: { coin: 0.3 }
    },
    corneta: {
      id: 'corneta', name: 'Corneta do Écho', icon: '📢', file: 'relic_15', color: '#a9ecff',
      desc: '+30% no tamanho de todas as áreas', per: { range: 0.3 }
    },
    relogio: {
      id: 'relogio', name: 'Relógio Quebrado', icon: '⏱️', file: 'relic_16', color: '#cfd8ff',
      desc: 'O tempo das ondas desacelera: inimigos chegam 35% mais devagar', per: { slowWave: 0.35 }
    },
    espelho: {
      id: 'espelho', name: 'Espelho Maldito', icon: '🪞', file: 'relic_17', color: '#ff9de2',
      desc: '+1 renascer por partida', per: { revive: 1 }
    },
    coroa: {
      id: 'coroa', name: 'Coroa de Lava', icon: '🌋', file: 'relic_18', color: '#ff5a1f',
      desc: '+1 slot de arma na partida', per: { slots: 1 }
    },
    cristal: {
      id: 'cristal', name: 'Cristal Eterno', icon: '💎', file: 'relic_19', color: '#63b3ff',
      desc: '+45% de gemas no fim da partida', per: { gem: 0.45 }
    },
    trono: {
      id: 'trono', name: 'Trono do Rei', icon: '👑', file: 'relic_20', color: '#ffcc4d',
      desc: 'Melhora TODAS as habilidades de uma vez',
      per: {
        hp: 60, power: 0.25, speed: 0.12, haste: 0.1, crit: 0.12, armor: 2,
        luck: 1, magnet: 0.35, xp: 0.2, coin: 0.2, gem: 0.2
      }
    }
  };

  function allRelics() { return Object.values(RELICS); }
  function relic(id) { return RELICS[id] || null; }

  /* ============================================================
     MODOS DE JOGO
     fases = quantas fases o modo tem (0 = salas infinitas)
     ============================================================ */
  const MODES = {
    facil: {
      id: 'facil', name: 'Fácil', icon: '🌱',
      desc: '5 fases de 7 a 9 salas. Poucos inimigos, mais vida, mais moedas e mais gemas.',
      hp: 0.55, speed: 0.82, dmg: 0.5, rate: 0.55, xp: 1.5, coin: 1.5, gem: 1.6,
      startHp: 160, waveTime: 26, startLevel: 2, goldStart: 60, fases: 5
    },
    infinito: {
      id: 'infinito', name: 'Infinito', icon: '♾️',
      desc: 'Salas infinitas: a pressão sobe sem parar. Sobreviva o máximo possível.',
      hp: 1, speed: 1, dmg: 1, rate: 1, xp: 1, coin: 1, gem: 1,
      startHp: 100, waveTime: 30, startLevel: 1, goldStart: 0, fases: 0
    },
    dificil: {
      id: 'dificil', name: 'Difícil', icon: '💀',
      desc: 'Salas infinitas e cheias de hordas. Inimigos rápidos e fortes. Recompensa dobrada.',
      hp: 1.6, speed: 1.1, dmg: 1.5, rate: 1.35, xp: 1.25, coin: 1.25, gem: 1.35,
      startHp: 110, waveTime: 23, startLevel: 1, goldStart: 0, fases: 0
    },
    hardcore: {
      id: 'hardcore', name: 'Hardcore', icon: '🧱',
      desc: 'MUNDO SALVO: você fecha o jogo e continua de onde parou, como no Minecraft. Se morrer, perde o mundo inteiro.',
      hp: 1.15, speed: 1, dmg: 1.1, rate: 1, xp: 1, coin: 1, gem: 1,
      startHp: 100, waveTime: 28, startLevel: 1, goldStart: 0, fases: 0,
      hardcore: true, noRevive: true
    }
  };

  /* ============================================================
     MUNDO HARDCORE — igual mundo do Minecraft: tem nome, tem
     "dia" (quantas vezes você entrou) e é salvo em disco.
     ============================================================ */
  const WORLD_NAMES = [
    'Vale das Sombras', 'Mundo Cinza', 'Ilha Perdida', 'Reino do Vazio',
    'Caverna Fundo', 'Planície Morta', 'Ruínas Antigas', 'Abismo Profundo',
    'Terra Esquecida', 'Fortaleza de Pedra', 'Campo Seco', 'Várzea Sombria'
  ];
  const WORLD = { saveKey: 'vs2d_world_v1', diasMin: 1 };

  /* ============================================================
     SKINS — a aparência do personagem. Cada personagem comprado
     libera a skin dele; as extras se compram com gemas.
     (campo "per" = bônus opcional da skin)
     ============================================================ */
  const SKINS = {
    viajante: {
      id: 'viajante', name: 'Viajante', icon: '🧭', char: 'viajante', custo: 0,
      cor: '#b98cff', cor2: '#6a3fa0',
      desc: 'A pele original do Viajante.'
    },
    mercador: {
      id: 'mercador', name: 'Pele do Mercador', icon: '💰', char: 'mercador', custo: 0,
      cor: '#ffcc4d', cor2: '#b07a1a',
      desc: 'Dourado de parafusos. Vem junto com o personagem.'
    },
    cacadora: {
      id: 'cacadora', name: 'Pele da Caçadora', icon: '🏹', char: 'cacadora', custo: 0,
      cor: '#ffd97a', cor2: '#8a6a2a', per: { crit: 0.03 },
      desc: 'Amarelo de caça: +3% de crítico.'
    },
    ladina: {
      id: 'ladina', name: 'Pele da Ladina', icon: '🗡️', char: 'ladina', custo: 0,
      cor: '#a6ff6e', cor2: '#3f7a28',
      desc: 'Verde-limo de quem anda no escuro.'
    },
    piromante: {
      id: 'piromante', name: 'Pele do Piromante', icon: '🔥', char: 'piromante', custo: 0,
      cor: '#ff8a3c', cor2: '#8a2f0f', per: { burn: 1.5 },
      desc: 'Laranja de brasa: seu dano queima um pouco.'
    },
    glaciador: {
      id: 'glaciador', name: 'Pele do Glaciador', icon: '❄️', char: 'glaciador', custo: 0,
      cor: '#bff0ff', cor2: '#3f7a96', per: { freeze: 0.15 },
      desc: 'Azul de gelo: seu dano congela um pouco.'
    },
    mare: {
      id: 'mare', name: 'Pele da Mareada', icon: '🌊', char: 'mare', custo: 0,
      cor: '#7fd8ff', cor2: '#1f6a96', per: { range: 0.08 },
      desc: 'Azul-marinho: +8% de área.'
    },
    oraculo: {
      id: 'oraculo', name: 'Pele do Oráculo', icon: '🔮', char: 'oraculo', custo: 0,
      cor: '#8ad8ff', cor2: '#4a2a96', per: { luck: 1 },
      desc: 'Roxo de vidente: +1 de sorte.'
    },
    vampira: {
      id: 'vampira', name: 'Pele da Vampira', icon: '🧛', char: 'vampira', custo: 0,
      cor: '#ff4d6a', cor2: '#6e0f24', per: { healKill: 0.01 },
      desc: 'Carmesim: cura 1% da vida a cada abate.'
    },
    tempestario: {
      id: 'tempestario', name: 'Pele do Tempestário', icon: '⚡', char: 'tempestario', custo: 0,
      cor: '#ffe27a', cor2: '#a08a20', per: { haste: 0.05 },
      desc: 'Amarelo-relâmpago: -5% de recarga.'
    },
    arquiteto: {
      id: 'arquiteto', name: 'Pele do Arquiteto', icon: '🏛️', char: 'arquiteto', custo: 0,
      cor: '#c9a173', cor2: '#6b4a2a', per: { slots: 0 },
      desc: 'Pedra e madeira de quem constrói salas.'
    },
    alquimista: {
      id: 'alquimista', name: 'Pele do Alquimista', icon: '⚗️', char: 'alquimista', custo: 0,
      cor: '#4ec9a0', cor2: '#1f6b52',
      desc: 'Verde-poção de laboratório.'
    },
    tecelao: {
      id: 'tecelao', name: 'Pele do Tecelão', icon: '🌀', char: 'tecelao', custo: 0,
      cor: '#b14bff', cor2: '#4a0f8a', per: { power: 0.05 },
      desc: 'Roxo do caos: +5% de dano.'
    },
    god: {
      id: 'god', name: 'Pele do GOD', icon: '👑', char: 'god', custo: 0,
      cor: '#ffcc4d', cor2: '#7a4a00', per: { gem: 0.1 },
      desc: 'Ouro absoluto: +10% de gemas no fim.'
    },

    /* ---- skins extras, só compradas com gemas ---- */
    sangrento: {
      id: 'sangrento', name: 'Carmesim Profundo', icon: '🩸', custo: 300,
      cor: '#c9184a', cor2: '#4a0518', per: { crit: 0.08 },
      desc: 'Vermelho escuro de quem matou muito: +8% de crítico.'
    },
    esqueleto: {
      id: 'esqueleto', name: 'Osso Antigo', icon: '💀', custo: 350,
      cor: '#e8e4d4', cor2: '#8a8676', per: { armor: 1 },
      desc: 'Osso branco: +1 de armadura.'
    },
    gelo: {
      id: 'gelo', name: 'Gelo Eterno', icon: '❄️', custo: 500,
      cor: '#9fe8ff', cor2: '#2f6a96', per: { freeze: 0.25 },
      desc: 'Azul gelado: seu dano congela mais forte.'
    },
    lava: {
      id: 'lava', name: 'Lava Viva', icon: '🌋', custo: 500,
      cor: '#ff5a1f', cor2: '#6e1400', per: { burn: 2.5 },
      desc: 'Vermelho incandescente: seu dano queima mais forte.'
    },
    dourado: {
      id: 'dourado', name: 'Pele de Ouro', icon: '🌟', custo: 420,
      cor: '#ffe27a', cor2: '#a07a00', per: { gem: 0.12, xp: 0.05 },
      desc: 'Ouro maciço: +12% de gemas e +5% de XP.'
    },
    arcoiris: {
      id: 'arcoiris', name: 'Arco-Íris', icon: '🌈', custo: 900,
      cor: '#ff6a6a', cor2: '#4a6aff', per: { luck: 2 },
      desc: 'Muda de cor a cada passo: +2 de sorte.'
    },
    vazio: {
      id: 'vazio', name: 'Vazio do Fim', icon: '🕳️', custo: 1400,
      cor: '#2a1a3a', cor2: '#000000', per: { power: 0.12, hp: 60 },
      desc: 'A skin mais cara: +12% de dano e +60 de vida.'
    }
  };

  function allSkins() { return Object.values(SKINS); }
  function skin(id) { return SKINS[id] || SKINS.viajante; }
  /* skins extras: nao vem de nenhum personagem, entao ja nascem liberadas */
  function freeSkins() {
    const out = ['viajante'];
    for (const s of allSkins()) if (!s.char) out.push(s.id);
    return out;
  }

  /* ============================================================
     SALA BONUS — 5% de chance de trocar uma sala por ela
     ============================================================ */
  /* a partir desta sala tem chefe em TODA fase (a ultima sala tem o chefe forte) */
  const BOSS_ROOM = 5;

  const SETEC = {
    chance: 0.05,
    name: 'SALA SETEC',
    tag: '🔐 007',
    chestsMin: 6, chestsMax: 10,
    freeChests: 3
  };

  /* ============================================================
     ARENAS — o desenho de cada sala. A arena 'plano' e a de sempre
     (vazia, so o chao decorado); as outras tem obstaculos:
     paredes, blocos, pilares e aneis.

     Campos:
       id/nome/tag  o que aparece no banner e na marca d'agua
       obs          obstaculos a espalhar: circle, rect, ring, grid
       rateMul      multiplica o orcamento de inimigos da sala
       chestMul     multiplica os baus da sala
       floor        as duas cores do chao decorado
     ============================================================ */
  const ARENAS = {
    plano: {
      id: 'plano', nome: 'Campo Aberto', tag: '', obs: [], rateMul: 1, chestMul: 1, floor: ['#241a38', '#1c1430']
    },
    pilares: {
      id: 'pilares', nome: 'Dos Pilares', tag: 'PILARES', rateMul: 1.05, chestMul: 1,
      floor: ['#241a38', '#1c1430'],
      obs: [{ kind: 'circle', r: [34, 62], color: '#3b2b52' }]
    },
    paredes: {
      id: 'paredes', nome: 'Labirinto', tag: 'LABIRINTO', rateMul: 1.12, chestMul: 1,
      floor: ['#1e2338', '#161a2a'],
      obs: [{ kind: 'rect', hw: [90, 210], hh: [16, 26], color: '#39415e' }]
    },
    colunas: {
      id: 'colunas', nome: 'Das Colunas', tag: 'COLUNAS', rateMul: 1.1, chestMul: 1,
      floor: ['#26202e', '#1c1724'],
      obs: [
        { kind: 'circle', r: [26, 40], color: '#4a3550' },
        { kind: 'rect', hw: [40, 70], hh: [40, 70], color: '#463050' }
      ]
    },
    anel: {
      id: 'anel', nome: 'O Anel', tag: 'ANEL', rateMul: 1.18, chestMul: 1,
      floor: ['#2a1c30', '#201624'],
      obs: [{ kind: 'arc', r: [300, 420], bloco: [26, 40], vaos: 2, color: '#4a2f52' }]
    },
    xadrez: {
      id: 'xadrez', nome: 'Xadrez', tag: 'XADREZ', rateMul: 1.2, chestMul: 1,
      floor: ['#201c30', '#18142a'],
      obs: [{ kind: 'grid', step: [210, 280], hw: [50, 72], hh: [50, 72], color: '#453a5c' }]
    },
    arena: {
      id: 'arena', nome: 'Arena', tag: 'ARENA', rateMul: 1.35, chestMul: 2,
      floor: ['#2e1a24', '#24141c'],
      obs: [{ kind: 'arc', r: [250, 330], bloco: [28, 42], vaos: 3, color: '#6a3a44' }]
    }
  };

  /* a arena padrao e o que sobra quando nada e sorteado */
  const ARENA_PADRAO = 'plano';
  /* chance de uma sala NAO ser a de campo aberto */
  const ARENA_CHANCE = 0.55;

  /* ============================================================
     PERSONAGENS — cada um destrava UMA arma a mais pra usar.
     req = como destrava  |  cost = gemas pra comprar depois
     ============================================================ */
  const CHARACTERS = {
    viajante: {
      id: 'viajante', name: 'Viajante', icon: '🧭', color: '#b98cff', cost: 0,
      weapon: 'espada', extra: 'machado', bonus: {},
      desc: 'O primeiro personagem. Equilibrado em tudo e começa com Espada + Machado.'
    },
    mercador: {
      id: 'mercador', name: 'Mercador', icon: '💰', color: '#ffcc4d', cost: 150,
      weapon: 'machado', req: { rooms: 3 },
      bonus: { sorte: 2, coin: 0.25 },
      desc: '+2 de sorte e +25% de moedas. Destrava o Machado de Guerra.'
    },
    cacadora: {
      id: 'cacadora', name: 'Caçadora', icon: '🏹', color: '#ffd97a', cost: 200,
      weapon: 'lanca', req: { rooms: 5 },
      bonus: { speed: 0.12, crit: 0.1 },
      desc: 'Mais rápida e mais crítica. Destrava o Arco de Ferro.'
    },
    ladina: {
      id: 'ladina', name: 'Ladina', icon: '🗡️', color: '#a6ff6e', cost: 220,
      weapon: 'adaga', req: { chests: 8 },
      bonus: { speed: 0.15, crit: 0.05 },
      desc: 'Muito veloz. Destrava as Adagas Tóxicas.'
    },
    piromante: {
      id: 'piromante', name: 'Piromante', icon: '🔥', color: '#ff8a3c', cost: 260,
      weapon: 'fogo', req: { phases: 1 },
      bonus: { power: 0.2, hp: 40 },
      desc: 'Bônus de dano e um pouco mais de vida. Destrava o Cajado de Fogo.'
    },
    glaciador: {
      id: 'glaciador', name: 'Glaciador', icon: '❄️', color: '#bff0ff', cost: 280,
      weapon: 'gelo', req: { level: 8 },
      bonus: { hp: 60, armor: 2 },
      desc: 'Mais vida e armadura. Destrava o Cajado Gélido.'
    },
    mare: {
      id: 'mare', name: 'Mareada', icon: '🌊', color: '#7fd8ff', cost: 300,
      weapon: 'onda', req: { chests: 18 },
      bonus: { power: 0.15, armor: 1 },
      desc: 'Dano e defesa. Destrava a Onda de Choque.'
    },
    oraculo: {
      id: 'oraculo', name: 'Oráculo', icon: '🔮', color: '#8ad8ff', cost: 340,
      weapon: 'orbe', req: { rooms: 12 },
      bonus: { luck: 3, magnet: 0.7 },
      desc: 'Sorte e magnetismo. Destrava os Orbes Arcanos.'
    },
    vampira: {
      id: 'vampira', name: 'Vampira', icon: '🧛', color: '#ff4d6a', cost: 380,
      weapon: 'sangue', req: { bosses: 2 },
      bonus: { crit: 0.2, hp: 50 },
      desc: 'Crítica altíssima. Destrava o Sangue Vital.'
    },
    tempestario: {
      id: 'tempestario', name: 'Tempestário', icon: '⚡', color: '#ffe27a', cost: 420,
      weapon: 'raio', req: { level: 20 },
      bonus: { power: 0.25, haste: 0.18 },
      desc: 'Mais dano e ataques 18% mais rápidos. Destrava o Bastão de Raios.'
    },
    arquiteto: {
      id: 'arquiteto', name: 'Arquiteto', icon: '🏛️', color: '#c9a173', cost: 460,
      weapon: 'martelo', req: { fusions: 2 },
      bonus: { power: 0.3, slots: 1 },
      desc: '+1 slot de arma. Destrava o Martelo de Trovão.'
    },
    alquimista: {
      id: 'alquimista', name: 'Alquimista', icon: '⚗️', color: '#4ec9a0', cost: 520,
      weapon: 'incendio', req: { fusions: 4 },
      bonus: { power: 0.35, haste: 0.2, hp: 60 },
      desc: 'Dano, recarga e vida. Destrava os Machados em Chamas.'
    },
    tecelao: {
      id: 'tecelao', name: 'Tecelão do Caos', icon: '🌀', color: '#b14bff', cost: 620,
      weapon: 'inferno', req: { fusions: 6 },
      bonus: { power: 0.4, armor: 3, speed: 0.15 },
      desc: 'O mais forte de todos. Destrava as Ondas Infernais.'
    },
    god: {
      id: 'god', name: 'GOD', icon: '👑', color: '#ffcc4d', cost: 0,
      god: true, codeOnly: true, weapon: null, allWeapons: true, startLevel: 3,
      bonus: {
        hp: 200, speed: 0.2, power: 0.6, luck: 5, crit: 0.4, armor: 8,
        magnet: 1, coin: 0.6, haste: 0.3, xp: 0.4, revive: 3, slots: 2
      },
      desc: 'TODAS as habilidades ligadas e TODAS as armas liberadas (20 armas + 15 fusões). Já entra com os slots cheios. Só pelo código 2026.'
    }
  };

  /* texto do requisito (tela de personagens) */
  function reqText(req) {
    if (!req) return '';
    if (req.rooms) return 'Limpe ' + req.rooms + (req.rooms > 1 ? ' salas' : ' sala');
    if (req.chests) return 'Abra ' + req.chests + (req.chests > 1 ? ' baús' : ' baú');
    if (req.fusions) return 'Crie ' + req.fusions + (req.fusions > 1 ? ' fusões' : ' fusão');
    if (req.bosses) return 'Derrote ' + req.bosses + (req.bosses > 1 ? ' chefes' : ' chefe');
    if (req.phases) return 'Termine ' + req.phases + (req.phases > 1 ? ' fases' : ' fase');
    if (req.level) return 'Chegue ao nível ' + req.level;
    return '';
  }

  function meets(req, st, level) {
    if (!req) return false;
    if (req.rooms && (st.rooms || 0) < req.rooms) return false;
    if (req.chests && (st.chests || 0) < req.chests) return false;
    if (req.fusions && (st.fusions || 0) < req.fusions) return false;
    if (req.bosses && (st.bosses || 0) < req.bosses) return false;
    if (req.phases && (st.phases || 0) < req.phases) return false;
    if (req.level && (level || 0) < req.level) return false;
    return true;
  }

/* quanto o bonus do personagem te da, em texto curto */
function bonusText(b) {
    if (!b) return '';
    const t = [];
    if (b.hp) t.push('+' + b.hp + ' vida');
    if (b.power) t.push('+' + Math.round(b.power * 100) + '% dano');
    if (b.speed) t.push('+' + Math.round(b.speed * 100) + '% velocidade');
    if (b.haste) t.push('-' + Math.round(b.haste * 100) + '% recarga');
    if (b.crit) t.push('+' + Math.round(b.crit * 100) + '% crítico');
    if (b.armor) t.push('+' + b.armor + ' armadura');
    if (b.luck) t.push('+' + b.luck + ' sorte');
    if (b.magnet) t.push('+' + Math.round(b.magnet * 100) + '% ímã');
    if (b.range) t.push('+' + Math.round(b.range * 100) + '% área');
    if (b.coin) t.push('+' + Math.round(b.coin * 100) + '% moedas');
    if (b.xp) t.push('+' + Math.round(b.xp * 100) + '% xp');
    if (b.gem) t.push('+' + Math.round(b.gem * 100) + '% gemas');
    if (b.revive) t.push('+' + b.revive + ' renascer');
    if (b.slots) t.push('+' + b.slots + ' slot');
    if (b.healKill) t.push('+' + Math.round(b.healKill * 100) + '% vida por abate');
    if (b.boom) t.push('abates explodem');
    if (b.burn) t.push('dano queima');
    if (b.freeze) t.push('dano congela');
    if (b.slowWave) t.push('ondas ' + Math.round(b.slowWave * 100) + '% mais lentas');
    return t.join(' · ');
  }

  /* ============================================================
     LOJA — compras permanentes da sessão, pagas com gemas
     ============================================================ */
  const SHOP_ITEMS = [
    { id: 'slot', icon: '🗡️', name: 'Slot de Arma Extra', desc: 'Cabe mais 1 arma na partida', cost: 140, scale: 1.5, max: 3 },
    { id: 'poder', icon: '💥', name: 'Poder das Armas', desc: '+10% de dano em todas as armas', cost: 110, scale: 1.45, max: 8 },
    { id: 'vida', icon: '❤️', name: 'Vitalidade Máxima', desc: '+25 de vida no início', cost: 80, scale: 1.4, max: 6 },
    { id: 'sorte', icon: '🍀', name: 'Sorte', desc: '+1 de sorte (gemas e baús melhores)', cost: 90, scale: 1.5, max: 6 },
    { id: 'velo', icon: '👟', name: 'Agilidade', desc: '+8% de velocidade de movimento', cost: 70, scale: 1.4, max: 6 },
    { id: 'magnet', icon: '🧲', name: 'Magnetismo', desc: '+30% de alcance para coletar', cost: 60, scale: 1.4, max: 6 },
    { id: 'crit', icon: '🎯', name: 'Poder Fatal', desc: '+5% de chance crítica', cost: 100, scale: 1.45, max: 6 },
    { id: 'armadura', icon: '🛡️', name: 'Armadura', desc: 'Recebe 1 a menos de dano por golpe', cost: 130, scale: 1.5, max: 4 },
    { id: 'nivel', icon: '⭐', name: 'Nível Inicial', desc: 'Começa cada partida 1 nível acima', cost: 190, scale: 1.6, max: 4 },
    { id: 'revive', icon: '💖', name: 'Renascer', desc: 'Revive 1x por partida com 50% da vida', cost: 320, scale: 1, max: 1 },
    { id: 'ouro', icon: '🪙', name: 'Bolsa de Ouro', desc: 'Começa a partida com 100 moedas', cost: 90, scale: 1.5, max: 4 },

    /* ---- loja: bônus das passivas novas + caça-relíquias ---- */
    { id: 'cadencia', icon: '⏱️', name: 'Cadência', desc: '-7% no tempo de recarga das armas', cost: 130, scale: 1.5, max: 5 },
    { id: 'alcance', icon: '🔭', name: 'Alcance', desc: '+12% no tamanho das áreas de dano', cost: 120, scale: 1.45, max: 5 },
    { id: 'vampiro', icon: '🧛', name: 'Vampirismo', desc: 'Cura 2% da vida a cada abate', cost: 150, scale: 1.5, max: 5 },
    { id: 'explosao', icon: '💣', name: 'Reação em Cadeia', desc: 'Abates explodem e acertam o entorno', cost: 260, scale: 1.6, max: 3 },
    { id: 'queima', icon: '🔥', name: 'Incêndio', desc: 'Seu dano passa a queimar os inimigos', cost: 170, scale: 1.5, max: 5 },
    { id: 'experiencia', icon: '📚', name: 'Memória', desc: '+15% de experiência', cost: 100, scale: 1.4, max: 5 },
    { id: 'relic', icon: '🧭', name: 'Bússola de Relíquias', desc: '+12% de chance de achar uma relíquia na sala', cost: 160, scale: 1.55, max: 5 }
  ];

  /* ============================================================
     CÓDIGOS — digitados na tela inicial, valem uma vez só
     (o "effect" é aplicado em ui.js)
     ============================================================ */
  const CODES = {
    'jl': { id: 'jl', effect: 'gemas', value: 99999, msg: '💎 +99.999 gemas!' },
    '2026': { id: '2026', effect: 'chars', msg: '👑 TODOS OS PERSONAGENS E TODAS AS SKINS LIBERADOS! GOD equipado!' },
    '1602': { id: '1602', effect: 'wipe', msg: '🧹 Progresso apagado!' }
  };

  /* normaliza o que o jogador digitou: sem espaço, minúscula, sem acento */
  function normCode(raw) {
    return String(raw || '')
      .trim().toLowerCase()
      .replace(/\s+/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function findCode(raw) {
    return CODES[normCode(raw)] || null;
  }

  /* ============================================================
     META — progresso da sessão (também salvo em localStorage)
     ============================================================ */
function freshMeta() {
    const lv = {};
    for (const k in PASSIVES) lv[k] = 0;
    return {
      gems: 0, slot: 0, nivel: 0, revive: 0, ouro: 0,
      bonus: { poder: 0, vida: 0, sorte: 0, velo: 0, magnet: 0, crit: 0, armadura: 0 },
      levels: lv, usados: [],
      chars: { unlocked: ['viajante'], owned: ['viajante'], sel: 'viajante' },
      skins: { unlocked: freeSkins(), owned: ['viajante'], sel: 'viajante' },
      stats: { rooms: 0, chests: 0, fusions: 0, bosses: 0, phases: 0, level: 1 }
    };
  }

  /* completa campos novos de saves antigos */
  function fixMeta(meta) {
    if (!Array.isArray(meta.usados)) meta.usados = [];
    if (!meta.chars) meta.chars = {};
    if (!Array.isArray(meta.chars.unlocked) || !meta.chars.unlocked.length) meta.chars.unlocked = ['viajante'];
    if (!Array.isArray(meta.chars.owned) || !meta.chars.owned.length) meta.chars.owned = ['viajante'];
    if (meta.chars.unlocked.indexOf('viajante') < 0) meta.chars.unlocked.push('viajante');
    if (meta.chars.owned.indexOf('viajante') < 0) meta.chars.owned.push('viajante');
    if (!meta.chars.sel || meta.chars.owned.indexOf(meta.chars.sel) < 0) meta.chars.sel = 'viajante';
    if (!meta.skins) meta.skins = {};
    if (!Array.isArray(meta.skins.unlocked) || !meta.skins.unlocked.length) meta.skins.unlocked = freeSkins();
    for (const id of freeSkins()) if (meta.skins.unlocked.indexOf(id) < 0) meta.skins.unlocked.push(id);
    if (!Array.isArray(meta.skins.owned) || !meta.skins.owned.length) meta.skins.owned = ['viajante'];
    if (meta.skins.unlocked.indexOf('viajante') < 0) meta.skins.unlocked.push('viajante');
    if (meta.skins.owned.indexOf('viajante') < 0) meta.skins.owned.push('viajante');
    if (!meta.skins.sel || meta.skins.owned.indexOf(meta.skins.sel) < 0) meta.skins.sel = 'viajante';
    if (!meta.stats) meta.stats = {};
    const st = meta.stats;
    for (const k of ['rooms', 'chests', 'fusions', 'bosses', 'phases']) if (typeof st[k] !== 'number') st[k] = 0;
    if (typeof st.level !== 'number') st.level = 1;
    return meta;
  }

  VS.DATA = {
    WEAPONS, FUSIONS, PASSIVES, MODES, SHOP_ITEMS, CODES, CHARACTERS, SETEC,
    RELICS, RELIC_CHANCE, SKINS, WORLD, WORLD_NAMES, BOSS_ROOM, ARENAS, ARENA_PADRAO, ARENA_CHANCE,
    allSkins, skin, freeSkins,
    statsFor, freshMeta, fixMeta, normCode, findCode,
    allWeapons() { return Object.values(WEAPONS); },
    allFusions() { return Object.values(FUSIONS); },
    allCharacters() { return Object.values(CHARACTERS); },
    allRelics, relic,
    def(id) { return WEAPONS[id] || FUSIONS[id]; },
    char(id) { return CHARACTERS[id] || CHARACTERS.viajante; },
    isFusion(id) { return !!FUSIONS[id]; },
    price(item, lv) { return Math.round(item.cost * Math.pow(item.scale || 1, lv)); },
    reqText, meets, bonusText
  };
})();

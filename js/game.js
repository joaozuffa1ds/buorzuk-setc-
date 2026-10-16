/* ============================================================
   game.js  —  salas, fases, mundo, player, armas, projéteis,
                 AOE, XP, baús, moedas, gemas e câmera
   ============================================================ */
window.VS = window.VS || {};

VS.Game = (function () {
  const U = VS.U, D = VS.DATA, E = VS.Entities, IN = VS.Input, SFX = () => VS.Audio.SFX;
  const { TAU, rand, randInt, chance, pick, clamp, dist, dist2, angleTo, sweep } = U;

  const WORLD = 3400;          /* tamanho antigo, ainda usado como referência */
  const ROOM_W = 1900, ROOM_H = 1350;   /* tamanho de cada sala */
  const CELL = 64;             /* lado da célula da grade espacial */
  /* roundRect com fallback para navegadores antigos */
  function rr(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');

  const g = {
    canvas: cvs, ctx, W: 0, H: 0, dpr: 1,
    view: { left: 0, top: 0, right: 0, bottom: 0 },
    state: 'menu',
    time: 0, runTime: 0,
    mode: D.MODES.infinito,
    meta: D.freshMeta(),
    char: D.CHARACTERS.viajante,
    roomW: ROOM_W, roomH: ROOM_H,
    cam: { x: ROOM_W / 2, y: ROOM_H / 2 },

    p: null,
    enemies: [], bullets: [], ebullets: [], aoes: [], orbiters: [],
    gems: [], chests: [], parts: [], texts: [], decos: [], pedestals: [],
    relics: [], relicSeen: [], boomBudget: 14,
    hardcore: false, world: null, playerDir: 'south', skin: null,

    /* ---- salas e fases ---- */
    phase: 1, room: 1, roomsTotal: 8, depth: 1,
    roomKind: 'normal', bossRoom: false, bossMini: false, bossPending: false,
    roomTotal: 0, roomSpawned: 0, roomKills: 0, roomWaves: 4, roomWaveTime: 12,
    roomCleared: false, enemyCount: 0, waveIdx: 0,
    door: { x: ROOM_W - 56, y: ROOM_H / 2, open: false },

    /* ---- arenas: obstaculos da sala atual ---- */
    arena: D.ARENAS[D.ARENA_PADRAO], arenaId: D.ARENA_PADRAO, obstacles: [],

    /* ---- mecânica da sala atual (VS.Mechanics) ---- */
    mech: null,

    wave: 1, waveT: 0, trickle: 0, boss: null, bossSoon: 0,
    kills: 0, money: 0, runGems: 0, chestsOpened: 0, xpTotal: 0, goldTotal: 0,
    levelQueue: 0, aim: 0, facing: 1, moving: false, won: false,
    pendingFusions: [], fusionBanner: 0, hurtFlash: 0,
    grid: null, cells: [], gw: 0, gh: 0, cell: CELL,
    nearChest: null, eid: 1, chestTimer: 20, hudT: 0,
    perf: { ms: 16, acc: 0, n: 0, quality: 1 }
  };
  VS.Game = g;

  /* ============================================================
     CANVAS / CÂMERA
     ============================================================ */
  function resize() {
    g.dpr = Math.min(2, window.devicePixelRatio || 1);
    g.W = cvs.clientWidth || window.innerWidth;
    g.H = cvs.clientHeight || window.innerHeight;
    cvs.width = Math.floor(g.W * g.dpr);
    cvs.height = Math.floor(g.H * g.dpr);
  }
  addEventListener('resize', resize);
  /* mundo salvo como no Minecraft: grava ao fechar/sair da aba */
  addEventListener('beforeunload', () => saveWorldNow());
  addEventListener('pagehide', () => saveWorldNow());
  addEventListener('visibilitychange', () => { if (document.hidden) saveWorldNow(); });

  function updateView() {
    const hw = g.W / 2, hh = g.H / 2;
    g.view.left = g.cam.x - hw; g.view.right = g.cam.x + hw;
    g.view.top = g.cam.y - hh; g.view.bottom = g.cam.y + hh;
  }

  function camFollow(dt) {
    const p = g.p;
    const tx2 = clamp(p.x, hwClamp(), g.roomW - hwClamp());
    const ty2 = clamp(p.y, hhClamp(), g.roomH - hhClamp());
    g.cam.x += (tx2 - g.cam.x) * Math.min(1, dt * 9);
    g.cam.y += (ty2 - g.cam.y) * Math.min(1, dt * 9);

    if (U.shake.ms > 0) {
      U.shake.ms -= dt * 1000;
      const k = U.shake.p * (U.shake.ms / 260);
      g.cam.x += rand(-k, k);
      g.cam.y += rand(-k, k);
      if (U.shake.ms <= 0) U.shake.p = 0;
    }
    updateView();
  }
  const hwClamp = () => Math.min(g.W / 2, g.roomW / 2);
  const hhClamp = () => Math.min(g.H / 2, g.roomH / 2);

  /* ============================================================
     GRADE ESPACIAL — cobre a sala inteira, sem alocar nada
     por frame (é o que segura o jogo quando o spawn aperta)
     ============================================================ */
function buildGrid() {
    const cols = Math.ceil(g.roomW / CELL) + 1;
    const rows = Math.ceil(g.roomH / CELL) + 1;
    if (g.gw !== cols || g.gh !== rows || !g.cells.length) {
      g.cells = [];
      for (let i = 0; i < cols * rows; i++) g.cells.push([]);
      g.gw = cols; g.gh = rows; g.cell = CELL;
    }
    const cells = g.cells;
    for (let i = 0; i < cells.length; i++) if (cells[i].length) cells[i].length = 0;
    for (const e of g.enemies) {
      if (e.dead) continue;
      let cx = (e.x / CELL) | 0, cy = (e.y / CELL) | 0;
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
      cells[cy * cols + cx].push(e);
    }
    g.grid = cells;
  }

  /* devolve as células que tocam o círculo (array reaproveitada) */
  const cellBuf = [];
  function gatherCells(x, y, r) {
    const cols = g.gw, rows = g.gh, cells = g.cells;
    let x0 = ((x - r) / CELL) | 0, x1 = ((x + r) / CELL) | 0;
    let y0 = ((y - r) / CELL) | 0, y1 = ((y + r) / CELL) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= cols) x1 = cols - 1; if (y1 >= rows) y1 = rows - 1;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const base = cy * cols;
      for (let cx = x0; cx <= x1; cx++) {
        const list = cells[base + cx];
        if (list.length) cellBuf[n++] = list;
      }
    }
    cellBuf.length = n;
    return cellBuf;
  }

  /* n inimigos mais próximos (sem criar objetos novos a cada frame).
     los = true só enxerga quem não tem parede no meio */
  const NEAR_MAX = 8;
  const nearOut = [], nearDOut = [];
  function nearest(x, y, n, range, los) {
    if (n > NEAR_MAX) n = NEAR_MAX;
    let cnt = 0;
    const r2 = range * range;
    const cells = gatherCells(x, y, range);
    for (let ci = 0; ci < cells.length; ci++) {
      const list = cells[ci];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const d2 = dist2(x, y, e.x, e.y);
        if (d2 > r2) continue;
        if (los && losBlocked(x, y, e.x, e.y)) continue;
        if (cnt === n && d2 >= nearDOut[n - 1]) continue;
        let k = cnt < n ? cnt++ : n - 1;
        while (k > 0 && nearDOut[k - 1] > d2) { nearOut[k] = nearOut[k - 1]; nearDOut[k] = nearDOut[k - 1]; k--; }
        nearOut[k] = e; nearDOut[k] = d2;
      }
    }
    nearOut.length = cnt;
    return nearOut;
  }

  /* amostra aleatória de inimigos perto (sem filtro alocado) */
  function randomEnemies(n, range) {
    const p = g.p;
    const out = [];
    const r2 = range * range;
    let seen = 0;
    const cells = gatherCells(p.x, p.y, range);
    for (let ci = 0; ci < cells.length; ci++) {
      const list = cells[ci];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) > r2) continue;
        seen++;
        if (out.length < n) out.push(e);
        else { const j = (Math.random() * seen) | 0; if (j < n) out[j] = e; }
      }
    }
    return out;
  }

  /* opções reaproveitadas para passar no damage() sem criar objeto por acerto */
  const _o = {
    knock: 0, dir: 0, slow: 0, slowTime: 0, freeze: 0, poison: 0,
    lifesteal: 0, noCrit: false, showNum: false
  };
  function prep(o) {
    o = o || null;
    _o.knock = o && o.knock || 0;
    _o.slow = o && o.slow || 0;
    _o.slowTime = o && o.slowTime || 0;
    _o.freeze = o && o.freeze || 0;
    _o.poison = o && o.poison || 0;
    _o.lifesteal = o && o.lifesteal || 0;
    _o.noCrit = !!(o && o.noCrit);
    _o.showNum = !!(o && o.showNum);
    return _o;
  }

  /* ---------- INÍCIO / RESET DA PARTIDA ---------- */
  function xpNeed(lv) { return Math.round(9 + lv * 6 + Math.pow(lv, 1.55) * 4); }

  /* ============================================================
     MUNDO HARDCORE (salvamento tipo Minecraft)
     - o mundo tem nome e "dia" (cada vez que você entra conta 1)
     - continua de onde parou: fase, sala, nível, armas, passivas,
       relíquias, gemas, personagens e melhorias da loja
     - se você MORRE, o mundo inteiro é apagado
     ============================================================ */
  function isHardcore() { return !!g.hardcore; }

  function worldSnapshot() {
    const p = g.p;
    return {
      fase: g.phase, sala: g.room, salasTotal: g.roomsTotal,
      tempo: Math.floor(g.runTime), kills: g.kills,
      money: Math.floor(g.money), goldTotal: Math.floor(g.goldTotal),
      runGems: g.runGems, baus: g.chestsOpened,
      jogador: {
        level: p.level, xp: Math.floor(p.xp), nextXp: Math.round(p.nextXp),
        hpFrac: clamp(p.hp / p.maxHp, 0, 1),
        armas: p.weapons.map(w => [w.id, w.level]),
        passivas: Object.assign({}, p.passives)
      },
      reliquias: g.relics.slice(),
      reliquiasVistas: g.relicSeen.slice(),
      meta: JSON.parse(JSON.stringify(g.meta))
    };
  }

  /* grava o mundo no navegador (chamado sozinho em vários eventos) */
  function saveWorld() {
    if (!isHardcore() || !g.world || !g.p) return;
    g.world.snap = worldSnapshot();
    g.world.em = Date.now();
    VS.Save && VS.Save.worldWrite(g.world);
  }

  /* grava na HORA: usado ao fechar o jogo (debounce nao serve) */
  function saveWorldNow() {
    if (!isHardcore() || !g.world || !g.p) return;
    g.world.snap = worldSnapshot();
    g.world.em = Date.now();
    VS.Save && VS.Save.worldWriteNow(g.world);
  }

  function newWorld() {
    const nomes = D.WORLD_NAMES;
    const nome = nomes[(Math.random() * nomes.length) | 0];
    return { v: 1, nome: nome, dia: 1, criado: Date.now(), snap: null };
  }

  /* start/reinicio do modo Hardcore */
  function startHardcore() {
    const salvo = VS.Save ? VS.Save.worldRead() : null;
    g.hardcore = true;
    g.mode = D.MODES.hardcore;
    g.time = 0; g.runTime = 0;
    g.enemies.length = 0; g.enemyCount = 0;
    g.bullets.length = 0; g.ebullets.length = 0; g.aoes.length = 0; g.orbiters.length = 0;
    g.gems.length = 0; g.chests.length = 0; g.parts.length = 0; g.texts.length = 0;
    g.pedestals.length = 0;
    spinners.length = 0; auras.length = 0; turrets.length = 0; tornadoes.length = 0;
    g.boss = null; g.bossSoon = 0; g.bossPending = false;
    g.wave = 1; g.waveT = 0; g.trickle = 0;
    g.kills = 0; g.goldTotal = 0; g.won = false;
    g.chestsOpened = 0; g.xpTotal = 0; g.levelQueue = 0;
    g.pendingFusions.length = 0; g.fusionBanner = 0; g.hurtFlash = 0; g.nearChest = null;
    g.chestTimer = rand(14, 22);

    let snap = salvo && salvo.snap ? salvo.snap : null;
    if (snap) {
      g.meta = D.fixMeta(snap.meta || D.freshMeta());
      g.world = { v: 1, nome: salvo.nome, dia: (salvo.dia || 0) + 1, criado: salvo.criado || Date.now(), snap: snap };
    } else {
      g.meta = D.freshMeta();
      g.world = newWorld();
      snap = null;
    }
    g.char = VS.Chars.current();
    g.skin = VS.Chars.skin();

    const p = {
      x: ROOM_W / 2, y: ROOM_H / 2, r: 15,
      hp: 100, maxHp: 100, speed: 205,
      level: 1, xp: 0, nextXp: xpNeed(1),
      weapons: [], passives: {},
      iframe: 0, dead: false, revives: 0, reviveMax: 0,
      armor: 0, power: 1, crit: 0.05, critMul: 2.2, magnet: 130, luck: 0, slots: 4,
      haste: 1, coinMul: 1, xpMul: 1, gemMul: 1, rangeMul: 1,
      healKill: 0, boomKill: false, relicBurn: 0, relicFreeze: 0, slowWave: 0,
      moving: false, step: 0
    };
    g.p = p;

    if (snap) {
      /* ---- retomando o mundo salvo ---- */
      g.runTime = snap.tempo || 0;
      g.kills = snap.kills || 0;
      g.goldTotal = snap.goldTotal || 0;
      g.runGems = snap.runGems || 0;
      g.chestsOpened = snap.baus || 0;
      g.money = snap.money || 0;
      g.phase = Math.max(1, snap.fase || 1);
      g.roomsTotal = clamp(snap.salasTotal || 8, 7, 9);
      g.room = clamp(snap.sala || 1, 1, g.roomsTotal);
      g.relics = (snap.reliquias || []).slice();
      g.relicSeen = (snap.reliquiasVistas || []).slice();
      p.level = snap.jogador.level || 1;
      p.xp = snap.jogador.xp || 0;
      p.nextXp = snap.jogador.nextXp || xpNeed(p.level);
      p.passives = Object.assign({}, snap.jogador.passivas || {});
      recompute(p, true);
      p.hp = Math.max(1, Math.round(p.maxHp * (snap.jogador.hpFrac || 1)));
      for (const [id, lv] of (snap.jogador.armas || [])) {
        p.weapons.push({ id: id, level: lv, cd: rand(0, 0.4), stats: null });
      }
      if (!p.weapons.length) { p.weapons.push({ id: g.char.weapon || 'espada', level: 1, cd: 0 }); }
    } else {
      /* ---- mundo novo ---- */
      recompute(p, true);
      p.level = 1;
      p.xp = 0;
      p.nextXp = xpNeed(1);
      const pool = VS.Chars.pool();
      p.weapons.push({ id: g.char.weapon || pool[0].id, level: 1, cd: 0, stats: null });
      if (g.char.extra) p.weapons.push({ id: g.char.extra, level: 1, cd: 0, stats: null });
      g.phase = 1; g.room = 1;
      g.roomsTotal = 7 + randInt(0, 2);
      g.money = 0;
    }

    VS.UI.roomBanner(null);
    g.roomKind = 'normal';
    rollRoomKind();
    enterRoom(true);

    g.cam.x = p.x; g.cam.y = p.y;
    updateView();
    g.state = 'play';
    VS.UI.hideAll();
    VS.UI.banner(false);
    VS.UI.resetBar();
    VS.UI.syncHud();
    VS.Chars.sync();
    saveWorld();
    if (snap) {
      VS.UI.roomBanner('🧱 ' + g.world.nome + ' · DIA ' + g.world.dia + ' — mundo retomado na fase ' + g.phase + ', sala ' + g.room, 3400);
      VS.UI.toast('Mundo carregado: ' + g.world.nome, 3000);
    } else {
      VS.UI.roomBanner('🧱 NOVO MUNDO: ' + g.world.nome + ' — se você morrer, perde tudo!', 3600);
    }
  }

  /* morte no hardcore: o mundo inteiro some */
  function wipeWorld() {
    const perdido = g.world ? { nome: g.world.nome, dia: g.world.dia, snap: g.world.snap } : null;
    VS.Save && VS.Save.worldWipe();
    g.world = null;
    g.hardcore = false;
    g.relics.length = 0;
    g.relicSeen.length = 0;
    g.pedestals.length = 0;
    spinners.length = 0; auras.length = 0; turrets.length = 0; tornadoes.length = 0;
    g.phase = 1; g.room = 1; g.roomsTotal = 8; g.depth = 1;
    g.kills = 0; g.runTime = 0; g.runGems = 0; g.chestsOpened = 0; g.xpTotal = 0;
    g.money = 0; g.goldTotal = 0; g.levelQueue = 0; g.roomCleared = false;
    g.meta = D.freshMeta();
    if (VS.UI.resetRelics) VS.UI.resetRelics();
    return perdido;
  }

  /* grava no lugar certo: mundo no hardcore, meta normal nos outros */
  function persist() {
    if (isHardcore()) saveWorld();
    else if (VS.Save) VS.Save.write(g.meta);
  }

  function start(modeId) {
    if (modeId === 'hardcore') { startHardcore(); return; }
    g.hardcore = false; g.world = null;
    g.mode = D.MODES[modeId] || D.MODES.infinito;
    g.time = 0; g.runTime = 0;
    g.enemies.length = 0; g.bullets.length = 0; g.ebullets.length = 0;
    g.aoes.length = 0; g.orbiters.length = 0; g.gems.length = 0;
    g.chests.length = 0; g.parts.length = 0; g.texts.length = 0;
    g.pedestals.length = 0;
    g.relics.length = 0; g.relicSeen.length = 0;
    spinners.length = 0; auras.length = 0; turrets.length = 0; tornadoes.length = 0;
    g.enemyCount = 0;
    g.wave = 1; g.waveT = 0; g.boss = null; g.bossSoon = 0;
    g.kills = 0; g.goldTotal = 0; g.won = false;
    g.money = Math.round((g.mode.goldStart || 0) + g.meta.ouro * 100);
    g.runGems = 0; g.chestsOpened = 0; g.xpTotal = 0; g.levelQueue = 0;
    g.pendingFusions.length = 0; g.fusionBanner = 0; g.hurtFlash = 0; g.nearChest = null;
    g.chestTimer = rand(14, 22);

    /* personagem e skin escolhidos */
    g.char = VS.Chars.current();
    g.skin = VS.Chars.skin();

    const p = {
      x: ROOM_W / 2, y: ROOM_H / 2, r: 15,
      hp: 100, maxHp: 100, speed: 205,
      level: 1, xp: 0, nextXp: xpNeed(1),
      weapons: [], passives: {},
      iframe: 0, dead: false, revives: 0, reviveMax: 0,
      armor: 0, power: 1, crit: 0.05, critMul: 2.2, magnet: 130, luck: 0, slots: 4,
      haste: 1, coinMul: 1, xpMul: 1,
      moving: false, step: 0
    };
    g.p = p;
    recompute(p, true);

    p.level = 1 + g.meta.nivel + (g.mode.startLevel - 1);
    p.xp = 0;
    p.nextXp = xpNeed(p.level);

    /* arma inicial: a do personagem (GOD ganha todas) */
    const pool = VS.Chars.pool();
    addWeapon(g.char.weapon || pool[0].id);
    if (g.char.extra) addWeapon(g.char.extra);
    if (g.char.allWeapons) {
      /* GOD: entra com TODOS os slots preenchidos de uma vez */
      for (const w of D.allWeapons()) {
        if (g.p.weapons.length >= g.p.slots) break;
        addWeapon(w.id);
      }
      const lv = g.char.startLevel || 1;
      for (const w of g.p.weapons) w.level = Math.max(w.level, lv);
    }
    const rest = pool.filter(w => !g.p.weapons.some(x => x.id === w.id));
    if (!g.char.allWeapons && rest.length && g.p.weapons.length < (g.mode.id === 'facil' ? 3 : 2)) addWeapon(rest[0].id);

    /* primeira fase / primeira sala */
    VS.UI.roomBanner(null);            /* limpa o banner da partida anterior */
    g.phase = 1; g.room = 1;
    g.roomsTotal = 7 + randInt(0, 2);
    g.roomKind = 'normal';
    enterRoom(true);

    g.cam.x = p.x; g.cam.y = p.y;
    updateView();
    g.state = 'play';
    VS.UI.hideAll();
    VS.UI.banner(false);
    VS.UI.resetBar();
    VS.UI.syncHud();
    VS.UI.toast(g.char.icon + ' ' + g.char.name + ' · ' + g.mode.icon + ' ' + g.mode.name, 2600);
    VS.Chars.sync();
  }

  function recompute(p, fresh) {
    const m = g.mode, mt = g.meta, b = mt.bonus, lv = p.passives;
    const ch = (g.char && g.char.bonus) || {};
    const B = mergeBonus();
    p.maxHp = Math.round(m.startHp + b.vida * 25 + (lv.vida || 0) * 20 + B.hp);
    if (fresh) p.hp = p.maxHp; else p.hp = Math.min(p.hp, p.maxHp);
    p.speed = 205 * (1 + b.velo * 0.08 + (lv.velo || 0) * 0.07 + B.speed);
    p.magnet = 130 * (1 + b.magnet * 0.3 + (lv.magnet || 0) * 0.3 + B.magnet);
    p.luck = b.sorte + (lv.sorte || 0) + B.luck;
    p.crit = 0.05 + b.crit * 0.05 + (lv.crit || 0) * 0.06 + B.crit;
    p.critMul = 2.2 + (lv.crit || 0) * 0.25;
    p.armor = b.armadura + (lv.armadura || 0) + B.armor;
    p.power = (1 + b.poder * 0.1) * (1 + (lv.forca || 0) * 0.12) * (1 + B.power);
    p.slots = 4 + mt.slot + B.slots;
    p.haste = Math.max(0.45, 1 - (ch.haste || 0) - B.haste);
    p.coinMul = 1 + (ch.coin || 0) + B.coin;
    p.xpMul = 1 + (ch.xp || 0) + B.xp;
    p.gemMul = 1 + B.gem;
    p.rangeMul = 1 + B.range;
    p.healKill = B.healKill;
    p.boomKill = B.boom > 0;
    p.relicBurn = B.burn;
    p.relicFreeze = B.freeze;
    p.slowWave = B.slowWave;
    /* renascer: guarda quantos voce ja usou */
    const maxRev = isHardcore() ? 0 : mt.revive + B.revive;
    if (fresh) { p.reviveMax = maxRev; p.revives = maxRev; }
    else {
      /* relíquia que dá renascer vale na hora */
      p.revives += Math.max(0, maxRev - p.reviveMax);
      p.reviveMax = maxRev;
    }
  }

  /* ============================================================
     BONUS UNIFICADO: personagem + passivas novas + RELÍQUIAS
     (tudo no mesmo formato "per", somado num objeto só)
     ============================================================ */
  function mergeBonus() {
    const B = {
      hp: 0, power: 0, speed: 0, haste: 0, crit: 0, armor: 0, luck: 0, magnet: 0,
      range: 0, coin: 0, xp: 0, gem: 0, revive: 0, slots: 0, healKill: 0,
      boom: 0, burn: 0, freeze: 0, slowWave: 0
    };
    const add = (o) => { if (!o) return; for (const k in B) if (o[k]) B[k] += o[k]; };
    add((g.char && g.char.bonus) || {});        /* personagem */
    add((g.skin && g.skin.per) || {});          /* skin equipada */
    const p = g.p;
    if (p) for (const id in D.PASSIVES) {
      const n = p.passives[id] || 0;
      const per = D.PASSIVES[id].per;
      if (n && per) for (const k in per) if (per[k]) B[k] += per[k] * n;
    }
    for (const id of g.relics) {
      const r = D.relic(id);
      if (r) add(r.per);
    }
    /* compra de loja das novas passivas */
    const bo = g.meta.bonus;
    B.haste += (bo.cadencia || 0) * 0.07;
    B.range += (bo.alcance || 0) * 0.12;
    B.healKill += (bo.vampiro || 0) * 0.02;
    if (bo.explosao) B.boom += bo.explosao;
    B.burn += (bo.queima || 0) * 2;
    B.xp += (bo.experiencia || 0) * 0.15;
    return B;
  }

  /* relíquia pega: soma na conta */
  function grantRelic(id) {
    if (g.relics.indexOf(id) >= 0) return;
    g.relics.push(id);
    recompute(g.p);
    const r = D.relic(id);
    saveWorld();
    VS.UI.toast('✨ RELÍQUIA: ' + r.icon + ' ' + r.name + ' — ' + r.desc, 3600);
    VS.UI.roomBanner('✨ ' + r.name + ' — ' + r.desc, 3200);
    SFX().fusion();
    persist();
  }

  function addWeapon(id) {
    const p = g.p;
    const ex = p.weapons.find(w => w.id === id);
    if (ex) { ex.level = Math.min(D.def(id).max, ex.level + 1); return ex; }
    if (p.weapons.length >= p.slots) return null;
    const w = { id, level: 1, cd: rand(0, 0.4), stats: null };
    p.weapons.push(w);
    /* criar uma fusão conta pro destrave de personagem */
    if (D.isFusion(id)) { VS.Chars.note('fusions'); VS.Chars.sync(); }
    return w;
  }

  function gainPassive(id) {
    const p = g.p;
    p.passives[id] = (p.passives[id] || 0) + 1;
    recompute(p);
    checkFusions();
  }

  /* ============================================================
     FUSÕES
     ============================================================ */
  function availableFusions() {
    const p = g.p, out = [];
    for (const id in D.FUSIONS) {
      const f = D.FUSIONS[id];
      if (p.weapons.some(w => w.id === id)) continue;
      if (f.from.every(cid => { const w = p.weapons.find(x => x.id === cid); return w && w.level >= 3; })) out.push(id);
    }
    return out;
  }

  function checkFusions() {
    const list = availableFusions();
    for (const id of list) if (!g.pendingFusions.includes(id)) g.pendingFusions.push(id);
    if (list.length) { g.fusionBanner = 3.2; SFX().fusion(); }
  }

  /* ============================================================
     DANO / MORTE DE INIMIGO / XP
     ============================================================ */
  function damage(e, amt, opts) {
    opts = opts || {};
    if (e.dead || amt <= 0) return 0;
    let crit = false;
    if (!opts.noCrit && chance(g.p.crit)) { amt *= g.p.critMul; crit = true; }
    amt *= g.p.power;
    /* escudo (mecânica BLINDADOS): absorve tudo ate quebrar */
    if (e.shield > 0) {
      const abs = Math.min(e.shield, amt);
      e.shield -= abs;
      amt -= abs;
      if (e.shield <= 0) {
        e.shield = 0;
        e.freeze = Math.max(e.freeze, 1.2);       /* tonto ao quebrar */
        texts(e.x, e.y - e.r - 12, 'QUEBROU!', '#7ad7ff');
        SFX().zap();
      }
      if (amt <= 0) { e.flash = 0.08; return 0; }
    }
    e.hp -= amt;
    e.flash = 0.08;

    /* relíquias/passivasglobais: o dano que voce causa sempre queima/congela */
    if (g.p.relicBurn && !opts.poison && !opts.noDot) {
      e.poisonT = Math.max(e.poisonT, 3);
      e.poisonDps = Math.max(e.poisonDps, g.p.relicBurn);
      e.poisonTick = 0.5;
    }
    if (g.p.relicFreeze && !opts.freeze) e.freeze = Math.max(e.freeze, g.p.relicFreeze);

    if (opts.knock) {
      const a = opts.dir !== undefined ? opts.dir : rand(TAU);
      const k = opts.knock * (e.heavy ? 0.28 : 1);
      e.kx += Math.cos(a) * k; e.ky += Math.sin(a) * k;
    }
    if (opts.slow) { e.slow = Math.max(e.slow, opts.slow); e.slowT = Math.max(e.slowT, opts.slowTime || 1.5); }
    if (opts.freeze) e.freeze = Math.max(e.freeze, opts.freeze);
    if (opts.poison) { e.poisonT = Math.max(e.poisonT, 3); e.poisonDps = Math.max(e.poisonDps, opts.poison); e.poisonTick = 0.5; }
    if (opts.lifesteal) heal(amt * opts.lifesteal, true);
    if (crit) texts(e.x, e.y - e.r - 6, Math.round(amt) + '!', '#ffe27a');
    else if (opts.showNum && amt >= 25) texts(e.x, e.y - e.r - 6, String(Math.round(amt)), '#ffffff');

    if (e.hp <= 0) killEnemy(e, crit);
    return amt;
  }

  function killEnemy(e, crit) {
    if (e.dead) return;
    e.dead = true;
    g.kills++;
    g.enemyCount--;
    if (g.roomKills < 9999) g.roomKills++;
    /* a mecânica da sala reage ao abate (moedas, cura da sede…) */
    VS.Mechanics.onKill(g, e);
    const coin = Math.round(e.coin * (g.p.coinMul || 1));
    g.money += coin;
    g.goldTotal += coin;
    if (chance(0.18) || e.boss) texts(e.x, e.y - 10, '+' + coin + '🪙', '#ffcc4d');
    if (crit) SFX().hit();

    /* vampirismo / relíquia Presa: cura por abate */
    if (g.p.healKill) heal(g.p.maxHp * g.p.healKill, true);

    /* reação em cadeia: o morto explode (com teto por frame pra não travar) */
    if (g.p.boomKill && !e.boss && g.boomBudget > 0) {
      g.boomBudget--;
      spawnBoom({
        x: e.x, y: e.y, radius: 92 + g.phase * 6,
        dmg: 34 + g.depth * 3, color: '#ff8a3c', knock: 200
      });
    }

    /* pedaço de xp */
    const val = Math.max(1, Math.round(e.xp * (g.p.xpMul || 1)));
    if (g.gems.length > 240) addXP(val);              /* evita acumular gemas */
    else g.gems.push({
      x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: rand(-70, 70), vy: rand(-70, 70),
      val, big: e.boss || e.elite, t: 0, dead: false
    });
    if (e.boss) {
      saveWorld();
      for (let i = 0; i < 22; i++) g.gems.push({
        x: e.x + rand(-50, 50), y: e.y + rand(-50, 50), vx: rand(-160, 160), vy: rand(-160, 160),
        val: Math.max(3, Math.round(e.xp / 6)), big: false, t: 0, dead: false
      });
      g.boss = null;
      g.money += 150;
      VS.Chars.note('bosses'); VS.Chars.sync();
      texts(e.x, e.y - 30, 'CHEFE DERROTADO! +150🪙', '#ffd76a');
      VS.UI.roomBanner('CHEFE DERROTADO!', 1800);
      U.shake(400);
    }

    burst(e.x, e.y, e.boss ? 40 : 8, e.boss ? '#ffd76a' : e.color, e.boss ? 9 : 4);
    SFX().boom();
  }

  function texts(x, y, txt, color) {
    if (g.texts.length > 60) g.texts.shift();
    g.texts.push({ x, y, txt, color, life: 0.85 });
  }

  /* dano por tempo (mecânicas de sala): nao tem empurrao nem iframe,
     entao nao trava a tela com shake a cada acerto */
  function drainPlayer(v) {
    const p = g.p;
    if (!p || p.dead || g.state !== 'play' || v <= 0) return;
    p.hp -= v;
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        p.hp = Math.round(p.maxHp * 0.5);
        p.iframe = 2.4;
        texts(p.x, p.y - 34, 'RENASCIDO!', '#ff9de2');
      } else die();
    }
  }

  function burst(x, y, n, color, spd) {
    if (g.parts.length > 300) return;
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(spd * 0.3, spd);
      g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), size: rand(2, 5), color });
    }
  }

  function heal(v, silent) {
    const p = g.p;
    if (p.hp >= p.maxHp) return;
    p.hp = Math.min(p.maxHp, p.hp + v);
    if (!silent) texts(p.x, p.y - 26, '+' + Math.round(v), '#63e6a0');
  }

  function hurtPlayer(dmg, src) {
    const p = g.p;
    if (p.dead || p.iframe > 0) return;
    const d = Math.max(1, Math.round(dmg - p.armor));
    p.hp -= d;
    p.iframe = 0.72;
    g.hurtFlash = 0.45;
    U.shake(190);
    SFX().hurt();
    burst(p.x, p.y, 6, '#ff4d6a', 130);
    if (src) {
      /* o empurrao do dano tambem respeita a parede */
      const a = angleTo(src.x, src.y, p.x, p.y);
      const kx = Math.cos(a) * 12, ky = Math.sin(a) * 12;
      if (g.obstacles.length) moveBody(p, kx, ky, p.r);
      else { p.x += kx; p.y += ky; }
      p.x = clamp(p.x, p.r, g.roomW - p.r);
      p.y = clamp(p.y, p.r, g.roomH - p.r);
    }
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        p.hp = Math.round(p.maxHp * 0.5);
        p.iframe = 2.4;
        texts(p.x, p.y - 34, 'RENASCIDO!', '#ff9de2');
        spawnRing({ x: p.x, y: p.y, r0: 20, r1: 340, dmg: 200, color: '#ff9de2', knock: 420, life: 0.7 });
        const cells = gatherCells(p.x, p.y, 340);
        for (let ci = 0; ci < cells.length; ci++) {
          const list = cells[ci];
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e.dead && dist2(e.x, e.y, p.x, p.y) < 340 * 340) damage(e, 200, { knock: 420 });
          }
        }
      } else {
        die();
      }
    }
  }

  function die() {
    const p = g.p;
    if (p.dead) return;
    p.dead = true;
    vacuumGems(true);       /* o XP que ficou no chao conta */
    g.state = 'over';
    SFX().die();
    U.shake(600);
    burst(p.x, p.y, 40, '#ff4d6a', 260);
    if (isHardcore()) {
      const perdido = wipeWorld();               /* MUNDO PERDIDO */
      VS.UI.gameOver(false, perdido);
    } else {
      VS.UI.gameOver();
    }
  }

  /* ============================================================
     HELPERS USADOS PELAS ARMAS (todos usam a grade espacial)
     ============================================================ */
  function hitCone(x, y, ang, spread, radius, dmg, opts) {
    opts = opts || {};
    const full = !!opts.full;
    const half = spread / 2;
    let n = 0;
    const cells = gatherCells(x, y, radius + 40);
    for (let ci = 0; ci < cells.length; ci++) {
      const list = cells[ci];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const rr = radius + e.r;
        if (dist2(x, y, e.x, e.y) > rr * rr) continue;
        if (!full && Math.abs(U.norm(angleTo(x, y, e.x, e.y) - ang)) > half) continue;
        if (losBlocked(x, y, e.x, e.y)) continue;      /* parede nao leva golpe */
        n++;
        prep(opts); _o.dir = angleTo(x, y, e.x, e.y);
        damage(e, dmg, _o);
      }
    }
    return n;
  }

  function hitCircle(x, y, radius, dmg, opts) {
    const cells = gatherCells(x, y, radius + 40);
    let n = 0;
    for (let ci = 0; ci < cells.length; ci++) {
      const list = cells[ci];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const rr = radius + e.r;
        if (dist2(x, y, e.x, e.y) > rr * rr) continue;
        if (losBlocked(x, y, e.x, e.y)) continue;      /* parede nao leva golpe */
        n++;
        prep(opts); _o.dir = angleTo(x, y, e.x, e.y);
        damage(e, dmg, _o);
      }
    }
    return n;
  }

  /* ---------------- AOE / VFX ---------------- */
  function spawnSlash(o) {
    hitCone(o.x, o.y, o.ang, o.spread, o.radius, o.dmg, { knock: o.knock, lifesteal: o.lifesteal, poison: o.poison });
    g.aoes.push({
      kind: 'slash', x: o.x, y: o.y, ang: o.ang, spread: o.spread, radius: o.radius,
      life: 0.24, max: 0.24, color: o.color
    });
  }

  function spawnRing(o) {
    const a = {
      kind: 'ring', x: o.x, y: o.y, r: o.r0 || 10, r0: o.r0 || 10, r1: o.r1 || 200,
      life: o.life || 0.55, max: o.life || 0.55, dmg: o.dmg, color: o.color,
      knock: o.knock, slow: o.slow, slowTime: o.slowTime, chain: o.chain,
      hit: new Set(), delay: o.delay || 0, field: o.field, fieldLife: o.fieldLife,
      fieldR: o.fieldR, dropped: false
    };
    g.aoes.push(a);
    return a;
  }

  function spawnBoom(o) {
    hitCircle(o.x, o.y, o.radius, o.dmg, { knock: o.knock });
    g.aoes.push({ kind: 'boom', x: o.x, y: o.y, radius: o.radius, life: 0.32, max: 0.32, color: o.color });
    burst(o.x, o.y, 10, o.color, 200);
  }

  /* ---------------- NOVAS PRIMITIVAS (armas 11 a 20) ---------------- */

  /* HIT RECT: dano numa linha (feixe de luz, muralha de espinhos) */
  function hitRect(x, y, ang, len, width, dmg, opts) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const r = width / 2;
    const cells = gatherCells(x + ca * len * 0.5, y + sa * len * 0.5, len * 0.5 + r + 40);
    let n = 0;
    for (let ci = 0; ci < cells.length; ci++) {
      const list = cells[ci];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const ex = e.x - x, ey = e.y - y;
        let t = ex * ca + ey * sa;                       /* projetao no eixo da linha */
        if (t < -e.r) continue;
        if (t > len + e.r) continue;
        const px = ex - ca * Math.max(0, t - len), py = ey - sa * Math.max(0, t - len);
        const lim = (r + e.r) * (r + e.r);
        if (t < 0) { if (px * px + py * py > lim) continue; }
        else if (px * px + py * py > lim) continue;
        if (losBlocked(x, y, e.x, e.y)) continue;      /* parede corta o feixe */
        n++;
        prep(opts); _o.dir = ang;
        damage(e, dmg, _o);
      }
    }
    return n;
  }

  /* FEIXE: linha instantânea + risco que dura pouco */
  function spawnBeam(o) {
    hitRect(o.x, o.y, o.ang, o.len, o.width, o.dmg, { knock: o.knock || 0 });
    g.aoes.push({
      kind: 'beam', x: o.x, y: o.y, ang: o.ang, len: o.len, width: o.width,
      life: o.life || 0.18, max: o.life || 0.18, color: o.color
    });
  }

  /* RAIOS: N linhas saindo do jogador (Raios Solares / Eclipse) */
  function spawnRays(o) {
    const n = o.count || 8;
    const base = o.ang !== undefined ? o.ang : (o.rot || 0);
    for (let i = 0; i < n; i++) {
      const a = base + i / n * TAU;
      hitRect(o.x, o.y, a, o.len, o.width, o.dmg, { knock: o.knock || 0 });
    }
    g.aoes.push({
      kind: 'rays', x: o.x, y: o.y, count: n, rot: base, len: o.len,
      width: o.width, life: o.life || 0.24, max: o.life || 0.24, color: o.color
    });
  }

  /* MURALHA: fileira de espinhos na direção da mira */
  function spawnWall(o) {
    const n = o.count || Math.max(3, Math.round(o.len / 60));
    for (let i = 0; i < n; i++) {
      const d = (i / Math.max(1, n - 1) - 0.5) * o.len;
      const px = o.x + Math.cos(o.ang) * d, py = o.y + Math.sin(o.ang) * d;
      hitCircle(px, py, o.width * 0.6, o.dmg, { knock: o.knock || 140 });
      g.aoes.push({ kind: 'spike', x: px, y: py, ang: o.ang, r: o.width * 0.32, life: 0.5, max: 0.5, color: o.color });
    }
  }

  /* ESPINNERS: bracos girando em volta do jogador (Cruz de Ferro / Serra) */
  const spinners = [];
  function syncSpinners(count, arms, radius, speed, dmg, color, hitCd) {
    while (spinners.length < count) spinners.push({ a: rand(TAU), hit: new Map() });
    if (spinners.length > count) spinners.length = count;
    for (const s of spinners) {
      s.arms = arms || 2; s.radius = radius; s.speed = speed;
      s.dmg = dmg; s.color = color; s.hitCd = hitCd || 0.3;
    }
  }
  function updateSpinners(dt, semBixos) {
    const p = g.p;
    for (const s of spinners) {
      s.a += s.speed * dt;
      if (semBixos) continue;
      s.hit.forEach((t, e) => { if (t <= 0) s.hit.delete(e); else s.hit.set(e, t - dt); });
      const step = TAU / s.arms;
      for (let k = 0; k < s.arms; k++) {
        const a = s.a + k * step;
        const ox = p.x + Math.cos(a) * s.radius;
        const oy = p.y + Math.sin(a) * s.radius;
        const cells = gatherCells(ox, oy, 26 + 40);
        for (let ci = 0; ci < cells.length; ci++) {
          const list = cells[ci];
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e.dead || s.hit.has(e)) continue;
            const rr = 13 + e.r;
            if (dist2(ox, oy, e.x, e.y) > rr * rr) continue;
            s.hit.set(e, s.hitCd);
            _o.knock = 220; _o.slow = 0; _o.slowTime = 0; _o.freeze = 0;
            _o.poison = 0; _o.lifesteal = 0; _o.noCrit = false; _o.showNum = false;
            _o.dir = angleTo(ox, oy, e.x, e.y);
            damage(e, s.dmg, _o);
            SFX().hit();
          }
        }
      }
    }
  }
  function drawSpinners(c) {
    const p = g.p;
    for (const s of spinners) {
      const step = TAU / s.arms;
      for (let k = 0; k < s.arms; k++) {
        const a = s.a + k * step;
        const ox = p.x + Math.cos(a) * s.radius;
        const oy = p.y + Math.sin(a) * s.radius;
        c.strokeStyle = s.color;
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(p.x + Math.cos(a) * (s.radius * 0.35), p.y + Math.sin(a) * (s.radius * 0.35));
        c.lineTo(ox, oy);
        c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(ox, oy, 9, 0, TAU); c.fill();
        c.fillStyle = s.color;
        c.beginPath(); c.arc(ox, oy, 12, 0, TAU); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(ox, oy, 6, 0, TAU); c.fill();
      }
    }
  }

  /* AURA: dano continuo que gruda no jogador (Alma Flamejante) */
  const auras = [];
  function syncAura(radius, dmg, tick, color) {
    let a = auras[0];
    if (!a) a = auras[0] = { tm: 0 };
    a.radius = radius; a.dmg = dmg; a.tick = tick; a.color = color;
  }
  function updateAuras(dt) {
    const p = g.p;
    for (const a of auras) {
      a.tm -= dt;
      if (a.tm > 0) continue;
      a.tm = a.tick;
      hitCircle(p.x, p.y, a.radius, a.dmg, { noCrit: false, showNum: false });
    }
  }
  function drawAuras(c) {
    const p = g.p;
    for (const a of auras) {
      c.save();
      c.globalAlpha = 0.22 + Math.sin(g.time * 5) * 0.06;
      const grd = c.createRadialGradient(p.x, p.y, 4, p.x, p.y, a.radius);
      grd.addColorStop(0, U.hexRgba(a.color, 0.6));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd;
      c.beginPath(); c.arc(p.x, p.y, a.radius, 0, TAU); c.fill();
      c.restore();
    }
  }

  /* ESPINHOS / TURRETAS: fixas no chao, atiram sozinhas */
  const turrets = [];
  function spawnTurret(o) {
    if (turrets.length > 26) turrets.shift();
    turrets.push({
      x: o.x, y: o.y, dmg: o.dmg, cd: o.cd || 0.9, tm: o.cd || 0.9,
      speed: o.speed || 460, life: o.life || 8, max: o.life || 8,
      color: o.color || '#a6ff6e', anim: rand(TAU), dead: false
    });
  }
  function updateTurrets(dt) {
    const p = g.p;
    for (const t of turrets) {
      t.life -= dt;
      if (t.life <= 0) { t.dead = true; continue; }
      t.anim += dt * 3;
      t.tm -= dt;
      if (t.tm > 0) continue;
      const tgt = nearest(t.x, t.y, 1, 460, true)[0];
      if (!tgt) continue;
      t.tm = t.cd;
      const a = angleTo(t.x, t.y, tgt.x, tgt.y);
      g.spawnBullet({
        x: t.x, y: t.y, ang: a, speed: t.speed, r: 8, dmg: t.dmg,
        color: t.color, pierce: 1, life: 1.4, knock: 60, trail: '#4f7a2a'
      });
    }
    sweep(turrets);
  }
  function drawTurrets(c) {
    for (const t of turrets) {
      const fade = t.life < 1.5 ? (Math.floor(t.life * 8) % 2 === 0 ? 0.4 : 1) : 1;
      c.save();
      c.globalAlpha = fade;
      c.translate(t.x, t.y);
      c.fillStyle = '#2c2233';
      c.beginPath(); c.ellipse(0, 4, 13, 6, 0, 0, TAU); c.fill();
      c.fillStyle = t.color;
      c.beginPath();
      c.moveTo(0, -16); c.lineTo(5, 2); c.lineTo(-5, 2); c.closePath(); c.fill();
      c.rotate(Math.sin(t.anim) * 0.12);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, -13, 3, 0, TAU); c.fill();
      c.restore();
    }
  }

  /* TORNADOS: vortices que puxam e giram */
  const tornadoes = [];
  function spawnTornado(o) {
    if (tornadoes.length > 12) tornadoes.shift();
    tornadoes.push({
      x: o.x, y: o.y, dmg: o.dmg, radius: o.radius || 100, pull: o.pull || 240,
      life: o.life || 4, max: o.life || 4, color: o.color || '#cfd8ff',
      tm: 0, rot: rand(TAU), hitCd: 0.4, hit: new Map(), dead: false,
      trail: o.trail || null
    });
  }
  function updateTornadoes(dt, semBixos) {
    const p = g.p;
    for (const t of tornadoes) {
      t.life -= dt; t.rot += dt * 7;
      if (t.life <= 0) { t.dead = true; continue; }
      /* sem inimigo o tornado ainda persegue e expira (o sweep mora aqui),
         so que ele nao fica preso no array quando a sala limpa */
      const a = angleTo(t.x, t.y, p.x, p.y);
      t.x += Math.cos(a) * 70 * dt;
      t.y += Math.sin(a) * 70 * dt;
      if (semBixos) continue;
      /* rastro de nuvem (Ciclone Tóxico) */
      if (t.trail) {
        t.tm -= dt;
        if (t.tm <= 0) {
          t.tm = t.trail.every;
          spawnCloud({ x: t.x, y: t.y, radius: t.trail.radius, dmg: t.trail.dmg, life: 2.4, color: '#9de84f' });
        }
      }
      t.hit.forEach((v, e) => { if (v <= 0) t.hit.delete(e); else t.hit.set(e, v - dt); });
      const cells = gatherCells(t.x, t.y, t.radius + 40);
      for (let ci = 0; ci < cells.length; ci++) {
        const list = cells[ci];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead || t.hit.has(e)) continue;
          const dx = t.x - e.x, dy = t.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > t.radius + e.r) continue;
          /* puxa para o centro e da um giro */
          const pull = t.pull * dt / d;
          e.x += dx * pull; e.y += dy * pull;
          e.kx += -dy * 4 * dt; e.ky += dx * 4 * dt;
          t.hit.set(e, t.hitCd);
          _o.knock = 90; _o.slow = 0.35; _o.slowTime = 0.6; _o.freeze = 0;
          _o.poison = 0; _o.lifesteal = 0; _o.noCrit = false; _o.showNum = false;
          _o.dir = Math.atan2(dy, dx);
          damage(e, t.dmg, _o);
        }
      }
    }
    sweep(tornadoes);
  }
  function drawTornadoes(c) {
    for (const t of tornadoes) {
      const k = clamp(t.life / t.max, 0, 1);
      c.save();
      c.globalAlpha = 0.5 * k;
      for (let i = 3; i >= 1; i--) {
        c.strokeStyle = t.color;
        c.lineWidth = 4 * i * k;
        c.beginPath();
        for (let s = 0; s <= 14; s++) {
          const yy = t.y - s * 7 * k;
          const rr = (t.radius * 0.32) * (1 - s / 16) + 6;
          const xx = t.x + Math.cos(t.rot + s * 0.8) * rr;
          s ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
        }
        c.stroke();
      }
      c.restore();
    }
  }

  /* NUVEMES: poça persistente que corrói */
  function spawnCloud(o) {
    if (g.aoes.length > 160) return;
    g.aoes.push({
      kind: 'cloud', x: o.x, y: o.y, radius: o.radius, dmg: o.dmg,
      life: o.life || 4, max: o.life || 4, tm: 0, tick: 0.4, color: o.color || '#9de84f'
    });
  }

  /* METEOROS: cai do ceu, explode e queima o chao */
  function spawnMeteor(x, y, dmg, radius, color, o) {
    if (g.aoes.length > 160) return;
    o = o || {};
    g.aoes.push({
      kind: 'meteor', x: x, y: y, tx: x, ty: y, r0: radius * 0.35, r1: radius,
      sx: x + rand(-70, 70), sy: y - 460,
      dmg: dmg, radius: radius, color: color || '#ff8a3c',
      field: o.field, fieldLife: o.fieldLife,
      fall: 0.42, t: 0, life: 0.6, max: 0.6, dead: false
    });
  }

  function spawnField(o) {
    let n = 0;
    for (const a of g.aoes) if (a.kind === 'field') n++;
    if (n > 90) return;
    g.aoes.push({
      kind: 'field', x: o.x, y: o.y, radius: o.radius, life: o.life || 2, max: o.life || 2,
      dmg: o.dmg, tick: o.tick || 0.5, tm: 0, color: o.color || '#ff6a1f', slow: o.slow
    });
  }

  function spawnDrain(o) {
    hitCircle(o.x, o.y, o.radius, o.dmg, { lifesteal: o.heal, showNum: false });
    heal(o.dmg * o.heal * 0.5, true);
    g.aoes.push({ kind: 'drain', x: o.x, y: o.y, radius: o.radius, life: o.life, max: o.life, color: o.color });
  }

  function strikeLightning(x, y, dmg, chain, color) {
    color = color || '#ffe27a';
    const sx = x + rand(-20, 20), sy = y - 320;
    const pts = [{ x: sx, y: sy }];
    const segs = 5;
    for (let i = 1; i < segs; i++) pts.push({ x: U.lerp(sx, x, i / segs) + rand(-16, 16), y: U.lerp(sy, y, i / segs) + rand(-12, 12) });
    pts.push({ x, y });
    g.aoes.push({ kind: 'bolt', pts, life: 0.22, max: 0.22, color });
    hitCircle(x, y, 46, dmg, { knock: 60 });
    SFX().zap();
    /* salto em cadeia */
    let cx = x, cy = y, c = chain || 0;
    const used = new Set();
    while (c-- > 0) {
      let best = null, bd = 190 * 190;
      const cells = gatherCells(cx, cy, 190);
      for (let ci = 0; ci < cells.length; ci++) {
        const list = cells[ci];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead || used.has(e)) continue;
          const d2 = dist2(cx, cy, e.x, e.y);
          if (d2 < bd && !losBlocked(cx, cy, e.x, e.y)) { bd = d2; best = e; }
        }
      }
      if (!best) break;
      used.add(best);
      cx = best.x; cy = best.y;
      g.aoes.push({ kind: 'bolt', pts: [{ x: cx + rand(-14, 14), y: cy - 120 }, { x: cx, y: cy }], life: 0.2, max: 0.2, color });
      hitCircle(cx, cy, 40, dmg * 0.8, { knock: 40 });
    }
  }

  function syncOrbiters(count, radius, speed, dmg, color, hitCd) {
    const list = g.orbiters;
    while (list.length < count) list.push({ a: rand(TAU), hit: new Map(), nextZap: 0 });
    if (list.length > count) list.length = count;
    for (const o of list) {
      o.radius = radius; o.speed = speed; o.dmg = dmg; o.color = color; o.hitCd = hitCd;
    }
  }

  function zapFromOrbiters(dmg, chain) {
    for (const o of g.orbiters) {
      if (g.time < o.nextZap) continue;
      o.nextZap = g.time + 1.2;
      const near = nearest(o.x, o.y, 1, 240, true);
      if (near.length) strikeLightning(near[0].x, near[0].y, dmg, chain, '#a9ecff');
    }
  }

  /* ---------------- PROJÉTEIS ---------------- */
  function spawnBullet(o) {
    const a = o.ang !== undefined ? o.ang : 0;
    const sp = o.speed || 400;
    if (g.bullets.length > 260) return;              /* trava de seguranca */
    g.bullets.push({
      id: g.eid++,
      x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a, speed: sp,
      r: o.r || 10, dmg: o.dmg, color: o.color, pierce: o.pierce === undefined ? 1 : o.pierce,
      knock: o.knock || 0, life: o.life || 1.5, hit: null, trail: o.trail, trailT: 0,
      spin: o.spin || 0, spinA: 0, boomerang: !!o.boomerang, range: o.range || 200, dist: 0, phase: 0,
      poison: o.poison, slow: o.slow, slowTime: o.slowTime, freeze: o.freeze, lifesteal: o.lifesteal,
      boom: o.boom, boomDmg: o.boomDmg, field: o.field, fieldLife: o.fieldLife, fieldR: o.fieldR,
      homing: o.homing || 0, aim: a, fieldT: 0, dead: false
    });
  }

  function spawnEBullet(x, y, ang, speed, dmg, color, r) {
    g.ebullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: r || 8, dmg, color, life: 4, dead: false });
  }

  /* ONDA DE CHOQUE: anel que cresce do chao e acerta o jogador uma vez */
  function spawnShock(x, y, rMax, speed, dmg, color) {
    g.ebullets.push({
      x, y, vx: 0, vy: 0, r: 16, rMax, speed, dmg, color,
      life: rMax / speed + 0.3, shock: true, hit: false, dead: false
    });
  }

  function killBullet(b) {
    b.dead = true;
    if (b.boom) spawnBoom({ x: b.x, y: b.y, radius: b.boom, dmg: b.boomDmg, color: b.color, knock: 120 });
    burst(b.x, b.y, 4, b.color, 120);
  }

  function updateBullets(dt) {
    const p = g.p;
    for (const b of g.bullets) {
      b.life -= dt;
      if (b.life <= 0) { killBullet(b); continue; }
      if (b.spin) b.spinA += b.spin * dt;

      /* de onde o projetil saiu neste frame: e por esse trecho que a
         parede e testada, para nao atravessar parede fina */
      const px0 = b.x, py0 = b.y;

      if (b.homing) {
        const tgt = nearest(b.x, b.y, 1, 340, true)[0];
        if (tgt) {
          const want = angleTo(b.x, b.y, tgt.x, tgt.y);
          let d = want - b.ang;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          b.ang += clamp(d, -b.homing * dt, b.homing * dt);
          b.vx = Math.cos(b.ang) * b.speed;
          b.vy = Math.sin(b.ang) * b.speed;
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
      } else if (b.boomerang) {
        b.dist += b.speed * dt;
        if (b.phase === 0 && b.dist >= b.range) b.phase = 1;
        const a = b.phase === 0 ? b.ang : angleTo(b.x, b.y, p.x, p.y);
        b.ang = a;
        b.x += Math.cos(a) * b.speed * dt;
        b.y += Math.sin(a) * b.speed * dt;
        if (b.phase === 1 && dist(b.x, b.y, p.x, p.y) < 28) { b.dead = true; continue; }
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }

      /* parede barra o tiro: o projetil estoura nela em vez de
         passar e acertar quem esta do outro lado */
      if (losBlocked(px0, py0, b.x, b.y)) {
        b.x = px0; b.y = py0;
        b.dead = true;
        burst(b.x, b.y, 3, b.color, 110);
        if (b.pierce > 1) SFX().hit();
        continue;
      }

      if (b.trail) {
        b.trailT -= dt;
        if (b.trailT <= 0) { b.trailT = 0.04; if (g.parts.length < 300) g.parts.push({ x: b.x + rand(-3, 3), y: b.y + rand(-3, 3), vx: rand(-15, 15), vy: rand(-15, 15), life: 0.22, size: b.r * 0.42, color: b.trail }); }
      }
      if (b.field) {
        b.fieldT -= dt;
        if (b.fieldT <= 0) { b.fieldT = 0.16; spawnField({ x: b.x, y: b.y, radius: b.fieldR || 30, dmg: b.field, life: b.fieldLife || 1.5, tick: 0.4, color: '#ff6a1f' }); }
      }

      /* colisão: só as células em volta do projétil */
      const cells = gatherCells(b.x, b.y, b.r + 46);
      for (let ci = 0; ci < cells.length && !b.dead; ci++) {
        const list = cells[ci];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead || (b.hit && b.hit.has(e))) continue;
          const rr = b.r + e.r;
          if (dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
          _o.knock = b.knock; _o.slow = b.slow || 0; _o.slowTime = b.slowTime || 0;
          _o.freeze = b.freeze || 0; _o.poison = b.poison || 0; _o.lifesteal = b.lifesteal || 0;
          _o.noCrit = false; _o.showNum = false;
          _o.dir = angleTo(b.x, b.y, e.x, e.y);
          damage(e, b.dmg, _o);
          SFX().hit();
          if (--b.pierce < 0) { killBullet(b); break; }
        }
      }

      if (!b.dead && (b.x < -60 || b.y < -60 || b.x > g.roomW + 60 || b.y > g.roomH + 60)) b.dead = true;
    }
    sweep(g.bullets);
  }

  function updateEBullets(dt) {
    const p = g.p;
    for (const b of g.ebullets) {
      b.life -= dt;
      if (b.shock) {                       /* onda de choque: so cresce, nao anda */
        b.r += b.speed * dt;
        if (b.life <= 0 || b.r >= b.rMax) { b.dead = true; continue; }
        if (!b.hit) {
          const d = dist(b.x, b.y, p.x, p.y);
          const band = b.r * 0.16 + p.r;
          if (d <= b.r + band) { b.hit = true; hurtPlayer(b.dmg, b); }
        }
        continue;
      }
      const ex0 = b.x, ey0 = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      /* o tiro do bixo tambem para na parede */
      if (losBlocked(ex0, ey0, b.x, b.y)) { b.dead = true; continue; }
      if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > g.roomW + 40 || b.y > g.roomH + 40) { b.dead = true; continue; }
      const rr = b.r + p.r;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        b.dead = true;
        hurtPlayer(b.dmg, b);
      }
    }
    sweep(g.ebullets);
  }

  function updateAoes(dt) {
    for (const a of g.aoes) {
      a.life -= dt;
      if (a.life <= 0) { a.dead = true; continue; }
      if (a.delay > 0) { a.delay -= dt; continue; }

      if (a.kind === 'ring') {
        const t = 1 - a.life / a.max;
        const r = U.lerp(a.r0, a.r1, t);
        a.r = r;
        const cells = gatherCells(a.x, a.y, r + 40);
        for (let ci = 0; ci < cells.length; ci++) {
          const list = cells[ci];
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e.dead || a.hit.has(e)) continue;
            const d = dist(a.x, a.y, e.x, e.y);
            if (d <= r + e.r && d >= r - 26) {
              if (losBlocked(a.x, a.y, e.x, e.y)) continue;   /* parede segura o anel */
              a.hit.add(e);
              _o.knock = a.knock || 0; _o.slow = a.slow || 0; _o.slowTime = a.slowTime || 0;
              _o.freeze = 0; _o.poison = 0; _o.lifesteal = 0; _o.noCrit = false; _o.showNum = false;
              _o.dir = angleTo(a.x, a.y, e.x, e.y);
              damage(e, a.dmg, _o);
              SFX().hit();
            }
          }
        }
        if (a.field && !a.dropped && t > 0.6) {
          a.dropped = true;
          spawnField({ x: a.x, y: a.y, radius: a.fieldR || 50, dmg: a.field, life: a.fieldLife || 3, tick: 0.4, color: '#ff6a1f' });
        }
        if (a.chain && !a.chained && t > 0.5) { a.chained = true; strikeLightning(a.x + rand(-a.r1 * 0.5, a.r1 * 0.5), a.y + rand(-a.r1 * 0.5, a.r1 * 0.5), a.dmg * 0.5, a.chain, '#a9ecff'); }
      } else if (a.kind === 'field') {
        a.tm -= dt;
        if (a.tm <= 0) { a.tm = a.tick; hitCircle(a.x, a.y, a.radius, a.dmg * a.tick, { noCrit: true }); }
      } else if (a.kind === 'cloud') {
        a.tm -= dt;
        if (a.tm <= 0) {
          a.tm = a.tick;
          const cells = gatherCells(a.x, a.y, a.radius + 40);
          for (let ci = 0; ci < cells.length; ci++) {
            const list = cells[ci];
            for (let i = 0; i < list.length; i++) {
              const e = list[i];
              if (e.dead) continue;
              const rr = a.radius + e.r;
              if (dist2(a.x, a.y, e.x, e.y) > rr * rr) continue;
              if (losBlocked(a.x, a.y, e.x, e.y)) continue;   /* nuvem nao corroe through parede */
              _o.knock = 0; _o.slow = 0; _o.slowTime = 0; _o.freeze = 0;
              _o.poison = a.dmg * 1.6; _o.lifesteal = 0; _o.noCrit = true; _o.showNum = false;
              _o.dir = angleTo(a.x, a.y, e.x, e.y);
              damage(e, a.dmg * a.tick, _o);
            }
          }
        }
      } else if (a.kind === 'meteor') {
        a.t += dt / a.fall;
        const k = clamp(a.t, 0, 1);
        a.x = a.sx + (a.tx - a.sx) * k;
        a.y = a.sy + (a.ty - a.sy) * k;
        if (k >= 1) {
          a.dead = true;
          spawnBoom({ x: a.x, y: a.y, radius: a.radius, dmg: a.dmg, color: a.color, knock: 260 });
          if (a.field) spawnField({ x: a.x, y: a.y, radius: a.radius * 0.8, dmg: a.field, life: a.fieldLife || 2.4, tick: 0.4, color: '#ff6a1f' });
          U.shake(90);
        }
      }
    }
    sweep(g.aoes);
  }

  function updateOrbiters(dt, semBixos) {
    const p = g.p;
    for (const o of g.orbiters) {
      o.a += o.speed * dt;
      o.x = p.x + Math.cos(o.a) * o.radius;
      o.y = p.y + Math.sin(o.a) * o.radius;
      if (semBixos) continue;
      o.hit.forEach((t, e) => { if (t <= 0) o.hit.delete(e); else o.hit.set(e, t - dt); });
      const cells = gatherCells(o.x, o.y, 13 + 40);
      for (let ci = 0; ci < cells.length; ci++) {
        const list = cells[ci];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.dead || o.hit.has(e)) continue;
          const rr = 13 + e.r;
          if (dist2(o.x, o.y, e.x, e.y) < rr * rr) {
            if (losBlocked(p.x, p.y, e.x, e.y)) continue;     /* orbe nao acerta pela parede */
            o.hit.set(e, o.hitCd || 0.4);
            _o.knock = 200; _o.slow = 0; _o.slowTime = 0; _o.freeze = 0; _o.poison = 0;
            _o.lifesteal = 0; _o.noCrit = false; _o.showNum = false;
            _o.dir = angleTo(o.x, o.y, e.x, e.y);
            damage(e, o.dmg, _o);
            SFX().hit();
          }
        }
      }
    }
  }

  /* ============================================================
     XP / NÍVEL
     ============================================================ */
  function addXP(n) {
    const p = g.p;
    p.xp += n; g.xpTotal += n;
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level++;
      p.nextXp = xpNeed(p.level);
      g.levelQueue++;
    }
    if (p.level > (g.meta.stats.level || 1)) { g.meta.stats.level = p.level; VS.Chars.sync(); }
    saveWorld();
    if (g.levelQueue > 0 && g.state === 'play') VS.UI.openLevelUp();
  }

  function collectGems(dt) {
    const p = g.p;
    const damp = Math.pow(0.001, dt);
    const SOFT = 520, SOFT2 = SOFT * SOFT;     /* alcance do "puxão leve" */
    const ALCANCE = 720, ALCANCE2 = ALCANCE * ALCANCE;
    const PEGADA = (p.r + 10) * (p.r + 10);
    for (const gm of g.gems) {
      gm.t += dt;
      gm.x += gm.vx * dt; gm.y += gm.vy * dt;
      gm.vx *= damp; gm.vy *= damp;

      /* dx/dy aponta DO PERSONAGEM PARA A GEMA */
      const dx = gm.x - p.x, dy = gm.y - p.y;
      const d2 = dx * dx + dy * dy;
      const reach = p.magnet * (gm.big ? 1.3 : 1);
      const reach2 = reach * reach;

      if (d2 < reach2) {
        /* dentro do ima: vem rapido */
        const d = Math.sqrt(d2) || 1;
        const f = clamp((reach - d) / 90, 0, 1) * 12 + 3;
        const k = f * 24 * dt / d;
        gm.x -= dx * k; gm.y -= dy * k;
      } else if (d2 < SOFT2 || (gm.t > 8 && d2 < ALCANCE2)) {
        /* fora do ima: ainda assim persegue devagar, o XP nao foge */
        const d = Math.sqrt(d2) || 1;
        const v = (d2 < SOFT2 ? 95 : 42) * dt / d;
        gm.x -= dx * v; gm.y -= dy * v;
      }

      if (d2 < PEGADA || gm.t > 45) {
        addXP(gm.val);
        if (chance(0.2)) SFX().gem();
        gm.dead = true;
      }
    }
    sweep(g.gems);
  }

  /* ============================================================
     XP PERDIDO? NÃO.
     Toda gema ainda no chão vira XP na hora: ao limpar a sala,
     ao trocar de sala e ao morrer. Nenhuma experiencia escapa.
     ============================================================ */
  function vacuumGems(silencioso) {
    if (!g.gems.length) return 0;
    let total = 0;
    for (const gm of g.gems) { total += gm.val; gm.dead = true; }
    sweep(g.gems);
    if (total > 0) {
      addXP(total);
      if (!silencioso) {
        texts(g.p.x, g.p.y - 40, '+' + Math.round(total) + ' XP', '#63e6a0');
        burst(g.p.x, g.p.y, 12, '#63e6a0', 200);
      }
    }
    return total;
  }

  /* ============================================================
     RELÍQUIAS — pedestal no meio da sala, pega encostando
     ============================================================ */
function spawnRelic() {
    const pool = [];
    for (const r of D.allRelics()) if (g.relicSeen.indexOf(r.id) < 0) pool.push(r);
    if (!pool.length) return null;                 /* ja pegou todas nesta partida */
    const r = pick(pool);
    g.relicSeen.push(r.id);
    const a = rand(TAU), d = rand(180, Math.min(520, Math.min(g.roomW, g.roomH) * 0.32));
    const x = clamp(g.p.x + Math.cos(a) * d, 100, g.roomW - 100);
    const y = clamp(g.p.y + Math.sin(a) * d, 100, g.roomH - 100);
    g.pedestals.push({ id: r.id, x, y, t: 0, taken: false, out: 0, dead: false });
    return r;
  }

  function rollRelicInRoom() {
    if (g.roomKind === 'setec') { spawnRelic(); return; }        /* sempre tem na SETEC */
    const odds = D.RELIC_CHANCE + (g.meta.bonus.relic || 0) * 0.12;
    if (chance(odds)) spawnRelic();
  }

  function updatePedestals(dt) {
    const p = g.p;
    for (const s of g.pedestals) {
      s.t += dt;
      if (s.taken) { s.out += dt; if (s.out > 0.6) s.dead = true; continue; }
      const dRelic = dist(p.x, p.y, s.x, s.y);
      if (dRelic < 82) {
        s.taken = true;
        grantRelic(s.id);
        burst(s.x, s.y, 24, '#ffcc4d', 240);
        U.shake(160);
      }
    }
    sweep(g.pedestals);
  }

  function drawPedestals(c) {
    const t = g.time;
    for (const s of g.pedestals) {
      const r = D.relic(s.id);
      if (!r) continue;
      const flut = 1 + Math.sin(t * 2.4 + s.x * 0.01) * 0.06;
      c.save();
      c.translate(s.x, s.y);
      if (s.taken) {
        c.globalAlpha = clamp(1 - s.out / 0.6, 0, 1) * 0.55;
      } else {
        /* coluna de luz */
        c.globalAlpha = 0.2 + Math.sin(t * 3) * 0.06;
        c.fillStyle = r.color;
        c.beginPath();
        c.moveTo(-15, 0); c.lineTo(-7, -118 * flut); c.lineTo(7, -118 * flut); c.lineTo(15, 0);
        c.closePath(); c.fill();
        c.globalAlpha = 1;
        /* base */
        c.fillStyle = '#2c2233';
        c.beginPath(); c.ellipse(0, 4, 21, 8, 0, 0, TAU); c.fill();
        c.strokeStyle = r.color; c.lineWidth = 2;
        c.beginPath(); c.ellipse(0, 4, 21, 8, 0, 0, TAU); c.stroke();
      }
      /* card da reliquia (arte de assets/relics) com moldura */
      const RW = 92, RH = 53;
      if (VS.SPR) {
        c.globalAlpha *= 1;
        /* brilho atras */
        c.save();
        c.globalAlpha = (s.taken ? clamp(1 - s.out / 0.6, 0, 1) : 1) * 0.3;
        c.fillStyle = r.color;
        c.fillRect(-RW / 2 - 3, -RH / 2 - 3, RW + 6, RH + 6);
        c.restore();
        VS.SPR.drawBox(c, 'relic_' + r.file.slice(-2), 0, -RH / 2 - 4, RW, RH);
        c.globalAlpha = s.taken ? clamp(1 - s.out / 0.6, 0, 1) : 1;
        c.strokeStyle = r.color; c.lineWidth = 2;
        c.strokeRect(-RW / 2, -RH / 2 - 4, RW, RH);
      }
      /* aviso de perto: ajuda a nao perder a reliquia */
      if (!s.taken) {
        const d = dist(g.p.x, g.p.y, s.x, s.y);
        if (d < 320) {
          c.globalAlpha = clamp((320 - d) / 180, 0.25, 1);
          c.font = 'bold 13px "Trebuchet MS", sans-serif';
          c.textAlign = 'center';
          c.fillStyle = '#000';
          c.fillText('✨ ' + r.name, 1, -RH / 2 - 14);
          c.fillStyle = r.color;
          c.fillText('✨ ' + r.name, 0, -RH / 2 - 15);
          c.globalAlpha = 1;
        }
      }
      c.restore();
    }
  }

  /* ============================================================
     BAÚS — abre pagando moedas
     ============================================================ */
  const TIERS = [
    { id: 'comum', name: 'Baú Comum', cost: 25, icon: '📦', color: '#c98a4b', w: 60 },
    { id: 'raro', name: 'Baú Raro', cost: 90, icon: '🎁', color: '#4b9dc9', w: 28 },
    { id: 'epico', name: 'Baú Épico', cost: 220, icon: '💠', color: '#b14bff', w: 12 }
  ];

  function spawnChest(force) {
    let tier;
    if (force) tier = typeof force === 'string' ? (TIERS.find(t => t.id === force) || TIERS[0]) : force;
    else {
      const luck = g.p.luck;
      const weights = TIERS.map((t, i) => t.w * (i === 0 ? 1 - luck * 0.12 : 1 + luck * 0.22));
      let tot = 0; for (const w of weights) tot += w;
      let r = Math.random() * tot;
      tier = TIERS[0];
      for (let i = 0; i < TIERS.length; i++) { r -= weights[i]; if (r <= 0) { tier = TIERS[i]; break; } }
    }
    const a = rand(TAU), d = rand(170, 340);
    const x = clamp(g.p.x + Math.cos(a) * d, 60, g.roomW - 60);
    const y = clamp(g.p.y + Math.sin(a) * d, 60, g.roomH - 60);
    g.chests.push({ id: g.eid++, x, y, tier, r: 22, t: 0, open: false, dead: false });
  }

  /* baú da sala SETEC: vários, e alguns de graça */
  const SETEC_TIERS = [
    { id: 'epico', name: 'Baú SETEC', cost: 0, icon: '💠', color: '#00e5ff' },
    { id: 'raro', name: 'Baú SETEC Raro', cost: 0, icon: '🎁', color: '#4be3ff' },
    { id: 'raro', name: 'Baú Raro', cost: 90, icon: '🎁', color: '#4b9dc9' },
    { id: 'comum', name: 'Baú Comum', cost: 25, icon: '📦', color: '#c98a4b' }
  ];

  function spawnSetecChests() {
    const S = D.SETEC;
    const n = S.chestsMin + randInt(0, S.chestsMax - S.chestsMin);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.4, 0.4);
      const d = rand(150, Math.min(520, Math.min(g.roomW, g.roomH) * 0.34));
      const x = clamp(g.p.x + Math.cos(a) * d, 90, g.roomW - 90);
      const y = clamp(g.p.y + Math.sin(a) * d, 90, g.roomH - 90);
      const tier = i < S.freeChests ? pick(SETEC_TIERS.slice(0, 2)) : pick(SETEC_TIERS);
      g.chests.push({ id: g.eid++, x, y, tier, r: 24, t: 0, open: false, dead: false });
    }
  }

  function updateChests(dt) {
    const p = g.p;
    let near = null, nd = 1e9;
    for (const c of g.chests) {
      c.t += dt;
      if (c.open) { c.dead = true; continue; }
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < nd) { nd = d; near = c; }
    }
    g.nearChest = (near && nd < 135) ? near : null;
    /* o aviso do baú e desenhado junto com o HUD (12x por segundo) */
  }

  function openChest() {
    const c = g.nearChest;
    if (!c || !c.tier || c.open) return;
    if (g.money < c.tier.cost) { VS.UI.toast('Moedas insuficientes! (' + Math.floor(g.money) + '/' + c.tier.cost + ')'); SFX().deny(); return; }
    g.money -= c.tier.cost;
    c.open = true;
    g.chestsOpened++;
    VS.Chars.note('chests');
    SFX().chest();
    U.shake(160);
    burst(c.x, c.y, 22, c.tier.color, 260);

    const owned = g.p.weapons.filter(w => w.level < D.def(w.id).max);
    const free = g.p.weapons.length < g.p.slots;
    /* baú tambem sorteia entre TODAS as armas, nao so as do personagem */
    const pool = D.allWeapons().filter(d2 => !g.p.weapons.some(w => w.id === d2.id));
    const msg = [];

    if (c.tier.id === 'comum') {
      if (free && pool.length && chance(0.45)) { const id = pick(pool).id; addWeapon(id); msg.push('NOVA ARMA: ' + D.def(id).name); }
      if (owned.length && chance(0.85)) { const w = pick(owned); w.level++; msg.push(D.def(w.id).name + ' +1 nível'); }
      if (!msg.length) { heal(g.p.maxHp * 0.3); msg.push('Recuperou 30% de vida'); }
    } else if (c.tier.id === 'raro') {
      if (free) {
        const rest = pool.filter(d2 => !g.p.weapons.some(w => w.id === d2.id));
        if (rest.length) { const id = pick(rest).id; addWeapon(id); msg.push('NOVA ARMA: ' + D.def(id).name); }
        else { owned.forEach(w => w.level = Math.min(D.def(w.id).max, w.level + 1)); msg.push('Todas as armas +1 nível'); }
      } else {
        owned.slice(0, 2).forEach(w => w.level = Math.min(D.def(w.id).max, w.level + 1));
        msg.push('+1 nível nas 2 primeiras armas');
      }
      const bonus = 15 + g.p.luck * 5;
      grantGems(bonus); msg.push('+' + bonus + ' 💎');
    } else {
      owned.forEach(w => w.level = Math.min(D.def(w.id).max, w.level + 2));
      if (owned.length < g.p.slots) { const rest = pool.filter(d2 => !g.p.weapons.some(w => w.id === d2.id)); if (rest.length) addWeapon(pick(rest).id); }
      heal(g.p.maxHp * 0.6);
      const bonus = 60 + g.p.luck * 10;
      grantGems(bonus);
      msg.push('ARMA +2 NÍVEIS', 'Vida restaurada', '+' + bonus + ' 💎');
    }
    checkFusions();
    VS.Chars.sync();
    saveWorld();
    VS.UI.toast(c.tier.icon + ' ' + c.tier.name + ' → ' + msg.join(' · '), 3200);
  }

  function grantGems(n) {
    const v = Math.round(n);
    g.runGems += v;
    g.meta.gems += v;
    persist();
    VS.UI.syncHud();
  }

  /* ============================================================
     SALAS E FASES
     - cada fase tem 7 a 9 salas
     - a sala anterior e APAGADA quando voce entra na seguinte
     - 5% de chance de cair numa SALA SETEC (varios baus)
     - quanto mais fundo, mais bixos
     ============================================================ */
  function spawnEnemy(type, x, y) {
    if (g.enemyCount >= liveCap() + 20) return null;
    const e = E.make(g, type, x, y);
    g.enemies.push(e);
    g.enemyCount++;
    /* a mecânica da sala pode modificar quem acabou de nascer
       (escudo, elite, eco que clona…) */
    VS.Mechanics.onSpawn(g, e);
    return e;
  }

  /* teto de inimigos vivos: o motor ajusta pela performace */
  function liveCap() {
    const base = clamp(34 + g.phase * 13 + g.room * 2, 34, 150);
    return Math.round(base * (g.perf.quality || 1));
  }

  function roomBudget() {
    const m = g.mode;
    if (g.roomKind === 'setec') return Math.round(4 + g.phase * 1.6);
    /* arenas com obstaculo tem mais bixos: eles te empurram contra as paredes */
    const rate = m.rate * (g.arenaId !== D.ARENA_PADRAO ? (g.arena.rateMul || 1) : 1);
    return Math.round(clamp((26 + g.phase * 10 + g.room * 5) * rate, 6, 190));
  }

  function rollRoomKind() {
    /* chefe a partir da sala BOSS_ROOM (5) em todas as fases; a ultima sala
       da fase tem o chefe forte, a sala 5 e o mini-chefe */
    const chefe = g.room >= D.BOSS_ROOM;
    /* a sala do chefe nunca pode virar SETEC */
    g.roomKind = (!chefe && g.room < g.roomsTotal && chance(D.SETEC.chance)) ? 'setec' : 'normal';
    g.bossRoom = chefe;
    g.bossMini = chefe && g.room < g.roomsTotal;

    /* ---- ARENA ----
       A sala do chefe e a SETEC ficam sempre no campo aberto: obstaculo
       em volta de um chefe so deixa a briga injusta, e a SETEC e feita
       de baus espalhados. */
    g.arenaId = (!chefe && g.roomKind === 'normal' && chance(D.ARENA_CHANCE)) ? rollArena() : D.ARENA_PADRAO;
  }

  /* sorteia uma arena com obstaculos (nunca devolve a de campo aberto) */
  function rollArena() {
    const lista = [];
    for (const id in D.ARENAS) {
      if (id === D.ARENA_PADRAO) continue;
      lista.push(D.ARENAS[id]);
    }
    if (!lista.length) return D.ARENA_PADRAO;
    return pick(lista).id;
  }

  /* ============================================================
     ARENAS — obstaculos da sala
     ------------------------------------------------------------
     Tudo em coordenadas de mundo (a camera desenha em 0,0 = canto
     da sala, entao nao ha queconverter).

     Regra que garante que a sala e sempre jogavel:
       · nada e posto em cima da PORTA (a faixa livre da saida)
       · nada e posto em cima do CENTRO (onde voce nasce)
       · a PORTA fica num "corredor" livre ate a borda da sala
       · obstaculos nunca se sobrepoem entre si com folga de sobra
     ============================================================ */
  const OBST_CLEAR_PORTA = 190;   /* raio livre em volta da porta */
  const OBST_CLEAR_CENTRO = 210;  /* raio livre em volta do centro */
  const OBST_GAP = 74;            /* folga entre obstaculos (passa o jogador) */

  /* dist² do ponto ate o retangulo (0 se dentro) */
  function _rectDist2(px, py, o) {
    const dx = Math.max(Math.abs(px - o.x) - o.hw, 0);
    const dy = Math.max(Math.abs(py - o.y) - o.hh, 0);
    return dx * dx + dy * dy;
  }
  /* raio que um obstaculo ocupa do seu centro, para comparar com outros */
  function _obsReach(o) {
    return o.kind === 'rect' ? Math.hypot(o.hw, o.hh) : (o.r || 0);
  }
  /* ponto do obstaculo mais proximo de (px,py) + true se ha sobreposicao */
  function _obsHits(px, py, rad, o) {
    if (o.kind === 'rect') return _rectDist2(px, py, o) < rad * rad;
    return dist2(px, py, o.x, o.y) < (rad + o.r) * (rad + o.r);
  }
  /* o ponto esta dentro do obstaculo (com folga)? */
  function _obsContains(px, py, rad, o) {
    if (o.kind === 'rect') return _rectDist2(px, py, o) <= rad * rad;
    return dist2(px, py, o.x, o.y) <= (rad + o.r) * (rad + o.r);
  }

  /* esse ponto bate em algum obstaculo? */
  function _obsBlocked(x, y, rad) {
    const obs = g.obstacles;
    for (let i = 0; i < obs.length; i++) {
      if (_obsHits(x, y, rad, obs[i])) return true;
    }
    return false;
  }

  /* menor deslocamento que tira (x,y) de fora do obstaculo.
     fromX/fromY = de onde veio: quando esse ponto estava LIVRE, a saida
     e por aquele mesmo lado, entao ninguem e expulso para o lado de
     dentro da parede. Devolve false quando o ponto ja esta livre. */
  function _obsEscape(x, y, rad, o, fromX, fromY, out) {
    let nx = x, ny = y, pen = 0;

    if (o.kind === 'rect') {
      const sx = x - o.x, sy = y - o.y;
      /* ponto mais proximo do retangulo */
      const qx = o.x + clamp(sx, -o.hw, o.hw);
      const qy = o.y + clamp(sy, -o.hh, o.hh);
      /* de onde veio: se aquele ponto nao batia no obstaculo, e ele que
         manda na direcao da saida (nunca atravessar a parede) */
      const ax = fromX === undefined ? x : fromX, ay = fromY === undefined ? y : fromY;
      let rx = ax - qx, ry = ay - qy;
      if (fromX === undefined || _obsHits(ax, ay, rad, o)) { rx = x - qx; ry = y - qy; }
      let d = Math.hypot(rx, ry);

      if (d > 1e-6) {
        /* fora do retangulo: empurra na reta que passa pelo ponto mais
           proximo (e nao pelo eixo mais fundo: era isso que jogava o
           jogador para o lado oposto quando a parede era fina) */
        nx = rx / d; ny = ry / d;
        pen = rad - _distToObs(x, y, o);
      } else {
        /* centro dentro do retangulo: sai pela face mais proxima */
        const dx = o.hw - Math.abs(sx), dy = o.hh - Math.abs(sy);
        if (dx <= dy) { nx = sx < 0 ? -1 : 1; ny = 0; pen = dx + rad; }
        else { nx = 0; ny = sy < 0 ? -1 : 1; pen = dy + rad; }
      }
    } else {
      /* circulo (e o anel, que e um circulo com furo) */
      let rx = x - o.x, ry = y - o.y;
      if (fromX !== undefined && !_obsHits(fromX, fromY, rad, o)) { rx = fromX - o.x; ry = fromY - o.y; }
      let d = Math.hypot(rx, ry);
      if (d < 1e-4) { const a = rand(0, TAU); rx = Math.cos(a); ry = Math.sin(a); d = 1; }
      nx = rx / d; ny = ry / d;
      pen = rad + o.r - _distToObs(x, y, o);
    }

    if (pen <= 0) return false;
    out.x = o.x + (o.kind === 'rect' ? clamp(x - o.x, -o.hw, o.hw) + nx * (pen + 0.01) : nx * (pen + 0.01));
    out.y = o.y + (o.kind === 'rect' ? clamp(y - o.y, -o.hh, o.hh) + ny * (pen + 0.01) : ny * (pen + 0.01));
    return true;
  }

  /* distancia do ponto ate a borda do obstaculo (0 se dentro) */
  function _distToObs(x, y, o) {
    if (o.kind === 'rect') return Math.sqrt(_rectDist2(x, y, o));
    const d = dist(x, y, o.x, o.y);
    if (d < o.r) return 0;
    if (o.th !== undefined && d > o.r - o.th / 2) return d - (o.r - o.th / 2);
    return d - o.r;
  }

  /* ============================================================
     MOVIMENTO COM OBSTACULOS — o que segura o jogador (e o bixo)
     dentro da sala sem teleportar para o lado de dentro da parede.

     O truque e simples e e o mesmo dos platformers:
       · o movimento e quebrado em passos pequenos (nenhum passo
         atravessa uma parede fina)
       · cada passo testa o eixo X sozinho; se bateu, so o X volta
       · depois testa o eixo Y sozinho; se bateu, so o Y volta
     Assim o corpo escorrega rente a parede, trava no eixo mesmo e
     nunca aparece do outro lado. O empurrao antigo (sair pelo eixo
     mais fundo) jogava quem encostava numa parede fina 20px para
     cima/baixo: era o "teleporte".
     ============================================================ */
  const PASSO_COLISAO = 6;      /* px por sub-passo */
  const _mout = { x: 0, y: 0 };

  /* (x,y) esta livre? */
  function obsFreeAt(x, y, rad) {
    return !_obsBlocked(x, y, rad);
  }

  /* mexe o corpo respeitando as paredes. Devolve true se travou. */
  function moveBody(ent, dx, dy, rad) {
    if (ent.lx === undefined) { ent.lx = ent.x; ent.ly = ent.y; }

    /* Ja comecou o passo dentro de uma parede? (empurrao forte, spawn
       em cima de algo): volta para a ultima posicao livre. */
    if (_obsBlocked(ent.x, ent.y, rad)) {
      if (ent.lx !== ent.x || ent.ly !== ent.y) {
        if (obsFreeAt(ent.lx, ent.ly, rad)) { ent.x = ent.lx; ent.y = ent.ly; }
      }
      if (_obsBlocked(ent.x, ent.y, rad)) {
        pushOutOfObstacles(ent.x, ent.y, rad, ent.lx, ent.ly, _mout);
        ent.x = _mout.x; ent.y = _mout.y;
      }
    }

    const passos = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PASSO_COLISAO));
    const sx = dx / passos, sy = dy / passos;
    let bateu = false;
    for (let i = 0; i < passos; i++) {
      const nx = ent.x + sx;
      if (obsFreeAt(nx, ent.y, rad)) ent.x = nx; else bateu = true;
      const ny = ent.y + sy;
      if (obsFreeAt(ent.x, ny, rad)) ent.y = ny; else bateu = true;
    }
    /* O passo por eixo nao deveria entrar em nada, mas se entrou
       (parede muito fina com passo grande) refaz a saida. */
    if (_obsBlocked(ent.x, ent.y, rad)) {
      pushOutOfObstacles(ent.x, ent.y, rad, ent.lx, ent.ly, _mout);
      ent.x = _mout.x; ent.y = _mout.y;
      bateu = true;
    }
    ent.lx = ent.x; ent.ly = ent.y;
    return bateu;
  }

  function pushOutOfObstacles(px, py, rad, fromX, fromY, out) {
    out = out || _mout;
    let x = px, y = py;
    /* Repete ate estabilizar: sair de um obstaculo pode colocar dentro
       do vizinho. Cada passada escolhe o obstaculo mais penetrado.
       O melhor e guardado em numeros (o _mout e reaproveitado a cada
       obstaculo, guardar o ponteiro sobrescrevia a escolha). */
    const MAX_PASS = 24;
    for (let pass = 0; pass < MAX_PASS; pass++) {
      let melhor = -1, ax = 0, ay = 0;
      for (const o of g.obstacles) {
        if (!_obsHits(x, y, rad, o)) continue;
        if (!_obsEscape(x, y, rad, o, fromX, fromY, _mout)) continue;
        const pen = dist2(x, y, _mout.x, _mout.y);
        if (pen > melhor) { melhor = pen; ax = _mout.x; ay = _mout.y; }
      }
      if (melhor < 0) break;                   /* livre: acabou */
      x = ax; y = ay;
      x = clamp(x, rad, g.roomW - rad);
      y = clamp(y, rad, g.roomH - rad);
    }
    /* Ainda preso (parede muito grande ou duas coladas): procura a
       primeira casa livre em volta. Sem isso o bixo ficaria parado. */
    if (_obsBlocked(x, y, rad)) {
      const acha = nearestFreeSpot(x, y, rad);
      if (acha) { x = acha.x; y = acha.y; }
    }
    out.x = x; out.y = y;
    return out;
  }

  /* primeiro ponto livre num anel em volta de (x,y) */
  function nearestFreeSpot(x, y, rad) {
    const raios = [4, 10, 18, 28, 42, 60, 84];
    for (let ri = 0; ri < raios.length; ri++) {
      const rr = raios[ri];
      for (let a = 0; a < 8; a++) {
        const ang = a * TAU / 8;
        const px = clamp(x + Math.cos(ang) * rr, rad, g.roomW - rad);
        const py = clamp(y + Math.sin(ang) * rr, rad, g.roomH - rad);
        if (obsFreeAt(px, py, rad)) { _mout.x = px; _mout.y = py; return _mout; }
      }
    }
    return null;
  }

  /* ============================================================
     LINHA DE VISADA — parede barra o ataque
     Nenhum golpe atravessa a parede: o projetil morre nela e as
     areas instantaneas so acertam quem esta do mesmo lado. Teste
     de segmento contra obstaculo, sem alocar nada.
     ============================================================ */
  /* o segmento (x0,y0)->(x1,y1) corta o retangulo? */
  function _segRect(x0, y0, x1, y1, o) {
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    if (dx > -1e-6 && dx < 1e-6) {
      if (x0 < o.x - o.hw || x0 > o.x + o.hw) return false;
    } else {
      let ta = (o.x - o.hw - x0) / dx, tb = (o.x + o.hw - x0) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    if (dy > -1e-6 && dy < 1e-6) {
      if (y0 < o.y - o.hh || y0 > o.y + o.hh) return false;
    } else {
      let ta = (o.y - o.hh - y0) / dy, tb = (o.y + o.hh - y0) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }

  /* o segmento (x0,y0)->(x1,y1) corta o circulo? */
  function _segCircle(x0, y0, x1, y1, o) {
    const dx = x1 - x0, dy = y1 - y0;
    const fx = x0 - o.x, fy = y0 - o.y;
    const a = dx * dx + dy * dy;
    if (a < 1e-6) return fx * fx + fy * fy < o.r * o.r;
    let t = -(fx * dx + fy * dy) / a;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = fx + dx * t, cy = fy + dy * t;
    return cx * cx + cy * cy < o.r * o.r;
  }

  /* tem parede entre (x0,y0) e (x1,y1)? */
  function losBlocked(x0, y0, x1, y1) {
    const obs = g.obstacles;
    if (!obs.length) return false;
    /* alvo colado na origem: nao da tempo de ter parede no meio */
    const dx = x1 - x0, dy = y1 - y0;
    if (dx * dx + dy * dy < 16) return false;
    const minX = x0 < x1 ? x0 : x1, maxX = x0 < x1 ? x1 : x0;
    const minY = y0 < y1 ? y0 : y1, maxY = y0 < y1 ? y1 : y0;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const r = o.kind === 'rect' ? (o.hw > o.hh ? o.hw : o.hh) : o.r;
      if (maxX < o.x - r || minX > o.x + r) continue;
      if (maxY < o.y - r || minY > o.y + r) continue;
      if (o.kind === 'rect' ? _segRect(x0, y0, x1, y1, o) : _segCircle(x0, y0, x1, y1, o)) return true;
    }
    return false;
  }

  /* o obstaculo pode ser placed aqui? */
  function _obsFree(x, y, reach, margin) {
    const m = margin === undefined ? OBST_GAP : margin;
    /* nunca em cima do centro (o nascimento) nem da porta (a saida) */
    if (dist2(x, y, g.roomW / 2, g.roomH / 2) < (OBST_CLEAR_CENTRO + reach) * (OBST_CLEAR_CENTRO + reach)) return false;
    if (dist2(x, y, g.door.x, g.door.y) < (OBST_CLEAR_PORTA + reach) * (OBST_CLEAR_PORTA + reach)) return false;
    for (const o of g.obstacles) {
      const min = m + reach + _obsReach(o);
      if (dist2(x, y, o.x, o.y) < min * min) return false;
    }
    return true;
  }

  /* espalha um obstaculo do tipo pedido, tentando N vezes achar um lugar */
  function _placeOne(spec) {
    const tries = 60;
    for (let t = 0; t < tries; t++) {
      let o;
      if (spec.kind === 'circle') {
        o = { kind: 'circle', r: rand(spec.r[0], spec.r[1]), x: 0, y: 0, color: spec.color };
      } else if (spec.kind === 'rect') {
        o = { kind: 'rect', hw: rand(spec.hw[0], spec.hw[1]), hh: rand(spec.hh[0], spec.hh[1]), x: 0, y: 0, color: spec.color };
      } else {
        continue;
      }
      /* margin = metade do obstaculo + folga, para nao encostar na parede */
      const edge = o.kind === 'rect' ? Math.max(o.hw, o.hh) : o.r;
      const x = rand(edge + 30, g.roomW - edge - 30);
      const y = rand(edge + 30, g.roomH - edge - 30);
      o.x = x; o.y = y;
      if (_obsFree(x, y, edge, edge + OBST_GAP)) { g.obstacles.push(o); return o; }
    }
    return null;
  }

  /* grade de blocos com espacamento regular (Xadrez) */
  function _placeGrid(spec) {
    const step = rand(spec.step[0], spec.step[1]);
    const cols = Math.max(2, Math.floor((g.roomW - 220) / step));
    const rows = Math.max(2, Math.floor((g.roomH - 220) / step));
    const offX = (g.roomW - (cols - 1) * step) / 2;
    const offY = (g.roomH - (rows - 1) * step) / 2;
    /* remove o bloco central e o mais proximo da porta: o jogador precisa
       nascer e sair sem ter que passar por dentro de nada */
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (iy === cy && Math.abs(ix - cx) <= 1) continue;
        const x = offX + ix * step, y = offY + iy * step;
        /* o tamanho e sorteado ANTES da checagem: senao a folga medida
           nao bate com o bloco que vai existir de verdade */
        const hw = rand(spec.hw[0], spec.hw[1]), hh = rand(spec.hh[0], spec.hh[1]);
        const reach = Math.max(hw, hh);
        if (!_obsFree(x, y, reach, reach + step * 0.18)) continue;
        g.obstacles.push({ kind: 'rect', hw, hh, x, y, color: spec.color });
      }
    }
  }

  /* arco de blocos em circulo, com VAOS abertos (Arena / O Anel).
     Voce nasce no centro, entao o arco precisa de passagem: um vao aponta
     direto para a porta e os outros ficam espalhados. */
  function _placeArc(spec) {
    const cx = g.roomW / 2, cy = g.roomH / 2;
    const b = rand(spec.bloco[0], spec.bloco[1]);
    /* o raio tem de caber na sala com folga para andar por fora do arco */
    const maxR = Math.min(g.roomW, g.roomH) / 2 - b - OBST_GAP - 40;
    const r = Math.min(rand(spec.r[0], spec.r[1]), maxR);
    if (r < 120) return;

    const nVaos = spec.vaos || 2;
    const angPorta = Math.atan2(g.door.y - cy, g.door.x - cx);
    const largura = 1.3;                      /* abertura de cada vao (rad) */
    const vaos = [angPorta];
    for (let i = 1; i < nVaos; i++) {
      for (let t = 0; t < 40; t++) {
        const a = rand(0, TAU);
        let ok = true;
        for (const v of vaos) {
          const d = Math.abs(((a - v + Math.PI * 3) % TAU) - Math.PI);
          if (d < largura * 2.5) { ok = false; break; }
        }
        if (ok) { vaos.push(a); break; }
      }
    }
    const emVao = (ang) => {
      for (const v of vaos) {
        const d = Math.abs(((ang - v + Math.PI * 3) % TAU) - Math.PI);
        if (d < largura) return true;
      }
      return false;
    };

    /* percorre o circulo e joga blocos onde nao ha vao */
    const passo = b * 1.5 / r;                 /* em radianos */
    for (let a = 0; a < TAU; a += passo) {
      if (emVao(a)) continue;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      /* margem pequena entre vizinhos: o arco e uma parede continua, so
         precisa respeitar o nascimento e a porta */
      if (!_obsFree(x, y, b, b * 0.35)) continue;
      g.obstacles.push({ kind: 'circle', r: b, x, y, color: spec.color });
    }
  }

  function buildArena(id) {
    const def = D.ARENAS[id] || D.ARENAS[D.ARENA_PADRAO];
    g.arena = def;
    g.obstacles.length = 0;
    if (!def.obs || !def.obs.length) return;

    for (const spec of def.obs) {
      if (spec.kind === 'grid') { _placeGrid(spec); continue; }
      if (spec.kind === 'arc') { _placeArc(spec); continue; }
      /* quantos destes tipo cabem na sala */
      const n = spec.kind === 'rect'
        ? Math.round(6 + g.phase * 0.6)
        : Math.round(9 + g.phase * 0.9);
      for (let i = 0; i < n; i++) _placeOne(spec);
    }
  }

  function drawObstacles(c) {
    if (!g.obstacles.length) return;
    for (const o of g.obstacles) {
      c.save();
      c.fillStyle = o.color;
      if (o.kind === 'circle') {
        c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 2; c.stroke();
      } else if (o.kind === 'rect') {
        c.beginPath(); c.rect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 2; c.stroke();
      } else {
        /* anel: dois arcos, o de dentro some (fill even-odd) */
        c.beginPath();
        c.arc(o.x, o.y, o.r + o.th / 2, 0, TAU);
        c.arc(o.x, o.y, o.r - o.th / 2, 0, TAU, true);
        c.fill('evenodd');
        c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 2; c.stroke();
      }
      c.restore();
    }
  }

  /* entra numa sala: apaga a anterior e monta a nova */
  function enterRoom(first) {
    /* o XP que ficou no chao da sala anterior entra na sua conta */
    if (!first) vacuumGems(true);

    g.enemies.length = 0; g.enemyCount = 0;
    g.bullets.length = 0; g.ebullets.length = 0; g.aoes.length = 0; g.orbiters.length = 0;
    g.gems.length = 0; g.chests.length = 0; g.parts.length = 0; g.texts.length = 0;
    /* so os pedestais da sala sao apagados — as reliquias que voce ja pegou
       valem a PARTIDA inteira, entao elas ficam */
    g.pedestals.length = 0;
    g.boss = null; g.bossSoon = 0; g.bossPending = false;
    g.wave = 0; g.waveIdx = 0; g.waveT = 0; g.trickle = 0;
    g.roomSpawned = 0; g.roomKills = 0; g.roomCleared = false;
    g.nearChest = null;
    g.depth = (g.phase - 1) * 9 + g.room;

    if (!first) { heal(g.p.maxHp * 0.1); }

    /* ---- arena: obstaculos e cores do chão ---- */
    buildArena(g.arenaId);

    /* chão novo */
    g.decos.length = 0;
    const dark = g.roomKind === 'setec' ? ['#0d2a30', '#0a2028']
      : g.bossRoom ? ['#2a1420', '#20101a']
        : (g.arena.floor || ['#241a38', '#1c1430']);
    for (let i = 0; i < 320; i++) {
      g.decos.push({ x: rand(0, g.roomW), y: rand(0, g.roomH), r: rand(1.5, 4), c: chance(.5) ? dark[0] : dark[1] });
    }

    g.roomWaves = clamp(3 + Math.floor(g.room / 2) + Math.floor(g.phase / 3), 3, 7);
    /* a sala dura ~26s: as ondas se ajustam ao numero de ondas da sala */
    g.roomWaveTime = clamp(26 / g.roomWaves, 3.5, g.mode.waveTime);
    g.roomTotal = roomBudget();

    /* ---- mecânica da sala: uma das 20, sorteada ---- */
    VS.Mechanics.enter(g);
    const mech = VS.Mechanics.info(g);

    if (g.roomKind === 'setec') {
      spawnSetecChests();
      const bonus = 12 + g.phase * 4;
      g.money += bonus; g.goldTotal += bonus;
      grantGems(4 + g.phase);
      VS.UI.roomBanner('🔐 SALA SETEC! ' + D.SETEC.tag + ' — ' + g.chests.length + ' baús, vários grátis!', 3200);
      SFX().chest();
      VS.UI.toast('🔐 SALA SETEC — sem mecânica hoje', 2200);
    } else if (g.bossRoom) {
      g.bossPending = true;
      g.bossSoon = 4;
      VS.UI.roomBanner(
        (g.bossMini ? '☠️ MINI-CHEFE na sala ' + g.room + ' — fase ' + g.phase + '!'
          : '💀 SALA DO CHEFE — fase ' + g.phase + '!'), 2600);
    } else {
      const arena = g.arenaId !== D.ARENA_PADRAO ? ' · ' + g.arena.nome.toUpperCase() : '';
      VS.UI.roomBanner('SALA ' + g.room + '/' + g.roomsTotal + arena, arena ? 2000 : 1400);
      if (mech) VS.UI.toast(mech.icon + ' MECÂNICA: ' + mech.nome + ' — ' + mech.desc, 4200);
    }

    startWave();
    rollRelicInRoom();
    buildGrid();
    g.door.open = false;
    VS.UI.syncHud();
  }

  /* onda dentro da sala */
  function startWave() {
    if (g.roomSpawned >= g.roomTotal) return;
    g.wave++;
    g.waveIdx = g.wave;
    const left = g.roomTotal - g.roomSpawned;
    const wleft = Math.max(1, g.roomWaves - g.wave + 1);
    let n = Math.ceil(left / wleft);
    /* enxame em alguns tipos de onda */
    const isSwarmWave = g.depth >= 3 && g.wave % 3 === 0;
    n = Math.min(n, Math.max(2, liveCap() - g.enemyCount));
    for (let i = 0; i < n; i++) {
      const pos = ringSpawn(10, 130);
      spawnEnemy(isSwarmWave ? 'swarm' : E.pickType(g.depth), pos.x, pos.y);
      g.roomSpawned++;
    }
    if (g.wave > 1) {
      VS.UI.toast('⚔ ONDA ' + g.wave + '/' + g.roomWaves + (isSwarmWave ? ' — ENXAME!' : ''), 1300);
      U.shake(120);
    }
  }

  function clearRoom() {
    g.roomCleared = true;
    g.door.open = true;
    const coin = 8 + g.phase * 4 + g.room * 2;
    g.money += coin; g.goldTotal += coin;
    heal(g.p.maxHp * 0.12);
    vacuumGems();          /* junta todo o XP que sobrou na sala */
    VS.UI.roomBanner('SALA LIMPA! Saída liberada →', 2400);
    SFX().chest();
    U.shake(220);
    VS.Chars.sync();
    saveWorld();
  }

  function nextRoom() {
    VS.Chars.note('rooms');
    VS.Chars.sync();
    saveWorld();
    if (g.room >= g.roomsTotal) { nextPhase(); return; }
    g.room++;
    rollRoomKind();
    enterRoom(false);
  }

  function nextPhase() {
    VS.Chars.note('phases');
    VS.Chars.sync();
    saveWorld();
    const m = g.mode;
    if (m.fases && g.phase >= m.fases) { win(); return; }
    g.phase++;
    g.room = 1;
    g.roomsTotal = 7 + randInt(0, 2);
    rollRoomKind();
    enterRoom(false);
    VS.UI.roomBanner('FASE ' + g.phase + (m.fases ? ' / ' + m.fases : ''), 2800);
    U.shake(400);
    SFX().fusion();
  }

  function win() {
    if (g.won) return;
    g.won = true;
    g.state = 'over';
    SFX().fusion();
    U.shake(600);
    burst(g.p.x, g.p.y, 46, '#ffd76a', 280);
    VS.UI.gameOver(true);
  }

  /* porta de saida: e so passar por cima dela com a sala limpa */
  function updateDoor(dt) {
    if (g.state !== 'play') return;
    const p = g.p;
    if (!g.roomCleared) { g.door.open = false; return; }
    g.door.open = true;
    if (dist(p.x, p.y, g.door.x, g.door.y) < 74) nextRoom();
  }

  /* nasce logo FORA da area visivel (entram andando na tela) */
  function ringSpawn(rMin, rMax) {
    const p = g.p;
    let x = 0, y = 0;
    const base = Math.max(300, Math.min(g.W, g.H) / 2 + 40);
    for (let tries = 0; tries < 8; tries++) {
      const hw = base + rMin + rand(0, Math.max(10, rMax - rMin));
      const hh = base + rMin + rand(0, Math.max(10, rMax - rMin));
      if (chance(0.5)) {
        x = p.x + (chance(0.5) ? -hw : hw);
        y = p.y + rand(-hh, hh);
      } else {
        y = p.y + (chance(0.5) ? -hh : hh);
        x = p.x + rand(-hw, hw);
      }
      x = clamp(x, 24, g.roomW - 24);
      y = clamp(y, 24, g.roomH - 24);
      if (dist(x, y, p.x, p.y) > 240) break;   /* nao nascer em cima do jogador */
    }
    return { x, y };
  }

  function updateWaves(dt) {
    const p = g.p;

    /* chefe da ultima sala da fase */
    if (g.bossPending && !g.boss) {
      g.bossSoon -= dt;
      if (g.bossSoon <= 0) { g.bossPending = false; spawnBoss(); }
    }

    /* ondas da sala */
    if (g.roomSpawned < g.roomTotal) {
      const relogio = 1 - clamp(p.slowWave || 0, 0, 0.6);   /* Relogio Quebrado */
      g.waveT += dt;
      if (g.waveT >= g.roomWaveTime * relogio) { g.waveT = 0; startWave(); }
      /* gotejamento para a sala nunca ficar vazia */
      const floor = Math.min(10 + g.phase * 2, Math.max(2, liveCap() * 0.35));
      if (g.enemyCount < floor) {
        g.trickle -= dt;
        if (g.trickle <= 0) {
          g.trickle = 0.3 * relogio;
          const pos = ringSpawn(10, 130);
          spawnEnemy(E.pickType(g.depth), pos.x, pos.y);
          g.roomSpawned++;
        }
      }
    }

    /* sala limpa? */
    if (!g.roomCleared && !g.bossPending && !g.boss &&
        g.roomSpawned >= g.roomTotal && g.enemyCount === 0) clearRoom();

    /* baú solto (a sala SETEC ja vem cheia) */
    if (g.roomKind !== 'setec') {
      g.chestTimer -= dt;
      if (g.chestTimer <= 0) {
        spawnChest();
        g.chestTimer = rand(34, 56) / (1 + p.luck * 0.15);
      }
    }

    updateDoor(dt);
  }

  /* qual chefe aparece:
     - sala 5 (mini-chefe): sempre o CLEBER, com o combo de 3 golpes
     - ultima sala da fase: fases impares -> Professor, pares -> Cleber */
  function bossTypeOfPhase() {
    if (g.bossMini) return 'cleber';
    return g.phase % 2 === 0 ? 'cleber' : 'boss';
  }

  function spawnBoss() {
    const pos = ringSpawn(40, 220);
    const b = spawnEnemy(bossTypeOfPhase(), pos.x, pos.y);
    if (!b) return;
    g.boss = b;
    if (g.bossMini) {
      /* sala 5: Cleber Jr — mesma mecanica de combo, com metade da forca */
      b.hp = b.maxHp = Math.round(b.maxHp * 0.5);
      b.r = 38;
      b.dmg = b.dmg * 0.55;
      b.xp = Math.round(b.xp * 0.6);
      b.coin = Math.round(b.coin * 0.6);
      b.name = b.name.replace('O ', '') + ' Jr.';
    }
    VS.UI.roomBanner('💀 ' + b.name.toUpperCase() + '!', 2400);
    VS.UI.toast('💀 ' + b.name.toUpperCase() + ' CHEGOU!', 2600);
    SFX().boss();
    U.shake(500);
  }

  /* ============================================================
     UPDATE PRINCIPAL
     ============================================================ */
  function update(dt) {
    if (g.state !== 'play') return;
    const p = g.p;
    g.time += dt;
    g.runTime += dt;
    g.boomBudget = 14;      /* explosoes em cadeia por frame (trava de seguranca) */

    /* ---- mede a performace e corta a carga se o jogo engasgar ---- */
    const pf = g.perf;
    pf.acc += dt; pf.n++;
    if (pf.n >= 45) {
      const avg = (pf.acc / pf.n) * 1000;
      pf.ms = pf.ms * 0.6 + avg * 0.4;
      if (pf.ms > 30 && pf.quality > 0.45) pf.quality = Math.max(0.45, pf.quality - 0.15);
      else if (pf.ms < 19 && pf.quality < 1) pf.quality = Math.min(1, pf.quality + 0.1);
      pf.acc = 0; pf.n = 0;
    }

    /* ---- movimento ---- */
    const ax = IN.axis();
    const mag = Math.hypot(ax.x, ax.y);
    p.moving = mag > 0.08;
    if (p.moving) {
      /* parede: anda eixo por eixo, escorrega rente e nunca atravessa */
      const dx = ax.x * p.speed * dt, dy = ax.y * p.speed * dt;
      if (g.obstacles.length) moveBody(p, dx, dy, p.r);
      else { p.x += dx; p.y += dy; }
      g.facing = ax.x < 0 ? -1 : 1;
      p.step += dt * 12;
      g.playerDir = Math.abs(ax.x) >= Math.abs(ax.y)
        ? (ax.x < 0 ? 'west' : 'east')
        : (ax.y < 0 ? 'north' : 'east');   /* so pra animaculos antigos */
    }
    p.x = clamp(p.x, p.r, g.roomW - p.r);
    p.y = clamp(p.y, p.r, g.roomH - p.r);

    /* ---- mira: inimigo mais próximo, senão direção do movimento ---- */
    const tgt = nearest(p.x, p.y, 1, 460, true)[0];
    if (tgt) g.aim = angleTo(p.x, p.y, tgt.x, tgt.y);
    else if (p.moving) g.aim = Math.atan2(ax.y, ax.x);

    /* ---- armas ----
       Sem inimigo vivo nao ha o que acertar: as armas ficam em espera
       (a recarga para em 0) e disparam na hora que o proximo bixo aparecer.
       enemyCount e a contagem viva —incrementa no spawn, decrementa no abate—
       entao nao depende do sweep do fim do frame. */
    const semBixos = g.enemyCount === 0;
    const haste = p.haste || 1;
    const range = p.rangeMul || 1;
    for (const w of p.weapons) {
      const def = D.def(w.id);
      if (!def) continue;
      const s = D.statsFor(def, w.level);
      if (range !== 1) {
        if (s.radius) s.radius *= range;
        if (s.len) s.len *= range;
        if (s.width) s.width *= range;
        if (s.maxR) s.maxR *= range;
      }
      w.stats = s;
      if (semBixos) { w.cd = 0; continue; }
      w.cd -= dt;
      if (w.cd <= 0) {
        def.attack(g, p, s);
        w.cd = s.cd * haste;
      }
    }

    /* orbiters, espinhos e auras so gastam CPU varrendo inimigos.
       com a sala limpa eles ainda GIRAM (o desenho usa o mesmo angulo),
       so que o dano e as buscas ficam desligados */
    updateOrbiters(dt, semBixos);
    updateSpinners(dt, semBixos);
    if (!semBixos) updateAuras(dt);
    updateTurrets(dt);
    updateTornadoes(dt, semBixos);
    updateBullets(dt);
    updateAoes(dt);

    /* ---- mundo ---- */
    buildGrid();
    E.update(g, dt);
    updateEBullets(dt);
    updateWaves(dt);
    VS.Mechanics.update(g, dt);
    collectGems(dt);
    updateChests(dt);
    sweep(g.enemies);

    updatePedestals(dt);

    /* ---- status do player ---- */
    if (p.iframe > 0) p.iframe -= dt;
    if (g.hurtFlash > 0) g.hurtFlash -= dt;
    if (g.fusionBanner > 0) {
      g.fusionBanner -= dt;
      if (g.fusionBanner <= 0) VS.UI.banner(false);
    }

    /* ---- partículas / textos ---- */
    const damp = Math.pow(0.004, dt);
    for (const q of g.parts) {
      q.life -= dt;
      if (q.life <= 0) { q.dead = true; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= damp; q.vy *= damp;
    }
    sweep(g.parts);
    for (const t of g.texts) { t.life -= dt; t.y -= dt * 34; if (t.life <= 0) t.dead = true; }
    sweep(g.texts);

    camFollow(dt);

    /* HUD leve: 12x por segundo em vez de 60 (tava pesando no frame) */
    g.hudT += dt;
    if (g.hudT >= 0.08) { g.hudT = 0; VS.UI.syncHud(); VS.UI.chestPrompt(); }
  }

  /* ============================================================
     DESENHO
     ============================================================ */
  function draw() {
    const c = ctx;
    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    c.clearRect(0, 0, g.W, g.H);

    /* fundo */
    c.fillStyle = '#0a0812';
    c.fillRect(0, 0, g.W, g.H);

    if (g.state === 'menu' || !g.p) { drawMenuBg(); return; }

    c.save();
    c.translate(g.W / 2 - g.cam.x, g.H / 2 - g.cam.y);

    drawGround(c);
    VS.Mechanics.draw(c, g);
    drawObstacles(c);
    drawAoes(c);
    drawChests(c);
    drawGems(c);
    E.draw(c, g);
    drawAuras(c);
    drawTurrets(c);
    drawTornadoes(c);
    drawPedestals(c);
    drawPlayer(c);
    drawOrbiters(c);
    drawSpinners(c);
    drawBullets(c);
    drawParts(c);
    drawDoor(c);
    drawTexts(c);

    /* borda da sala */
    const bw = 8;
    c.strokeStyle = g.roomKind === 'setec' ? 'rgba(0,229,255,.55)'
      : g.bossRoom ? 'rgba(255,90,120,.5)' : 'rgba(177,75,255,.45)';
    c.lineWidth = bw;
    c.strokeRect(-bw / 2, -bw / 2, g.roomW + bw, g.roomH + bw);
    c.restore();

    drawVignette(c);
    /* HUD das mecânicas: névoa, cronômetro, barra de fome… */
    VS.Mechanics.drawScreen(c, g);
  }

  /* marca d'agua da sala (SETEC / chefe / arena) */
  function drawRoomMark(c) {
    let txt = null, color = null;
    if (g.roomKind === 'setec') { txt = D.SETEC.tag; color = 'rgba(0,229,255,.07)'; }
    else if (g.bossRoom) { txt = 'CHEFE'; color = 'rgba(255,90,120,.06)'; }
    else if (g.mech && g.mech.def.tag) { txt = g.mech.def.tag; color = U.hexRgba(g.mech.def.cor, .06); }
    else if (g.arena && g.arena.tag) { txt = g.arena.tag; color = 'rgba(177,75,255,.05)'; }
    if (!txt) return;
    c.save();
    c.fillStyle = color;
    c.font = 'bold 190px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.fillText(txt, g.roomW / 2, g.roomH / 2);
    c.restore();
  }

  /* porta de saida — so acende quando a sala esta limpa */
  function drawDoor(c) {
    const d = g.door, open = d.open;
    const pulse = 1 + Math.sin(g.time * 3.4) * 0.05;
    c.save();
    c.translate(d.x, d.y);
    if (open) {
      c.save();
      c.globalAlpha = 0.35 + Math.sin(g.time * 3.4) * 0.12;
      c.fillStyle = '#b14bff';
      c.beginPath(); c.arc(0, 0, 44 * pulse, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = '#e0b3ff'; c.lineWidth = 5;
      c.beginPath(); c.arc(0, 0, 38 * pulse, 0, TAU); c.stroke();
    } else {
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
    }
    c.restore();
    c.font = 'bold 13px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = open ? '#e0b3ff' : 'rgba(255,255,255,.45)';
    c.fillText(open ? 'SAÍDA' : '🔒 ' + Math.max(0, g.roomTotal - g.roomKills) + ' bixos', d.x, d.y - 46);
  }

  function drawGround(c) {
    const step = 100;
    const L = g.view.left, R = g.view.right, T = g.view.top, B = g.view.bottom;

    /* fundo da sala */
    c.fillStyle = g.roomKind === 'setec' ? '#0a2229' : '#0e0b18';
    c.fillRect(L, T, R - L, B - T);
    drawRoomMark(c);

    c.lineWidth = 1;
    c.strokeStyle = 'rgba(120,90,180,.09)';
    c.beginPath();
    for (let x = Math.floor(L / step) * step; x <= R; x += step) { c.moveTo(x, T); c.lineTo(x, B); }
    for (let y = Math.floor(T / step) * step; y <= B; y += step) { c.moveTo(L, y); c.lineTo(R, y); }
    c.stroke();

    for (const d of g.decos) {
      if (d.x < L - 20 || d.x > R + 20 || d.y < T - 20 || d.y > B + 20) continue;
      c.fillStyle = d.c;
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, TAU);
      c.fill();
    }
  }

  function drawAoes(c) {
    for (const a of g.aoes) {
      const t = clamp(a.life / a.max, 0, 1);
      if (a.kind === 'slash') {
        const k = 1 - t;
        c.save();
        c.translate(a.x, a.y);
        c.globalAlpha = t;
        c.strokeStyle = a.color;
        c.lineWidth = 10 * t + 3;
        c.lineCap = 'round';
        const r = a.radius * (0.65 + k * 0.5);
        c.beginPath();
        c.arc(0, 0, r, a.ang - a.spread / 2, a.ang + a.spread / 2);
        c.stroke();
        c.globalAlpha = t * 0.4;
        c.lineWidth = 22 * t;
        c.beginPath();
        c.arc(0, 0, r * 0.86, a.ang - a.spread / 2, a.ang + a.spread / 2);
        c.stroke();
        c.restore();
      } else if (a.kind === 'ring') {
        if (a.delay > 0) continue;
        c.globalAlpha = t * 0.9;
        c.strokeStyle = a.color;
        c.lineWidth = 8 * t + 2;
        c.beginPath(); c.arc(a.x, a.y, a.r, 0, TAU); c.stroke();
        c.globalAlpha = t * 0.28;
        c.lineWidth = 20 * t + 4;
        c.beginPath(); c.arc(a.x, a.y, a.r, 0, TAU); c.stroke();
        c.globalAlpha = 1;
      } else if (a.kind === 'boom') {
        const k = 1 - t;
        c.globalAlpha = t * 0.85;
        c.fillStyle = a.color;
        c.beginPath(); c.arc(a.x, a.y, a.radius * (0.5 + k * 0.6), 0, TAU); c.fill();
        c.globalAlpha = t;
        c.strokeStyle = '#fff';
        c.lineWidth = 4 * t;
        c.beginPath(); c.arc(a.x, a.y, a.radius * (0.6 + k * 0.7), 0, TAU); c.stroke();
        c.globalAlpha = 1;
      } else if (a.kind === 'field') {
        c.globalAlpha = Math.min(0.55, t + 0.25);
        const grd = c.createRadialGradient(a.x, a.y, 2, a.x, a.y, a.radius);
        grd.addColorStop(0, U.hexRgba(a.color.startsWith('#') ? a.color : '#ff6a1f', 0.55));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = grd;
        c.beginPath(); c.arc(a.x, a.y, a.radius, 0, TAU); c.fill();
        c.globalAlpha = 1;
      } else if (a.kind === 'drain') {
        c.globalAlpha = t * 0.6;
        c.strokeStyle = a.color;
        c.lineWidth = 5;
        c.beginPath(); c.arc(a.x, a.y, a.radius * (0.7 + (1 - t) * 0.4), 0, TAU); c.stroke();
        c.globalAlpha = 1;
      } else if (a.kind === 'bolt') {
        c.globalAlpha = t;
        c.strokeStyle = a.color;
        c.lineWidth = 4;
        c.shadowColor = a.color; c.shadowBlur = 14;
        c.beginPath();
        c.moveTo(a.pts[0].x, a.pts[0].y);
        for (let i = 1; i < a.pts.length; i++) c.lineTo(a.pts[i].x, a.pts[i].y);
        c.stroke();
        c.shadowBlur = 0;
        c.globalAlpha = 1;
      } else if (a.kind === 'beam') {
        /* feixe de luz */
        c.globalAlpha = t * 0.9;
        c.strokeStyle = a.color;
        c.lineCap = 'round';
        c.lineWidth = a.width * t + 2;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(a.x + Math.cos(a.ang) * a.len, a.y + Math.sin(a.ang) * a.len);
        c.stroke();
        c.globalAlpha = t * 0.3;
        c.lineWidth = a.width * 2.4 * t + 4;
        c.stroke();
        c.lineCap = 'butt';
        c.globalAlpha = 1;
      } else if (a.kind === 'rays') {
        /* raios em volta */
        c.globalAlpha = t * 0.85;
        c.strokeStyle = a.color;
        c.lineCap = 'round';
        c.lineWidth = a.width * t + 2;
        for (let i = 0; i < a.count; i++) {
          const ang = a.rot + i / a.count * TAU;
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(a.x + Math.cos(ang) * a.len, a.y + Math.sin(ang) * a.len);
          c.stroke();
        }
        c.lineCap = 'butt';
        c.globalAlpha = 1;
      } else if (a.kind === 'spike') {
        /* espinho da muralha */
        c.globalAlpha = t;
        c.fillStyle = a.color;
        c.save();
        c.translate(a.x, a.y);
        c.rotate(a.ang);
        c.beginPath();
        c.moveTo(a.r * 1.6, 0); c.lineTo(-a.r, -a.r * 0.7); c.lineTo(-a.r, a.r * 0.7);
        c.closePath(); c.fill();
        c.restore();
        c.globalAlpha = 1;
      } else if (a.kind === 'cloud') {
        /* nuvem toxica */
        const tt = clamp(a.life / a.max, 0, 1);
        c.globalAlpha = Math.min(0.5, tt + 0.2);
        const grd = c.createRadialGradient(a.x, a.y, 3, a.x, a.y, a.radius);
        grd.addColorStop(0, U.hexRgba(a.color, 0.55));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = grd;
        c.beginPath(); c.arc(a.x, a.y, a.radius, 0, TAU); c.fill();
        /* bolhinhas */
        c.globalAlpha = Math.min(0.5, tt + 0.2) * 0.8;
        c.fillStyle = a.color;
        for (let i = 0; i < 4; i++) {
          const ang = g.time * 1.1 + i * 1.9;
          const rr = a.radius * 0.5 * (0.5 + 0.5 * Math.sin(g.time * 2 + i));
          c.beginPath(); c.arc(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang * 1.3) * rr * 0.7, 7, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
      } else if (a.kind === 'meteor') {
        /* meteoro caindo */
        const tt = a.t;
        c.globalAlpha = 1 - tt * 0.4;
        c.strokeStyle = '#ffd76a';
        c.lineWidth = 9 * (1 - tt) + 2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(a.sx + (a.x - a.sx) * 0.25, a.sy + (a.y - a.sy) * 0.25);
        c.stroke();
        c.fillStyle = a.color;
        c.beginPath(); c.arc(a.x, a.y, a.r0 + (a.r1 - a.r0) * tt, 0, TAU); c.fill();
        c.fillStyle = '#fff6d8';
        c.beginPath(); c.arc(a.x, a.y, (a.r0 + (a.r1 - a.r0) * tt) * 0.55, 0, TAU); c.fill();
        c.lineCap = 'butt';
        c.globalAlpha = 1;
      }
    }
  }

  function drawGems(c) {
    const L = g.view.left - 20, R = g.view.right + 20, T = g.view.top - 20, B = g.view.bottom + 20;
    for (const gm of g.gems) {
      if (gm.x < L || gm.x > R || gm.y < T || gm.y > B) continue;
      const s = (gm.big ? 11 : 6) * (1 + Math.sin(g.time * 6 + gm.x) * 0.08);
      /* losango desenhado na mao: sem save/restore/rotate por gema */
      const a = g.time * 2.2 + gm.x * 0.01, ca = Math.cos(a), sa = Math.sin(a);
      c.fillStyle = gm.big ? '#63b3ff' : '#63e6a0';
      c.beginPath();
      c.moveTo(gm.x + sa * s, gm.y - ca * s);
      c.lineTo(gm.x + ca * s * 0.7, gm.y + sa * s * 0.7);
      c.lineTo(gm.x - sa * s, gm.y + ca * s);
      c.lineTo(gm.x - ca * s * 0.7, gm.y - sa * s * 0.7);
      c.closePath(); c.fill();
    }
  }

  function drawChests(c) {
    const L = g.view.left - 60, R = g.view.right + 60, T = g.view.top - 60, B = g.view.bottom + 60;
    for (const ch of g.chests) {
      if (ch.dead || ch.open) continue;
      if (ch.x < L || ch.x > R || ch.y < T || ch.y > B) continue;
      const pulse = 1 + Math.sin(g.time * 4 + ch.id) * 0.06;
      const r = ch.r * pulse;
      c.save();
      c.translate(ch.x, ch.y);
      c.shadowColor = ch.tier.color; c.shadowBlur = 22;
      c.fillStyle = '#3a2418';
      c.strokeStyle = ch.tier.color; c.lineWidth = 3;
      rr(c, -r, -r * 0.72, r * 2, r * 1.44, 6);
      c.fill(); c.stroke();
      c.shadowBlur = 0;
      /* tampa */
      c.fillStyle = ch.tier.color;
      rr(c, -r, -r * 0.72, r * 2, r * 0.5, 6);
      c.fill();
      /* fechadura */
      c.fillStyle = '#ffe27a';
      c.fillRect(-4, -2, 8, 10);
      c.restore();
      c.font = 'bold 15px sans-serif';
      c.textAlign = 'center';
      c.fillStyle = ch.tier.color;
      c.fillText(ch.tier.icon, ch.x, ch.y - r - 8);
    }
  }

  function drawPlayer(c) {
    const p = g.p;
    const sk = g.skin || { cor: '#b98cff', cor2: '#6a3fa0' };
    const corpo = sk.cor || '#f2e9ff';
    const capa = sk.cor2 || '#4a1f5c';
    c.save();
    c.translate(p.x, p.y);
    if (p.iframe > 0 && Math.floor(p.iframe * 18) % 2 === 0) c.globalAlpha = 0.45;

    /* sombra no chao */
    c.globalAlpha *= 0.3;
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(0, 16, 16, 5, 0, 0, TAU); c.fill();
    c.globalAlpha = (p.iframe > 0 && Math.floor(p.iframe * 18) % 2 === 0) ? 0.45 : 1;

    /* capa */
    c.fillStyle = capa;
    c.beginPath();
    c.ellipse(-g.facing * 6, 2, 17, 13, -g.facing * 0.2, 0, TAU);
    c.fill();

    /* corpo com a cor da skin */
    c.fillStyle = p.hp / p.maxHp < 0.3 ? '#ffd0d8' : corpo;
    c.strokeStyle = capa;
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fill(); c.stroke();

    /* detalhe da skin: um brasao no peito */
    c.fillStyle = capa;
    c.globalAlpha *= 0.75;
    c.beginPath();
    c.moveTo(0, -5); c.lineTo(5, 0); c.lineTo(0, 6); c.lineTo(-5, 0);
    c.closePath(); c.fill();
    c.globalAlpha = (p.iframe > 0 && Math.floor(p.iframe * 18) % 2 === 0) ? 0.45 : 1;

    /* olhos */
    c.fillStyle = '#2a1030';
    const ex = 4.5 * g.facing;
    c.beginPath(); c.arc(ex - 3.5, -3, 2.6, 0, TAU); c.fill();
    c.beginPath(); c.arc(ex + 3.5, -3, 2.6, 0, TAU); c.fill();

    /* braço indicando a mira */
    c.strokeStyle = capa;
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(g.aim) * 21, Math.sin(g.aim) * 21);
    c.stroke();
    c.restore();
  }

  function drawOrbiters(c) {
    for (const o of g.orbiters) {
      c.save();
      c.shadowColor = o.color; c.shadowBlur = 16;
      c.fillStyle = o.color;
      c.beginPath(); c.arc(o.x, o.y, 12, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.arc(o.x - 3, o.y - 3, 4, 0, TAU); c.fill();
      c.restore();
    }
  }

  function drawBullets(c) {
    const L = g.view.left - 40, R = g.view.right + 40, T = g.view.top - 40, B = g.view.bottom + 40;
    for (const b of g.bullets) {
      if (b.x < L || b.x > R || b.y < T || b.y > B) continue;
      const r = b.r;
      c.fillStyle = b.color;
      if (b.boomerang) {
        const a = b.ang, ca = Math.cos(a), sa = Math.sin(a);
        c.beginPath();
        c.moveTo(b.x + sa * r, b.y - ca * r);
        c.lineTo(b.x + ca * r, b.y + sa * r);
        c.lineTo(b.x - sa * r, b.y + ca * r);
        c.lineTo(b.x - ca * r, b.y - sa * r);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.45)';
        c.fillRect(b.x - ca * r * 0.15, b.y - sa * r * 0.15, ca * 6, sa * 6 + 1);
      } else {
        const a = b.spin ? b.spinA : b.ang, ca = Math.cos(a), sa = Math.sin(a);
        c.beginPath();
        c.ellipse(b.x, b.y, r * 1.35, r * 0.7, a, 0, TAU);
        c.fill();
        /* brilho barato: um circulo translucido atras */
        c.globalAlpha = 0.22;
        c.beginPath(); c.arc(b.x, b.y, r * 1.5, 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
    }
    for (const b of g.ebullets) {
      if (b.x < L || b.x > R || b.y < T || b.y > B) continue;
      if (b.shock) {                        /* onda de choque: anel duplo no chao */
        const fade = clamp(b.life / (b.rMax / b.speed), 0, 1);
        c.globalAlpha = fade * 0.9;
        c.strokeStyle = b.color; c.lineWidth = 7;
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke();
        c.globalAlpha = fade * 0.35; c.lineWidth = 2.5;
        c.beginPath(); c.arc(b.x, b.y, b.r + 9, 0, TAU); c.stroke();
        c.globalAlpha = 1;
        continue;
      }
      c.fillStyle = b.color;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.beginPath(); c.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.4, 0, TAU); c.fill();
    }
  }

  function drawParts(c) {
    const L = g.view.left, R = g.view.right, T = g.view.top, B = g.view.bottom;
    for (const q of g.parts) {
      if (q.x < L || q.x > R || q.y < T || q.y > B) continue;
      c.globalAlpha = clamp(q.life / 0.6, 0, 1);
      c.fillStyle = q.color;
      c.fillRect(q.x - q.size * 0.5, q.y - q.size * 0.5, q.size, q.size);
    }
    c.globalAlpha = 1;
  }

  function drawTexts(c) {
    c.textAlign = 'center';
    c.font = 'bold 13px "Trebuchet MS", sans-serif';
    for (const t of g.texts) {
      c.globalAlpha = clamp(t.life / 0.85, 0, 1);
      c.fillStyle = '#000';
      c.fillText(t.txt, t.x + 1, t.y + 1);
      c.fillStyle = t.color;
      c.fillText(t.txt, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  function drawVignette(c) {
    const p = g.p;
    const danger = 1 - clamp(p.hp / (p.maxHp * 0.35), 0, 1);
    if (g.hurtFlash > 0 || danger > 0.02) {
      const a = Math.max(g.hurtFlash * 0.9, danger * 0.28 * (0.6 + Math.sin(g.time * 5) * 0.4));
      const grd = c.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.25, g.W / 2, g.H / 2, Math.max(g.W, g.H) * 0.72);
      grd.addColorStop(0, 'rgba(255,0,40,0)');
      grd.addColorStop(1, `rgba(255,0,40,${clamp(a, 0, 0.75)})`);
      c.fillStyle = grd;
      c.fillRect(0, 0, g.W, g.H);
    }
  }

  function drawMenuBg() {
    const c = ctx;
    const t = g.time;
    for (let i = 0; i < 60; i++) {
      const x = (i * 137 + t * 12) % g.W;
      const y = (i * 271 + Math.sin(t + i) * 30) % g.H;
      c.fillStyle = `rgba(177,75,255,${0.05 + (i % 5) * 0.02})`;
      c.beginPath(); c.arc(x, g.H - y, 2 + (i % 3), 0, TAU); c.fill();
    }
  }

  /* ============================================================
     EXPORT / LOOP
     ============================================================ */
  g.start = start;
  g.resize = resize;
  g.update = update;
  g.draw = draw;
  g.addXP = addXP;
  g.openChest = openChest;
  g.recompute = recompute;
  g.addWeapon = addWeapon;
  g.gainPassive = gainPassive;
  g.availableFusions = availableFusions;
  g.heal = heal;
  g.drainPlayer = drainPlayer;
  /* 'texts' e o ARRAY de textos flutuantes: a função vai com outro nome */
  g.popText = texts;
  g.burst = burst;
  g.xpNeed = xpNeed;
  g.TIERS = TIERS;
  g.WORLD = WORLD;
  g.ROOM_W = ROOM_W; g.ROOM_H = ROOM_H;

  /* salas e fases */
  g.enterRoom = enterRoom;
  g.rollRoomKind = rollRoomKind;
  g.nextRoom = nextRoom;
  g.nextPhase = nextPhase;
  g.clearRoom = clearRoom;
  g.win = win;
  g.liveCap = liveCap;
  /* aplica a skin equipada na hora (a troca de skin muda os stats) */
  function refreshSkin() {
    g.skin = VS.Chars.skin();
    if (g.p) recompute(g.p);
  }
  g.isHardcore = isHardcore;
  g.refreshSkin = refreshSkin;
  g.saveWorld = saveWorld;
  g.saveWorldNow = saveWorldNow;
  g.wipeWorld = wipeWorld;
  g.persist = persist;
  g.startHardcore = startHardcore;
  g.newWorld = newWorld;
  g.roomLabel = () => 'FASE ' + g.phase + (g.mode.fases ? '/' + g.mode.fases : '') +
    ' · SALA ' + g.room + '/' + g.roomsTotal +
    (g.roomKind === 'setec' ? ' 🔐SETEC'
      : g.bossMini ? ' ☠️MINI-CHEFE'
        : g.bossRoom ? ' 💀CHEFE'
          : (g.mech ? ' ' + g.mech.def.icon + g.mech.def.tag : ''));

  /* helpers usados pelas armas e pelos inimigos */
  g.spawnSlash = spawnSlash;
  g.spawnRing = spawnRing;
  g.spawnBoom = spawnBoom;
  g.spawnField = spawnField;
  g.spawnDrain = spawnDrain;
  g.spawnBullet = spawnBullet;
  /* colisao dos obstaculos da arena — usada pelo jogador e pelos inimigos */
  g.pushOutOfObstacles = pushOutOfObstacles;
  g.moveBody = moveBody;
  g.obsFreeAt = obsFreeAt;
  g.losBlocked = losBlocked;
  g.obstacleAt = function (x, y, rad) {
    for (const o of g.obstacles) if (_obsHits(x, y, rad, o)) return o;
    return null;
  };
  /* hooks de teste: geram a arena sem precisar entrar na sala */
  g.__buildArenaForTest = function (id) { buildArena(id); };
  g.__setArenaId = function (id) { g.arenaId = id; };
  g.__updateBulletsForTest = function (dt) { updateBullets(dt); };
  g.__buildGridForTest = function () { buildGrid(); };
  g.spawnEBullet = spawnEBullet;
  g.spawnShock = spawnShock;
  g.spawnEnemy = spawnEnemy;
  g.ringSpawn = ringSpawn;
  g.hitRect = hitRect;
  g.spawnBeam = spawnBeam;
  g.spawnRays = spawnRays;
  g.spawnWall = spawnWall;
  g.spawnCloud = spawnCloud;
  g.spawnMeteor = spawnMeteor;
  g.spawnTurret = spawnTurret;
  g.spawnTornado = spawnTornado;
  g.syncSpinners = syncSpinners;
  g.syncAura = syncAura;
  g.spawnRelic = spawnRelic;
  g.grantRelic = grantRelic;
  g.strikeLightning = strikeLightning;
  g.syncOrbiters = syncOrbiters;
  g.zapFromOrbiters = zapFromOrbiters;
  g.nearest = nearest;
  g.randomEnemies = randomEnemies;
  g.hitCircle = hitCircle;
  g.hitCone = hitCone;
  g.damage = damage;
  g.hurtPlayer = hurtPlayer;
  g.spawnChest = spawnChest;
  g.spawnBoss = spawnBoss;
  g.updateView = updateView;
  g.grantGems = grantGems;

  return g;
})();

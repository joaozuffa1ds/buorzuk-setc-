/* ============================================================
   mechanics.js  —  20 mecânicas de sala

   Cada sala normal sorteia UMA mecânica e ela age enquanto a sala
   não é limpa. Todas usam só a API pública do jogo (VS.Game), então
   não dependem de nada interno.

   Contrato de cada mecânica:
     init(g, st)        quando entra na sala
     update(g, st, dt)  a cada frame
     draw(c, g, st)     espaço da SALA (canvas já transladado)
     drawScreen(c,g,st) espaço da TELA (após o restore)
     onSpawn(g, st, e)  logo depois de um inimigo ser criado
     onKill(g, st, e)   logo depois de um inimigo morrer
   ============================================================ */
window.VS = window.VS || {};

VS.Mechanics = (function () {
  const U = VS.U;
  const { TAU, rand, randInt, chance, pick, clamp, dist, dist2 } = U;

  const CX = (g) => g.roomW / 2, CY = (g) => g.roomH / 2;

  /* ponto solto dentro da sala, longe das paredes e dos obstaculos */
  function freeSpot(g, rad, rMin, rMax) {
    rMin = rMin === undefined ? 90 : rMin;
    rMax = rMax === undefined ? Math.min(g.roomW, g.roomH) * 0.42 : rMax;
    const a = rand(TAU), d = rand(rMin, rMax);
    const x = clamp(CX(g) + Math.cos(a) * d, rad + 20, g.roomW - rad - 20);
    const y = clamp(CY(g) + Math.sin(a) * d, rad + 20, g.roomH - rad - 20);
    return { x, y };
  }

  /* distancia de um ponto ate a reta que nasce em (x0,y0) no angulo a */
  function distToRay(px, py, x0, y0, a) {
    const dx = px - x0, dy = py - y0;
    const proj = dx * Math.cos(a) + dy * Math.sin(a);
    if (proj <= 0) return Math.hypot(dx, dy);
    return Math.abs(dx * Math.sin(a) - dy * Math.cos(a));
  }

  /* ============================================================
     1. NEBLINA
     ============================================================ */
  const neblina = {
    id: 'neblina', nome: 'Névoa', icon: '🌫️', tag: 'NEBLINA', cor: '#7a6fa8',
    desc: 'A sala está cheia de fumaça: você só enxerga o que está pertinho.',
    init(g, st) { st.r = 300; },
    drawScreen(c, g, st) {
      const R = Math.max(g.W, g.H) * 0.8;
      const grd = c.createRadialGradient(g.W / 2, g.H / 2, st.r * 0.45, g.W / 2, g.H / 2, R);
      grd.addColorStop(0, 'rgba(4,3,10,0)');
      grd.addColorStop(0.55, 'rgba(4,3,10,.72)');
      grd.addColorStop(1, 'rgba(4,3,10,.97)');
      c.fillStyle = grd;
      c.fillRect(0, 0, g.W, g.H);
    }
  };

  /* ============================================================
     2. CHUVA DE METEOROS
     ============================================================ */
  const meteoros = {
    id: 'meteoros', nome: 'Chuva de Meteoros', icon: '☄️', tag: 'METEOROS', cor: '#ff8a3c',
    desc: 'Meteoros caem do céu sem parar e limpam a horda sozinhos.',
    init(g, st) { st.t = 2.5; },
    update(g, st, dt) {
      st.t -= dt;
      if (st.t > 0) return;
      st.t = rand(1.8, 3.4);
      const n = randInt(2, 4);
      for (let i = 0; i < n; i++) {
        const s = freeSpot(g, 40, 100, 520);
        g.spawnMeteor(s.x, s.y, 24 + g.depth * 3, 84, '#ff8a3c', {});
      }
    }
  };

  /* ============================================================
     3. PISO DE GELO
     ============================================================ */
  const gelo = {
    id: 'gelo', nome: 'Piso de Gelo', icon: '🧊', tag: 'GELO', cor: '#9fe8ff',
    desc: 'O chão está congelado: você entra em velocidade e demora a parar.',
    init(g, st) { st.vx = 0; st.vy = 0; },
    update(g, st, dt) {
      const p = g.p, ax = VS.Input.axis();
      /* resposta lenta: o corpo persegue o comando com atraso e escorrega */
      const k = 1 - Math.exp(-2.6 * dt);
      st.vx += (ax.x * p.speed - st.vx) * k;
      st.vy += (ax.y * p.speed - st.vy) * k;
      /* o jogo ja andou o_player por conta propria: aqui so a diferenca */
      const dx = st.vx * dt - ax.x * p.speed * dt;
      const dy = st.vy * dt - ax.y * p.speed * dt;
      if (dx || dy) {
        if (g.obstacles.length) g.moveBody(p, dx, dy, p.r);
        else { p.x += dx; p.y += dy; }
        p.x = clamp(p.x, p.r, g.roomW - p.r);
        p.y = clamp(p.y, p.r, g.roomH - p.r);
      }
    },
    draw(c, g, st) {
      const L = g.view.left - 60, R = g.view.right + 60, T = g.view.top - 60, B = g.view.bottom + 60;
      c.save();
      c.fillStyle = 'rgba(159,232,255,.10)';
      for (const d of g.decos) {
        if (d.x < L || d.x > R || d.y < T || d.y > B) continue;
        c.fillRect(d.x - 14, d.y - 4, 28, 8);
        c.fillRect(d.x - 4, d.y - 14, 8, 28);
      }
      c.restore();
    }
  };

  /* ============================================================
     4. CAMPO MINADO
     ============================================================ */
  const minas = {
    id: 'minas', nome: 'Campo Minado', icon: '💣', tag: 'MINADO', cor: '#ffd76a',
    desc: 'Há minas escondidas no chão. Elas detonam com você em cima… e com a horda também.',
    init(g, st) {
      st.list = [];
      const n = 8 + g.phase;
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 12; tries++) {
          const s = freeSpot(g, 26, 120, Math.min(g.roomW, g.roomH) * 0.45);
          if (!g.obsFreeAt(s.x, s.y, 34)) continue;
          if (dist2(s.x, s.y, CX(g), CY(g)) < 240 * 240) continue;   /* nao emcima do centro */
          st.list.push({ x: s.x, y: s.y, dead: false });
          break;
        }
      }
    },
    update(g, st, dt) {
      const p = g.p;
      for (const m of st.list) {
        if (m.dead) continue;
        const d2 = dist2(p.x, p.y, m.x, m.y);
        if (d2 > 66 * 66) continue;
        m.dead = true;
        g.spawnBoom({ x: m.x, y: m.y, radius: 124, dmg: 20, color: '#ffd76a', knock: 200 });
        g.burst(m.x, m.y, 12, '#ffd76a', 220);
        g.popText(m.x, m.y - 26, 'BOOM!', '#ffd76a');
        if (d2 < 124 * 124) g.hurtPlayer(18, { x: m.x, y: m.y });
        U.shake(160);
      }
    },
    draw(c, g, st) {
      const t = g.time;
      for (const m of st.list) {
        if (m.dead) continue;
        if (m.x < g.view.left - 30 || m.x > g.view.right + 30) continue;
        if (m.y < g.view.top - 30 || m.y > g.view.bottom + 30) continue;
        c.save();
        c.translate(m.x, m.y);
        c.fillStyle = '#3a3550';
        c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 2; c.stroke();
        const on = (t * 2 + m.x) % 1 < 0.5;
        c.fillStyle = on ? '#ff4d6a' : 'rgba(255,77,106,.25)';
        c.beginPath(); c.arc(0, -4, 3.5, 0, TAU); c.fill();
        c.restore();
      }
    }
  };

  /* ============================================================
     5. FEIXES LASER
     ============================================================ */
  const lasers = {
    id: 'lasers', nome: 'Feixes Laser', icon: '🔺', tag: 'LASER', cor: '#ff4d6a',
    desc: 'Feixes giram varrendo a sala. Acertam todo mundo — inclusive você.',
    init(g, st) {
      st.a = rand(TAU);
      st.spd = rand(0.22, 0.5) * (chance(.5) ? 1 : -1);
      st.n = g.phase >= 3 ? 3 : 2;
    },
    update(g, st, dt) {
      st.a += st.spd * dt;
      const cx = CX(g), cy = CY(g), p = g.p;
      const len = Math.hypot(g.roomW, g.roomH);
      for (let i = 0; i < st.n; i++) {
        const a = st.a + i * Math.PI / st.n;
        const ca = Math.cos(a), sa = Math.sin(a);
        /* o feixe fere a horda */
        for (let d = 50; d < len; d += 56) {
          const x = cx + ca * d, y = cy + sa * d;
          if (x < -60 || y < -60 || x > g.roomW + 60 || y > g.roomH + 60) break;
          g.hitCircle(x, y, 24, 11, { noCrit: true });
        }
        /* e fere quem estiver na linha */
        if (distToRay(p.x, p.y, cx, cy, a) < 17 + p.r) g.hurtPlayer(17 + g.depth, { x: cx, y: cy });
      }
    },
    draw(c, g, st) {
      const cx = CX(g), cy = CY(g), len = Math.hypot(g.roomW, g.roomH);
      c.save();
      c.lineCap = 'round';
      for (let i = 0; i < st.n; i++) {
        const a = st.a + i * Math.PI / st.n;
        const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
        c.strokeStyle = 'rgba(255,77,106,.22)'; c.lineWidth = 18;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = '#ff4d6a'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = '#ffd9df'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
      }
      c.fillStyle = 'rgba(255,220,225,.85)';
      c.beginPath(); c.arc(cx, cy, 16, 0, TAU); c.fill();
      c.restore();
    }
  };

  /* ============================================================
     6. ENCOLHENDO
     ============================================================ */
  const encolhendo = {
    id: 'encolhendo', nome: 'Encolhendo', icon: '🔵', tag: 'ENCOLHE', cor: '#63b3ff',
    desc: 'Uma zona segura enorme começa a encolher. Ficar fora dela queima.',
    init(g, st) { st.r = Math.hypot(g.roomW, g.roomH) * 0.55; st.min = 200; },
    update(g, st, dt) {
      st.r -= dt * (9 + g.phase * 0.6);
      if (st.r < st.min) st.r = st.min;
      const p = g.p;
      if (dist(p.x, p.y, CX(g), CY(g)) > st.r - p.r) g.hurtPlayer(13 + g.depth, { x: CX(g), y: CY(g) });
    },
    draw(c, g, st) {
      const cx = CX(g), cy = CY(g);
      c.save();
      c.fillStyle = 'rgba(20,60,120,.42)';
      c.beginPath();
      c.rect(0, 0, g.roomW, g.roomH);
      c.arc(cx, cy, st.r, 0, TAU);
      c.fill('evenodd');
      c.strokeStyle = 'rgba(99,179,255,.9)';
      c.lineWidth = 5;
      c.beginPath(); c.arc(cx, cy, st.r, 0, TAU); c.stroke();
      c.restore();
    }
  };

  /* ============================================================
     7. SEDE
     ============================================================ */
  const sede = {
    id: 'sede', nome: 'Sede', icon: '🧛', tag: 'SEDE', cor: '#c92153',
    desc: 'Sua vida escorre sozinha. Só matar cura.',
    init(g, st) { st.t = 4; },
    update(g, st, dt) {
      st.t -= dt;
      if (st.t > 0) return;
      st.t = 3.4;
      g.drainPlayer(4 + g.phase * 1.2);
    },
    onKill(g, st, e) {
      if (e.boss) { g.heal(g.p.maxHp * 0.25, true); return; }
      g.heal(Math.max(2, e.maxHp * 0.012), true);
    },
    drawScreen(c, g) {
      c.save();
      c.globalAlpha = 0.5 + Math.sin(g.time * 5) * 0.18;
      c.fillStyle = '#c92153';
      c.font = 'bold 13px "Trebuchet MS", sans-serif';
      c.textAlign = 'left';
      c.fillText('🧛 sede: só abater cura', 14, g.H - 16);
      c.restore();
    }
  };

  /* ============================================================
     8. CHAMAS
     ============================================================ */
  const chamas = {
    id: 'chamas', nome: 'Chamas', icon: '🔥', tag: 'CHAMAS', cor: '#ff6a1f',
    desc: 'O chão pega fogo em todo lado. Some com a horda — e com seu pé.',
    init(g, st) { st.list = []; st.t = 1.5; },
    update(g, st, dt) {
      const p = g.p;
      st.t -= dt;
      if (st.t <= 0 && st.list.length < 16) {
        st.t = rand(1.4, 2.6);
        const n = randInt(1, 2);
        for (let i = 0; i < n; i++) {
          const s = freeSpot(g, 50, 110, Math.min(g.roomW, g.roomH) * 0.44);
          st.list.push({ x: s.x, y: s.y, r: rand(48, 78), life: 6, tm: 0 });
        }
      }
      for (let i = st.list.length - 1; i >= 0; i--) {
        const f = st.list[i];
        f.life -= dt;
        if (f.life <= 0) { st.list.splice(i, 1); continue; }
        f.tm -= dt;
        if (f.tm > 0) continue;
        f.tm = 0.5;
        g.hitCircle(f.x, f.y, f.r, 9, { noCrit: true });
        if (dist2(p.x, p.y, f.x, f.y) < f.r * f.r) g.drainPlayer(7 + g.phase);
      }
    },
    draw(c, g, st) {
      for (const f of st.list) {
        if (f.x < g.view.left - 90 || f.x > g.view.right + 90) continue;
        if (f.y < g.view.top - 90 || f.y > g.view.bottom + 90) continue;
        const k = clamp(f.life / 1.2, 0, 1);
        const grd = c.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
        grd.addColorStop(0, `rgba(255,190,90,${0.5 * k})`);
        grd.addColorStop(0.6, `rgba(255,106,31,${0.36 * k})`);
        grd.addColorStop(1, 'rgba(255,60,0,0)');
        c.fillStyle = grd;
        c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill();
      }
    }
  };

  /* ============================================================
     9. Grito Elétrico
     ============================================================ */
  const grito = {
    id: 'grito', nome: 'Grito Elétrico', icon: '⚡', tag: 'GRITO', cor: '#a9ecff',
    desc: 'A sala solta raios em cadeia sem parar. Chama os bichos de volta.',
    init(g, st) { st.t = 2; },
    update(g, st, dt) {
      st.t -= dt;
      if (st.t > 0) return;
      st.t = rand(1.3, 2.4);
      const n = randInt(2, 5);
      for (let i = 0; i < n; i++) {
        const s = freeSpot(g, 40, 80, Math.min(g.roomW, g.roomH) * 0.45);
        g.strikeLightning(s.x, s.y, 30 + g.depth * 3, 1, '#a9ecff');
      }
    }
  };

  /* ============================================================
     10. REDEMOINHOS
     ============================================================ */
  const redemoinho = {
    id: 'redemoinho', nome: 'Redemoinhos', icon: '🌀', tag: 'REDEMOINHO', cor: '#cfd8ff',
    desc: 'Vórtices arrastam a horda para o centro e deixam um rastro tóxico.',
    init(g, st) { st.t = 4; },
    update(g, st, dt) {
      st.t -= dt;
      if (st.t > 0) return;
      st.t = rand(4.5, 7);
      const s = freeSpot(g, 90, 180, Math.min(g.roomW, g.roomH) * 0.45);
      g.spawnTornado({
        x: s.x, y: s.y, dmg: 18 + g.depth * 2, radius: 130, pull: 300,
        life: 8, color: '#cfd8ff', trail: { every: 1.1, radius: 88, dmg: 7 }
      });
    }
  };

  /* ============================================================
     11. SALDO EM MOEDAS
     ============================================================ */
  const moedas = {
    id: 'moedas', nome: 'Saldo em Moedas', icon: '💰', tag: 'MOEDAS', cor: '#ffcc4d',
    desc: 'Todo bicho abatido cospe moedas na hora — e de vez em quando uma gema.',
    init(g, st) { st.n = 0; },
    onKill(g, st, e) {
      const c = 3 + randInt(0, 5) + g.phase;
      g.money += c; g.goldTotal += c;
      st.n++;
      g.popText(e.x, e.y - e.r - 8, '+' + c + '🪙', '#ffcc4d');
      if (e.boss || chance(0.035)) {
        g.grantGems(1);
        g.popText(e.x, e.y - e.r - 26, '+1 💎', '#63b3ff');
      }
    },
    drawScreen(c, g, st) {
      c.save();
      c.fillStyle = 'rgba(255,204,77,.85)';
      c.font = 'bold 13px "Trebuchet MS", sans-serif';
      c.textAlign = 'left';
      c.fillText('💰 +' + (st.n * 5) + ' de bônus na sala', 14, g.H - 16);
      c.restore();
    }
  };

  /* ============================================================
     12. ECO
     ============================================================ */
  const eco = {
    id: 'eco', nome: 'Eco', icon: '👥', tag: 'ECO', cor: '#c9f4ff',
    desc: 'Cada bixo vem acompanhado de uma cópia. Limpe os dois.',
    init(g, st) { st.busy = false; },
    onSpawn(g, st, e) {
      if (st.busy || e.boss || e.lee) return;
      if (!chance(0.45)) return;
      st.busy = true;
      const o = g.spawnEnemy(
        e.type,
        clamp(e.x + rand(-80, 80), 24, g.roomW - 24),
        clamp(e.y + rand(-80, 80), 24, g.roomH - 24)
      );
      if (o) { o.hp = o.maxHp; o.kx = 0; o.ky = 0; }
      st.busy = false;
    }
  };

  /* ============================================================
     13. ELITE
     ============================================================ */
  const elite = {
    id: 'elite', nome: 'Elite', icon: '👑', tag: 'ELITE', cor: '#ff9de2',
    desc: 'Quase todo bixo nasce ELITE: mais vida, mais dano, mais recompensa.',
    init(g, st) { st.n = 0; },
    onSpawn(g, st, e) {
      if (e.boss || e.lee || e.shield) return;
      if (!chance(0.45)) return;
      e.elite = true;
      e.r *= 1.25;
      e.hp = e.maxHp *= 2.4;
      e.dmg *= 1.3;
      e.speed *= 1.08;
      e.xp *= 5;
      e.coin *= 3;
      st.n++;
    }
  };

  /* ============================================================
     14. PARASITA
     ============================================================ */
  const parasita = {
    id: 'parasitas', nome: 'Parasitas', icon: '🪸', tag: 'PARASITA', cor: '#ff7ae0',
    desc: 'Um bicho gruda em você e suga vida. Tira ele na mão.',
    init(g, st) { st.t = 5; st.lee = []; },
    update(g, st, dt) {
      const p = g.p;
      st.t -= dt;
      if (st.t <= 0) {
        st.t = rand(7, 12);
        if (st.lee.length < 4) {
          const e = g.spawnEnemy('ghost', p.x + rand(-60, 60), p.y + rand(-60, 60));
          if (e) {
            e.hp = e.maxHp = 24 + g.depth * 7;
            e.r = 10; e.dmg = 0; e.xp = 1; e.coin = 1;
            e.lee = true; e.color = '#ff7ae0';
            st.lee.push(e);
            g.popText(p.x, p.y - 40, '🪸 parasita grudou!', '#ff7ae0');
          }
        }
      }
      /* ficam presos em voce, girando */
      for (const e of st.lee) {
        if (e.dead) continue;
        e.wob += dt * 3;
        e.x = p.x + Math.cos(e.wob) * 34;
        e.y = p.y + Math.sin(e.wob) * 34;
        e.flash = Math.max(e.flash, 0.05);
        /* por SEGUNDO, nao por frame */
        g.drainPlayer((3.5 + g.phase * 1.4) * dt);
      }
      for (let i = st.lee.length - 1; i >= 0; i--) if (st.lee[i].dead) st.lee.splice(i, 1);
    },
    drawScreen(c, g, st) {
      if (!st.lee.length) return;
      c.save();
      c.fillStyle = 'rgba(255,122,224,.9)';
      c.font = 'bold 13px "Trebuchet MS", sans-serif';
      c.textAlign = 'left';
      c.fillText('🪸 ' + st.lee.length + ' parasita(s) em você', 14, g.H - 16);
      c.restore();
    }
  };

  /* ============================================================
     15. ONDA DE CHOQUE
     ============================================================ */
  const onda = {
    id: 'onda', nome: 'Onda de Choque', icon: '🌊', tag: 'ONDA', cor: '#7ad7ff',
    desc: 'Anéis de choque saem do centro e varrem a sala inteira.',
    init(g, st) { st.t = 5; },
    update(g, st, dt) {
      st.t -= dt;
      if (st.t > 0) return;
      st.t = rand(4.5, 7);
      g.spawnRing({
        x: CX(g), y: CY(g), r0: 20, r1: 1200, dmg: 16 + g.depth * 2,
        color: '#7ad7ff', knock: 280, life: 1.1, slow: 0.35, slowTime: 1.2
      });
      g.popText(CX(g), CY(g) - 60, '🌊 ONDA!', '#7ad7ff');
      U.shake(220);
    }
  };

  /* ============================================================
     16. SAÍDA ERRANTE
     ============================================================ */
  const saidaErrante = {
    id: 'saidaErrante', nome: 'Saída Errante', icon: '🚪', tag: 'SAÍDA ERRANTE', cor: '#e0b3ff',
    desc: 'Depois de limpar a sala, a SAÍDA fica pulando de lugar em lugar.',
    init(g, st) { st.t = 9; st.log = []; },
    update(g, st, dt) {
      for (let i = st.log.length - 1; i >= 0; i--) {
        st.log[i].t -= dt;
        if (st.log[i].t <= 0) st.log.splice(i, 1);
      }
      const d = g.door;
      if (!d.open) return;
      st.t -= dt;
      if (st.t > 0) return;
      st.t = rand(7, 12);
      st.log.push({ x: d.x, y: d.y, t: 1.4 });
      for (let i = 0; i < 30; i++) {
        const s = freeSpot(g, 60, 170, Math.min(g.roomW, g.roomH) * 0.44);
        if (!g.obsFreeAt(s.x, s.y, 56)) continue;
        if (dist2(s.x, s.y, g.p.x, g.p.y) < 190 * 190) continue;
        d.x = s.x; d.y = s.y;
        break;
      }
      g.popText(d.x, d.y - 62, '🚪 a saída se mudou!', '#e0b3ff');
    },
    draw(c, g, st) {
      for (const m of st.log) {
        c.save();
        c.globalAlpha = clamp(m.t / 1.4, 0, 1) * 0.5;
        c.strokeStyle = '#e0b3ff';
        c.lineWidth = 3;
        c.setLineDash([8, 10]);
        c.beginPath(); c.arc(m.x, m.y, 38, 0, TAU); c.stroke();
        c.restore();
      }
    }
  };

  /* ============================================================
     17. FOME
     ============================================================ */
  const fome = {
    id: 'fome', nome: 'Fome', icon: '🍽️', tag: 'FOME', cor: '#9de84f',
    desc: 'Abater enche a barriga. Com a barriga cheia você recupera vida — vazia, você fica lento.',
    init(g, st) { st.food = 60; st.base = g.p.speed; st.buf = 0; st.starving = false; },
    onKill(g, st) { st.food = Math.min(100, st.food + 7); },
    update(g, st, dt) {
      const p = g.p;
      st.food -= dt * 3.6;
      /* so mexe na velocidade ENQUANTO esta com fome: um bônus de velocidade
         gained no meio da sala continua valendo quando voce se alimenta */
      if (st.food <= 0) {
        st.food = 0;
        if (!st.starving) { st.starving = true; st.base = p.speed; p.speed = Math.max(80, st.base * 0.55); }
      } else if (st.starving) { st.starving = false; p.speed = st.base; }
      if (st.food > 88) {
        st.buf += dt;
        if (st.buf >= 2.5) { st.buf = 0; g.heal(p.maxHp * 0.07, true); }
      } else st.buf = 0;
    },
    drawScreen(c, g, st) {
      const w = 150, x = g.W - w - 14, y = g.H - 22;
      c.save();
      c.fillStyle = 'rgba(0,0,0,.5)';
      c.fillRect(x - 2, y - 2, w + 4, 16);
      c.fillStyle = st.food > 30 ? '#9de84f' : '#ff5a4a';
      c.fillRect(x, y, w * (st.food / 100), 12);
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = 'bold 11px "Trebuchet MS", sans-serif';
      c.textAlign = 'right';
      c.fillText('🍽️', x - 6, y + 10);
      c.restore();
    }
  };

  /* ============================================================
     18. VENDAVAL
     ============================================================ */
  const vendaval = {
    id: 'vendaval', nome: 'Vendaval', icon: '🌪️', tag: 'VENDAVAL', cor: '#cfe4ff',
    desc: 'Um vento constante empurra você para o lado da sala.',
    init(g, st) { st.a = rand(TAU); st.f = rand(80, 150); },
    update(g, st, dt) {
      const p = g.p;
      st.a += dt * 0.22;
      st.f = 90 + Math.sin(g.time * 0.6) * 40 + g.phase * 3;
      const dx = Math.cos(st.a) * st.f * dt, dy = Math.sin(st.a) * st.f * dt;
      if (g.obstacles.length) g.moveBody(p, dx, dy, p.r);
      else { p.x += dx; p.y += dy; }
      p.x = clamp(p.x, p.r, g.roomW - p.r);
      p.y = clamp(p.y, p.r, g.roomH - p.r);
    },
    draw(c, g, st) {
      const L = g.view.left - 60, R = g.view.right + 60, T = g.view.top - 60, B = g.view.bottom + 60;
      const ca = Math.cos(st.a), sa = Math.sin(st.a);
      c.save();
      c.strokeStyle = 'rgba(207,228,255,.30)';
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const d = g.time * 420 + i * 137;
        const x = L + ((d % (R - L + 300))), y = T + ((i * 271 + d * 0.25) % (B - T + 120)) - 60;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + ca * 46, y + sa * 46);
        c.stroke();
      }
      c.lineCap = 'butt';
      c.restore();
    }
  };

  /* ============================================================
     19. BLINDADOS
     ============================================================ */
  const blindados = {
    id: 'blindados', nome: 'Blindados', icon: '🛡️', tag: 'BLINDADO', cor: '#7ad7ff',
    desc: 'Todo bixo nasce com escudo. Acerta até quebrar — depois ele fica tonto.',
    init(g, st) { st.t = 0; },
    onSpawn(g, st, e) {
      if (e.boss || e.lee) return;
      e.shield = e.maxHp * 0.35;
    },
    drawScreen(c, g, st) {
      c.save();
      c.fillStyle = 'rgba(122,215,255,.85)';
      c.font = 'bold 13px "Trebuchet MS", sans-serif';
      c.textAlign = 'left';
      c.fillText('🛡️ tudo tem escudo — quebre antes de matar', 14, g.H - 16);
      c.restore();
    }
  };

  /* ============================================================
     20. CRONÔMETRO
     ============================================================ */
  const relogio = {
    id: 'relogio', nome: 'Cronômetro', icon: '⏱️', tag: 'CRONÔMETRO', cor: '#ffd76a',
    desc: 'A sala tem relógio. Se ele zerar, cai uma horda extra — e o relógio reinicia.',
    init(g, st) { st.t = 30; },
    update(g, st, dt) {
      if (g.roomCleared) return;
      st.t -= dt;
      if (st.t > 0) return;
      st.t = 30;
      const extra = 6 + g.depth;
      g.roomTotal += extra;
      for (let i = 0; i < 5; i++) {
        const pos = g.ringSpawn(10, 140);
        g.spawnEnemy(VS.Entities.pickType(g.depth), pos.x, pos.y);
      }
      g.popText(g.p.x, g.p.y - 48, '⏱️ horda extra!', '#ffd76a');
      VS.UI.toast('⏱️ TEMPO ESGOTADO — caiu mais horda!', 2000);
      U.shake(280);
    },
    drawScreen(c, g, st) {
      if (g.roomCleared) return;
      const w = 170, x = g.W / 2 - w / 2, y = 12;
      c.save();
      c.fillStyle = 'rgba(0,0,0,.5)';
      c.fillRect(x - 3, y - 3, w + 6, 20);
      c.fillStyle = st.t < 8 && (g.time * 3 % 1 < 0.5) ? '#ff5a4a' : '#ffd76a';
      c.fillRect(x, y, w * clamp(st.t / 30, 0, 1), 14);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.font = 'bold 12px "Trebuchet MS", sans-serif';
      c.textAlign = 'center';
      c.fillText('⏱️ ' + Math.ceil(st.t) + 's', g.W / 2, y + 12);
      c.restore();
    }
  };

  /* ============================================================
     REGISTRO
     ============================================================ */
  const LIST = [
    neblina, meteoros, gelo, minas, lasers,
    encolhendo, sede, chamas, grito, redemoinho,
    moedas, eco, elite, parasita, onda,
    saidaErrante, fome, vendaval, blindados, relogio
  ];

  const BY_ID = {};
  for (const m of LIST) BY_ID[m.id] = m;

  /* ---------------- ciclo de vida ---------------- */
  function enter(g) {
    g.mech = null;
    /* a SETEC já é uma sala "de tesouro": nao ganha mecânica */
    if (g.roomKind === 'setec') return;
    const def = pick(LIST);
    g.mech = { id: def.id, def: def, st: {} };
    if (def.init) def.init(g, g.mech.st);
  }

  function update(g, dt) {
    const m = g.mech;
    if (m && m.def.update) m.def.update(g, m.st, dt);
  }

  function draw(c, g) {
    const m = g.mech;
    if (m && m.def.draw) m.def.draw(c, g, m.st);
  }

  function drawScreen(c, g) {
    const m = g.mech;
    if (m && m.def.drawScreen) m.def.drawScreen(c, g, m.st);
  }

  function onSpawn(g, e) {
    const m = g.mech;
    if (m && m.def.onSpawn) m.def.onSpawn(g, m.st, e);
  }

  function onKill(g, e) {
    const m = g.mech;
    if (m && m.def.onKill) m.def.onKill(g, m.st, e);
  }

  function info(g) {
    const m = g.mech;
    return m ? m.def : null;
  }

  return { LIST, BY_ID, enter, update, draw, drawScreen, onSpawn, onKill, info };
})();
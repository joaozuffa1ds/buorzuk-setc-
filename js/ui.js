/* ============================================================
   ui.js  —  telas, HUD, cards de level-up, loja e resultados
   ============================================================ */
window.VS = window.VS || {};

VS.UI = (function () {
  const U = VS.U, D = VS.DATA;
  const { rand, chance, pick, clamp, fmtTime, fmtNum } = U;

  const $ = (id) => document.getElementById(id);
  const el = {};
  let chosenMode = 'infinito';
  let currentChoices = [];
  let toastT = null;

  /* ---------------- SCREENS ---------------- */
  const SCREENS = ['menu', 'shop', 'chars', 'skins', 'levelup', 'pause', 'gameover'];
  function show(id) {
    for (const k of SCREENS) el[k].classList.toggle('hidden', k !== id);
    el.hud.classList.toggle('hidden', !(id === null || id === 'levelup' || id === 'pause'));
    if (id) el[id].scrollTop = 0;
  }
  function hideAll() {
    for (const k of SCREENS) el[k].classList.add('hidden');
    el.hud.classList.remove('hidden');
  }

  /* ---------------- TOAST ---------------- */
  function toast(msg, dur = 2000) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('show'), dur);
  }
  function banner(on) { el.fusionBanner.classList.toggle('hidden', !on); }

  let roomBannerT = null;
  function roomBanner(text, dur = 2000) {
    clearTimeout(roomBannerT);
    if (!text) { el.roomBanner.classList.add('hidden'); return; }
    el.roomBanner.textContent = text;
    el.roomBanner.classList.remove('hidden');
    /* reinicia a animacao */
    el.roomBanner.style.animation = 'none';
    void el.roomBanner.offsetWidth;
    el.roomBanner.style.animation = '';
    roomBannerT = setTimeout(() => el.roomBanner.classList.add('hidden'), dur);
  }

  /* ---------------- SALVAR PROGRESSO ---------------- */
  function loadSave() {
    if (!VS.Save || !VS.Save.disponivel()) return;
    VS.Save.apply(VS.Game.meta, VS.Save.read());
    if (!Array.isArray(VS.Game.meta.usados)) VS.Game.meta.usados = [];
  }

  function saveNow(imediato) {
    if (!VS.Save) return;
    if (VS.Game.isHardcore && VS.Game.isHardcore()) { VS.Game.saveWorld(); return; }
    if (imediato) VS.Save.writeNow(VS.Game.meta);
    else VS.Save.write(VS.Game.meta);
  }

  /* ============================================================
     CÓDIGOS — campo da tela inicial (data.js tem a lista)
     ============================================================ */
  function codeFlash(ok) {
    const c = el.codeBox;
    clearTimeout(codeFlash.t);
    c.classList.remove('code-ok', 'code-bad');
    void c.offsetWidth;
    c.classList.add(ok ? 'code-ok' : 'code-bad');
    codeFlash.t = setTimeout(() => c.classList.remove('code-ok', 'code-bad'), 700);
  }

  function tryCode(raw) {
    const txt = String(raw || '');
    el.codeInput.value = '';

    const c = D.findCode(txt);
    if (!c) {
      VS.Audio.SFX.deny();
      toast('Código inválido');
      codeFlash(false);
      return false;
    }

    const m = VS.Game.meta;
    if (!Array.isArray(m.usados)) m.usados = [];

    if (c.effect === 'wipe') {
      VS.Save && VS.Save.wipe();
      VS.Game.meta = D.freshMeta();
      VS.Audio.SFX.deny();
      toast(c.msg + ' Recarregando…', 1400);
      codeFlash(true);
      setTimeout(() => location.reload(), 1200);
      return true;
    }

    if (m.usados.indexOf(c.id) >= 0) {
      VS.Audio.SFX.deny();
      toast('Esse código já foi usado');
      codeFlash(false);
      return false;
    }

    if (c.effect === 'chars') {
      VS.Chars.unlockAll();
      m.usados.push(c.id);
      saveNow(true);
      VS.Audio.SFX.fusion();
      setTimeout(() => VS.Audio.SFX.buy(), 260);
      toast(c.msg, 3600);
      buildMenu();
      syncHud();
      codeFlash(true);
      return true;
    }

    if (c.effect === 'gemas') {
      m.gems += c.value;
      m.usados.push(c.id);
      saveNow(true);
      VS.Audio.SFX.gem();
      toast(c.msg, 2800);
      buildMenu();
      syncHud();
      codeFlash(true);
      return true;
    }

    VS.Audio.SFX.deny();
    toast('Código inválido');
    codeFlash(false);
    return false;
  }

  /* ---------------- MENU ---------------- */
  function buildMenu() {
    el.modeList.innerHTML = '';
    for (const id in D.MODES) {
      const m = D.MODES[id];
      const d = document.createElement('div');
      d.className = 'mode' + (id === chosenMode ? ' sel' : '');
      d.innerHTML = `<div class="m-name">${m.icon} ${m.name}</div><div class="m-desc">${m.desc}</div>`;
      d.onclick = () => { chosenMode = id; buildMenu(); VS.Audio.SFX.buy(); };
      el.modeList.appendChild(d);
    }
    const mt = VS.Game.meta, b = mt.bonus;
    const ch = VS.Chars.current();
    const parts = [];
    parts.push(`👤 <b>${ch.icon} ${ch.name}</b>`);
    if (D.bonusText(ch.bonus)) parts.push(D.bonusText(ch.bonus));
    parts.push(`💎 <b>${mt.gems}</b> gemas na sessão`);
    parts.push(`🗡️ slots: <b>${4 + mt.slot + ((ch.bonus && ch.bonus.slots) || 0)}</b>`);
    parts.push(`⭐ nível inicial: <b>${1 + mt.nivel}</b>`);
    if (b.poder) parts.push(`💥 poder: <b>+${b.poder * 10}%</b>`);
    if (b.vida) parts.push(`❤️ vida: <b>+${b.vida * 25}</b>`);
    if (b.sorte) parts.push(`🍀 sorte: <b>+${b.sorte}</b>`);
    if (b.velo) parts.push(`👟 velocidade: <b>+${b.velo * 8}%</b>`);
    if (b.crit) parts.push(`🎯 crítico: <b>+${b.crit * 5}%</b>`);
    if (b.armadura) parts.push(`🛡️ armadura: <b>+${b.armadura}</b>`);
    if (mt.revive) parts.push(`💖 renascer: <b>${mt.revive}x</b>`);
    if (mt.ouro) parts.push(`🪙 ouro inicial: <b>+${mt.ouro * 100}</b>`);
    if (parts.length === 1) parts.push('nenhuma melhoria comprada ainda — abra a loja!');
    el.menuBuild.innerHTML = parts.join(' · ');
    buildWorldPanel();
    /* o botao JOGAR vira CONTINUAR quando existe mundo */
    const temMundo = chosenMode === 'hardcore' && VS.Save && VS.Save.worldRead();
    el.btnPlay.textContent = temMundo ? '▶ CONTINUAR MUNDO' : '▶ JOGAR';
    if (!el.codexWeapons.children.length) buildCodex();
  }

  /* ============================================================
     TELA DE SKINS
     ============================================================ */
  function buildSkins() {
    const m = VS.Game.meta;
    el.skinsGems.textContent = m.gems;
    el.skinGrid.innerHTML = '';
    const sel = m.skins.sel;
    for (const sk of D.allSkins()) {
      const un = VS.Chars.skinUnlocked(sk.id);
      const ow = VS.Chars.skinOwned(sk.id);
      const isSel = sel === sk.id;
      const d = document.createElement('div');
      d.className = 'skin' + (isSel ? ' sel' : '') + (un ? '' : ' locked');

      /* preview com o sprite pintado da skin */
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 84;
      cv.className = 'skin-prev';
      d.appendChild(cv);
      setTimeout(() => drawSkinPreview(cv, sk), 0);

      const st = document.createElement('div');
      st.className = 'sk-st';
      st.innerHTML = isSel ? '<span class="on">EM USO</span>'
        : ow ? '<span>COMPRADA</span>'
          : un ? `<span class="price">💎 ${sk.custo}</span>`
            : '<span class="req">🔒 ' + (sk.char ? 'libera com o personagem ' + D.char(sk.char).name : 'bloqueada') + '</span>';
      d.appendChild(st);

      const nm = document.createElement('div');
      nm.className = 'sk-name';
      nm.style.color = sk.cor;
      nm.textContent = sk.icon + ' ' + sk.name;
      d.appendChild(nm);

      const ds = document.createElement('div');
      ds.className = 'sk-desc';
      ds.textContent = sk.per && D.bonusText(sk.per) ? D.bonusText(sk.per) : sk.desc;
      d.appendChild(ds);

      if (ow && !isSel) {
        const b = document.createElement('button');
        b.className = 'buy'; b.textContent = 'USAR';
        b.onclick = () => VS.Chars.selectSkin(sk.id);
        d.appendChild(b);
      } else if (un && !ow) {
        const b = document.createElement('button');
        b.className = 'buy'; b.textContent = '💎 ' + sk.custo;
        b.disabled = m.gems < sk.custo;
        b.onclick = () => VS.Chars.buySkin(sk.id);
        d.appendChild(b);
      }
      el.skinGrid.appendChild(d);
    }
  }

  /* desenha o preview da skin no canvas do card
   (o personagem e desenhado no canvas — nao existe sprite player_*.png) */
  function drawSkinPreview(cv, sk) {
    const c = cv.getContext('2d');
    if (!c) return;
    const w = cv.width, h = cv.height, cx = w / 2;
    /* fundo */
    c.fillStyle = '#100c1c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = sk.cor + '26';
    c.beginPath(); c.ellipse(cx, h - 12, 30, 9, 0, 0, Math.PI * 2); c.fill();

    /* capa */
    c.fillStyle = sk.cor2 || '#3a2f56';
    c.beginPath(); c.ellipse(cx - 5, h - 30, 20, 15, -0.2, 0, Math.PI * 2); c.fill();
    /* corpo */
    c.fillStyle = sk.cor;
    c.beginPath(); c.arc(cx, h - 34, 19, 0, Math.PI * 2); c.fill();
    c.strokeStyle = sk.cor2 || '#3a2f56';
    c.lineWidth = 3;
    c.stroke();
    /* brasao */
    c.fillStyle = sk.cor2 || '#3a2f56';
    c.beginPath();
    c.moveTo(cx, h - 40); c.lineTo(cx + 6, h - 34); c.lineTo(cx, h - 27); c.lineTo(cx - 6, h - 34);
    c.closePath(); c.fill();
    /* olhos */
    c.fillStyle = '#2a1030';
    c.beginPath(); c.arc(cx - 4, h - 38, 2.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 4, h - 38, 2.6, 0, Math.PI * 2); c.fill();
  }

  /* ============================================================
     MUNDO HARDCORE — painel do menu
     ============================================================ */
  function buildWorldPanel() {
    const w = VS.Save ? VS.Save.worldRead() : null;
    if (!w || !w.snap) { el.worldPanel.classList.add('hidden'); return; }
    const s = w.snap, j = s.jogador || {};
    const rel = (s.reliquias || []).length;
    const meta = s.meta || { gems: 0, chars: { owned: ['viajante'] } };
    const chs = (meta.chars && meta.chars.owned) ? meta.chars.owned.length : 1;
    const arma = (j.armas || []).length;
    el.worldPanel.classList.remove('hidden');
    el.worldPanel.innerHTML =
      `<div class="wp-title">🧱 MUNDO SALVO — ${w.nome}</div>
      <div class="wp-info">DIA <b>${w.dia || 1}</b> · FASE <b>${s.fase}</b> · SALA <b>${s.sala}/${s.salasTotal}</b> ·
        NÍVEL <b>${j.level}</b> · <b>${arma}</b> arma${arma === 1 ? '' : 's'} ·
        <b>${rel}</b> relíquia${rel === 1 ? '' : 's'} · <b>${fmtNum(s.kills || 0)}</b> abates ·
        💎 <b>${fmtNum(meta.gems || 0)}</b> · <b>${chs}</b> personagens</div>
      <div class="wp-warn">⚠️ Se você morrer neste mundo, <b>tudo</b> é apagado.</div>
      <div class="wp-btns" id="wpBtns"></div>`;

    const btns = $('wpBtns');
    const cont = document.createElement('button');
    cont.className = 'buy';
    cont.textContent = '▶ CONTINUAR MUNDO';
    cont.onclick = () => {
      VS.Audio.resume();
      chosenMode = 'hardcore';
      buildMenu();
      VS.Game.start('hardcore');
    };
    btns.appendChild(cont);

    const wipe = document.createElement('button');
    wipe.className = 'buy danger';
    wipe.textContent = '🗑 APAGAR MUNDO';
    wipe.onclick = () => {
      if (wipe.dataset.confirm !== '1') {
        wipe.dataset.confirm = '1';
        wipe.textContent = '⚠️ TEM CERTEZA? CLIQUE DE NOVO';
        wipe.classList.add('warn');
        clearTimeout(wipe._t);
        wipe._t = setTimeout(() => {
          wipe.dataset.confirm = '0';
          wipe.textContent = '🗑 APAGAR MUNDO';
          wipe.classList.remove('warn');
        }, 3500);
        return;
      }
      VS.Save && VS.Save.worldWipe();
      VS.Audio.SFX.deny();
      toast('🗑 Mundo apagado. Você começa do zero.');
      buildMenu();
    };
    btns.appendChild(wipe);
  }

  /* ============================================================
     TELA DE PERSONAGENS
     ============================================================ */
  function buildChars() {
    const m = VS.Game.meta;
    el.charsGems.textContent = m.gems;
    el.charGrid.innerHTML = '';
    const sel = m.chars.sel;
    for (const c of D.allCharacters()) {
      const un = VS.Chars.unlocked(c.id);
      const ow = VS.Chars.owned(c.id);
      const isSel = sel === c.id;
      const d = document.createElement('div');
      d.className = 'char' + (isSel ? ' sel' : '') + (un ? '' : ' locked');

      const wtxt = c.god ? '🔓 TODAS as armas (10 + 9 fusões)'
        : (c.weapon ? `${D.def(c.weapon).icon} ${D.def(c.weapon).name}` : '—');
      let status;
      if (isSel) status = '<span class="c-st on">EM USO</span>';
      else if (ow) status = '<span class="c-st">COMPRADO</span>';
      else if (un) status = `<span class="c-st">💎 ${c.cost}</span>`;
      else status = '<span class="c-st req">🔒 ' + (c.codeOnly ? 'só pelo código 2026' : D.reqText(c.req)) + '</span>';

      d.innerHTML = `
        <div class="ch-ico" style="border-color:${c.color}">${c.icon}</div>
        <div class="ch-name" style="color:${c.color}">${c.name}</div>
        <div class="ch-weapon">${wtxt}</div>
        <div class="ch-bonus">${D.bonusText(c.bonus) || 'sem bônus'}</div>
        <div class="ch-desc">${c.desc}</div>
        ${status}`;

      if (ow && !isSel) {
        const b = document.createElement('button');
        b.className = 'buy';
        b.textContent = 'USAR';
        b.onclick = () => VS.Chars.select(c.id);
        d.appendChild(b);
      } else if (un && !ow) {
        const b = document.createElement('button');
        b.className = 'buy';
        b.textContent = '💎 ' + c.cost;
        b.disabled = m.gems < c.cost;
        b.onclick = () => VS.Chars.buy(c.id);
        d.appendChild(b);
      }
      el.charGrid.appendChild(d);
    }
  }

  /* ---------------- CÓDICE DE ARMAS ---------------- */
  function buildCodex() {
    const owned = Object.create(null);
    for (const w of VS.Chars.basicPool()) owned[w.id] = 1;

    let h = '';
    for (const d of D.allWeapons()) {
      const open = owned[d.id];
      h += `<div class="cx-item${open ? '' : ' off'}"><div class="cx-ico">${open ? d.icon : '🔒'}</div><div>
        <div class="cx-name">${open ? d.name : '???'}</div>
        <div class="cx-desc">${open ? d.desc : 'Libera comprando o personagem que destrava esta arma.'}</div></div></div>`;
    }
    el.codexWeapons.innerHTML = h;

    const inPool = Object.create(null);
    for (const w of VS.Chars.pool()) inPool[w.id] = 1;

    let f = '';
    for (const d of D.allFusions()) {
      const req = d.from.map(id => `${D.WEAPONS[id].icon} ${D.WEAPONS[id].name} nv3`).join(' + ');
      const direto = inPool[d.id]
        ? '<div class="cx-req" style="color:var(--gold)">✔ já no seu sorteio</div>'
        : '';
      f += `<div class="cx-item fusion"><div class="cx-ico">${d.icon}</div><div>
        <div class="cx-name">${d.name}</div>
        <div class="cx-req">${req}</div>
        ${direto}
        <div class="cx-desc">${d.desc}</div></div></div>`;
    }
    el.codexFusions.innerHTML = f;

    /* ---- as 20 reliquias ---- */
    let rl = '';
    for (const r of D.allRelics()) {
      rl += `<div class="relic-card">
        <div class="rl-art"><img src="assets/relics/${r.file}.png" alt="${r.name}"></div>
        <div class="rl-name" style="color:${r.color}">${r.icon} ${r.name}</div>
        <div class="rl-desc">${r.desc}</div>
      </div>`;
    }
    el.codexRelics.innerHTML = rl;

    /* personagens, no fim do codigo */
    let c = '';
    for (const d of D.allCharacters()) {
      const st = VS.Chars.owned(d.id) ? '✔️' : VS.Chars.unlocked(d.id) ? '🔓' : '🔒';
      c += `<div class="cx-item"><div class="cx-ico">${d.icon}</div><div>
        <div class="cx-name">${st} ${d.name} ${d.weapon ? '· ' + D.def(d.weapon).icon + ' ' + D.def(d.weapon).name : (d.god ? '· TODAS as armas (10 + 9 fusões)' : '· todas as armas')}</div>
        <div class="cx-desc">${d.desc}</div></div></div>`;
    }
    el.codexChars.innerHTML = c;
  }

  function worldInfoHide() {
    if (el.worldInfo) el.worldInfo.classList.add('hidden');
  }

  /* ---------------- HUD das relíquias ---------------- */
  let lastRelicKey = '';
  function syncRelics() {
    const G = VS.Game;
    const key = G.relics.join(',');
    if (key === lastRelicKey) return;
    lastRelicKey = key;
    el.relicBar.innerHTML = '';
    for (const id of G.relics) {
      const r = D.relic(id);
      if (!r) continue;
      const d = document.createElement('div');
      d.className = 'rslot';
      d.style.borderColor = r.color;
      d.title = r.name + ' — ' + r.desc;
      d.innerHTML = `<img src="assets/relics/${r.file}.png" alt=""><b>${r.icon}</b>`;
      el.relicBar.appendChild(d);
    }
  }
  function resetRelics() { lastRelicKey = 'x'; }

  /* ---------------- HUD ---------------- */
  function syncHud() {
    const G = VS.Game, p = G.p;
    if (!p) return;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    el.hpFill.style.width = hpPct + '%';
    el.hpText.textContent = Math.max(0, Math.ceil(p.hp)) + '/' + Math.round(p.maxHp);
    el.xpFill.style.width = clamp(p.xp / p.nextXp, 0, 1) * 100 + '%';
    el.xpText.textContent = 'Nv ' + p.level + ' · ' + Math.floor(p.xp) + '/' + Math.round(p.nextXp);
    el.timer.textContent = fmtTime(G.runTime);
    el.waveInfo.textContent = G.roomLabel() + (G.boss ? ' · CHEFE' : '');
    if (G.hardcore && G.world) {
      el.worldInfo.classList.remove('hidden');
      el.worldInfo.textContent = '🧱 ' + G.world.nome + ' · DIA ' + G.world.dia;
    } else el.worldInfo.classList.add('hidden');
    el.kills.textContent = fmtNum(G.kills);
    el.money.textContent = fmtNum(G.money);
    el.gems.textContent = fmtNum(G.meta.gems);

    /* barra de chefe */
    if (G.boss && !G.boss.dead) {
      el.bossBar.classList.remove('hidden');
      el.bossFill.style.width = clamp(G.boss.hp / G.boss.maxHp, 0, 1) * 100 + '%';
      el.bossName.textContent = G.boss.name;
    } else el.bossBar.classList.add('hidden');

    drawWeaponBar();
    syncRelics();
  }

  let lastBarKey = '';
  function resetBar() { lastBarKey = ''; resetRelics(); }
  function drawWeaponBar() {
    const G = VS.Game, p = G.p;
    const key = p.weapons.map(w => w.id + w.level).join('|');
    if (key !== lastBarKey) {
      lastBarKey = key;
      el.weaponsBar.innerHTML = '';
      for (const w of p.weapons) {
        const def = D.def(w.id);
        const d = document.createElement('div');
        d.className = 'wslot' + (D.isFusion(w.id) ? ' fusion' : '');
        d.title = def.name + ' — ' + def.desc;
        d.innerHTML = `${def.icon}<span class="lv">${w.level}</span><span class="cd"></span>`;
        el.weaponsBar.appendChild(d);
      }
    }
    /* barras de recarga */
    const kids = el.weaponsBar.children;
    for (let i = 0; i < p.weapons.length && i < kids.length; i++) {
      const w = p.weapons[i];
      const s = w.stats || D.statsFor(D.def(w.id), w.level);
      const pct = s.cd ? clamp(1 - w.cd / s.cd, 0, 1) * 100 : 0;
      const bar = kids[i].querySelector('.cd');
      if (bar) bar.style.width = pct + '%';
    }
  }

  /* ---------------- BAÚ ---------------- */
  function chestPrompt() {
    const c = VS.Game.nearChest;
    if (!c || VS.Game.state !== 'play') { el.chestPrompt.classList.add('hidden'); return; }
    el.chestPrompt.classList.remove('hidden');
    el.chestCost.textContent = Math.floor(VS.Game.money) + '/' + c.tier.cost + ' moedas';
  }

  /* ============================================================
     LEVEL UP — sorteia 4 melhorias
     ============================================================ */
  function buildChoices() {
    const G = VS.Game, p = G.p, out = [];

    /* 1. fusões disponíveis */
    const fus = G.availableFusions();
    if (fus.length) {
      const id = pick(fus);
      const def = D.FUSIONS[id];
      out.push({
        tag: 'FUSÃO ' + def.from.map(f => D.WEAPONS[f].icon).join(' + '),
        name: def.name, icon: def.icon, desc: def.desc, cls: 'fusion', w: 999,
        apply() {
          const p = G.p;
          /* a fusão SEMPRE cabe: ela come as duas armas que deram origem */
          if (p.weapons.length >= p.slots) {
            p.weapons = p.weapons.filter(w => def.from.indexOf(w.id) < 0);
          }
          if (!G.addWeapon(id)) {
            /* ainda assim sem espaço (armas iguais): troca a mais fraca */
            const weak = p.weapons.reduce((a, b) => (a && a.level <= b.level ? a : b), null);
            if (weak) {
              const i = p.weapons.indexOf(weak);
              p.weapons[i] = { id, level: 1, cd: 0 };
              VS.Chars.note('fusions');
              VS.Chars.sync();
            }
          }
          const i = G.pendingFusions.indexOf(id);
          if (i >= 0) G.pendingFusions.splice(i, 1);
          toast('🔮 FUSÃO CRIADA: ' + def.name + '!', 3000);
        }
      });
    }

    /* 2. subir armas que você já tem */
    for (const w of p.weapons) {
      const def = D.def(w.id);
      if (w.level >= def.max) continue;
      const prev = D.statsFor(def, w.level), next = D.statsFor(def, w.level + 1);
      out.push({
        tag: (D.isFusion(w.id) ? 'FUSÃO' : 'ARMA') + ' NÍVEL ' + (w.level + 1),
        name: def.icon + ' ' + def.name, icon: def.icon,
        desc: `Dano ${Math.round(prev.dmg)} → <b>${Math.round(next.dmg)}</b>` +
          (prev.count !== next.count ? ` · ${next.count} projéteis` : '') +
          (prev.cd !== next.cd ? ` · recarga ${next.cd.toFixed(2)}s` : ''),
        cls: D.isFusion(w.id) ? 'fusion' : '', w: 44,
        apply() { w.level++; checkFusionsToast(); }
      });
    }

    /* 3. armas novas — todas as 20, menos as que já tem.
          Com os slots CHEIOS o jogador para de receber armas novas:
          o sorteio fica só com fusões, upgrades, passivas, cura e ouro. */
    const ownedSet = new Set(p.weapons.map(w => w.id));
    const full = p.weapons.length >= p.slots;
    const pool = full ? [] : D.allWeapons().filter(d2 => !ownedSet.has(d2.id));
    if (pool.length) {
      const sample = pool.length > 4 ? pool.slice().sort(() => Math.random() - 0.5).slice(0, 4) : pool;
      for (const def of sample) {
        out.push({
          tag: 'NOVA ARMA',
          name: def.icon + ' ' + def.name, icon: def.icon,
          desc: def.desc, cls: '', w: 9,
          apply() {
            if (!G.addWeapon(def.id)) {
              /* corre: os slots encheram entre sortear e escolher */
              toast('Slots cheios');
              return;
            }
            checkFusionsToast();
          }
        });
      }
    }

    /* 4. passivas */
    for (const id in D.PASSIVES) {
      const d2 = D.PASSIVES[id], lv = p.passives[id] || 0;
      if (lv >= d2.max) continue;
      out.push({
        tag: 'PASSIVA', name: d2.name, icon: d2.icon,
        desc: `${d2.desc} <b>(${lv}/${d2.max})</b>`, cls: 'passive', w: 14,
        apply() { G.gainPassive(id); }
      });
    }

    /* 5. cura */
    out.push({
      tag: 'CURA', name: 'Curativo', icon: '🧪',
      desc: `Recupera <b>45%</b> da sua vida (${Math.round(p.maxHp * 0.45)} hp)`,
      cls: 'passive', w: p.hp / p.maxHp < 0.6 ? 22 : 4,
      apply() { G.heal(p.maxHp * 0.45); }
    });

    /* 6. moedas */
    out.push({
      tag: 'OURO', name: 'Bolsa de moedas', icon: '🪙',
      desc: 'Recebe <b>120</b> moedas para abrir baús',
      cls: '', w: 6,
      apply() { G.money += 120; }
    });

    /* sorteio ponderado sem repetir */
    const chosen = [];
    const pool2 = out.slice();
    while (chosen.length < 4 && pool2.length) {
      let tot = 0;
      for (const o of pool2) tot += o.w;
      let r = Math.random() * tot, idx = 0;
      for (let i = 0; i < pool2.length; i++) { r -= pool2[i].w; if (r <= 0) { idx = i; break; } }
      chosen.push(pool2.splice(idx, 1)[0]);
    }
    return chosen;
  }

  function checkFusionsToast() {
    const G = VS.Game;
    if (G.availableFusions().length) {
      toast('🔮 Você já pode criar uma FUSÃO!', 2200);
      banner(true);
    }
  }

  function openLevelUp() {
    const G = VS.Game, p = G.p;
    G.state = 'levelup';
    G.levelQueue = Math.max(0, G.levelQueue - 1);
    currentChoices = buildChoices();
    el.lvNum.textContent = p.level;
    el.cards.innerHTML = '';
    currentChoices.forEach((o, i) => {
      const d = document.createElement('div');
      d.className = 'card ' + o.cls;
      d.innerHTML = `<div class="c-tag">${o.tag}</div>
        <div class="c-ico">${o.icon}</div>
        <div class="c-name">${o.name}</div>
        <div class="c-desc">${o.desc}</div>
        <div class="c-tag">clique ou tecle ${i + 1}</div>`;
      d.onclick = () => choose(i);
      el.cards.appendChild(d);
    });
    show('levelup');
  }

  function choose(i) {
    if (VS.Game.state !== 'levelup') return;
    const o = currentChoices[i];
    if (!o) return;
    o.apply();
    VS.Audio.SFX.level();
    if (VS.Game.levelQueue > 0) { openLevelUp(); return; }
    VS.Game.state = 'play';
    hideAll();
    syncHud();
  }

  /* ============================================================
     LOJA
     ============================================================ */
  function getLv(item) {
    const m = VS.Game.meta;
    if (item.id === 'slot') return m.slot;
    if (item.id === 'nivel') return m.nivel;
    if (item.id === 'revive') return m.revive;
    if (item.id === 'ouro') return m.ouro;
    return m.bonus[item.id] || 0;
  }
  function addLv(item) {
    const m = VS.Game.meta;
    if (item.id === 'slot') m.slot++;
    else if (item.id === 'nivel') m.nivel++;
    else if (item.id === 'revive') m.revive++;
    else if (item.id === 'ouro') m.ouro++;
    else m.bonus[item.id] = (m.bonus[item.id] || 0) + 1;
  }

  function buildShop() {
    const m = VS.Game.meta;
    el.shopGems.textContent = m.gems;
    el.shopGrid.innerHTML = '';
    for (const item of D.SHOP_ITEMS) {
      const lv = getLv(item);
      const cost = D.price(item, lv);
      const maxed = lv >= item.max;
      const afford = m.gems >= cost;
      const d = document.createElement('div');
      d.className = 'shop-item';
      d.innerHTML = `
        <div class="s-ico">${item.icon}</div>
        <div class="s-txt">
          <div class="s-name">${item.name} <span class="s-lv">${maxed ? 'MAX' : 'nv ' + lv}</span></div>
          <div class="s-desc">${item.desc}</div>
        </div>`;
      const b = document.createElement('button');
      b.className = 'buy';
      b.textContent = maxed ? '—' : '💎 ' + cost;
      b.disabled = maxed || !afford;
      b.onclick = () => {
        if (m.gems < cost) { VS.Audio.SFX.deny(); toast('Gemas insuficientes'); return; }
        m.gems -= cost;
        addLv(item);
        VS.Audio.SFX.buy();
        toast(item.icon + ' ' + item.name + ' comprado!', 1800);
        saveNow();
        buildShop();
        buildMenu();
      };
      d.appendChild(b);
      el.shopGrid.appendChild(d);
    }
  }

  /* ============================================================
     FIM DE PARTIDA (ou VITÓRIA no fim das fases do Fácil)
     ============================================================ */
  function gameOver(won, perdido) {
    const G = VS.Game, p = G.p, m = G.mode;

    /* MUNDO PERDIDO: o mundo ja foi apagado, nao entra gema nenhuma */
    if (perdido) {
      const snap = perdido.snap || {};
      const j = snap.jogador || {};
      const rel = (snap.reliquias || []).length;
      const chs = (snap.meta && snap.meta.chars && snap.meta.chars.owned) ? snap.meta.chars.owned.length : 1;
      el.overTitle.textContent = '🧱 MUNDO PERDIDO';
      el.overMode.textContent = 'Você morreu em "' + perdido.nome + '" no dia ' + perdido.dia +
        '. Como no hardcore, tudo que existia nele foi apagado.';
      const perdidoLista = [
        ['🗺️ Fases', snap.fase || 1],
        ['🚪 Salas vencidas', Math.max(0, ((snap.fase || 1) - 1) * 8 + ((snap.sala || 1) - 1))],
        ['⭐ Nível', j.level || 1],
        ['⚔ Abates', fmtNum(snap.kills || 0)],
        ['⏱ Tempo de mundo', fmtTime(snap.tempo || 0)],
        ['🗡️ Armas', (j.armas || []).length],
        ['✨ Relíquias', rel],
        ['🧙 Personagens', chs],
        ['💎 Gemas', fmtNum((snap.meta && snap.meta.gems) || 0)]
      ];
      el.results.innerHTML = perdidoLista.map(r => `<div class="res lost"><div class="r-k">${r[0]}</div><div class="r-v">${r[1]}</div></div>`).join('');
      el.gained.textContent = '💀 Tudo perdido';
      el.gained.classList.add('lost');
      worldInfoHide();
      show('gameover');
      return { gems: 0 };
    }

    const timeB = Math.floor(G.runTime / 2);
    const killB = Math.floor(G.kills / 5);
    const lvlB = Math.max(0, (p.level - 1) * 2);
    const chB = G.chestsOpened * 12;
    const roomB = G.phase * 25 + G.room * 5;
    const total = Math.round((timeB + killB + lvlB + chB + roomB) * m.gem * (1 + p.luck * 0.05) * (p.gemMul || 1));
    G.runGems += total;
    G.meta.gems += total;

    el.overTitle.textContent = won ? '🏆 VOCÊ VENCEU!' : (G.runTime >= 60 ? 'FIM DE JOGO' : 'VOCÊ MORREU');
    el.overMode.textContent = m.icon + ' ' + m.name + ' · ' + (won ? m.fases + ' fases completas!' : m.desc);

    const res = [
      ['⏱ Tempo', fmtTime(G.runTime)],
      ['⭐ Nível', p.level],
      ['⚔ Abates', fmtNum(G.kills)],
      ['📦 Baús', G.chestsOpened],
      ['🚪 Fases', G.phase + ' · ' + G.room + '/' + G.roomsTotal],
      ['🪙 Moedas', fmtNum(G.goldTotal || 0)]
    ];
    el.results.innerHTML = res.map(r => `<div class="res"><div class="r-k">${r[0]}</div><div class="r-v">${r[1]}</div></div>`).join('')
      + `<div class="res" style="grid-column:1/-1"><div class="r-k">Bônus de fim (💎 ${timeB} tempo + ${killB} abates + ${lvlB} nível + ${chB} baús + ${roomB} salas)</div><div class="r-v">💎 ${total}</div></div>`;
    el.gained.textContent = '💎 +' + total + ' gemas';

    el.gained.classList.remove('lost');
    saveNow(true);
    show('gameover');
    return { gems: total };
  }

  /* ============================================================
     PAUSA
     ============================================================ */
  function togglePause(force) {
    const G = VS.Game;
    if (G.state === 'play' || force === false) {
      G.state = 'pause';
      const p = G.p;
      el.pauseStats.innerHTML =
        `<b>${G.roomLabel()}</b><br>Tempo: <b>${fmtTime(G.runTime)}</b> · Nível <b>${p.level}</b> · Abates <b>${G.kills}</b><br>` +
        `Moedas <b>${Math.floor(G.money)}</b> · Gemas na sessão <b>${G.meta.gems}</b><br>` +
        `Personagem: <b>${G.char.icon} ${G.char.name}</b> · Skin: <b>${G.skin.icon} ${G.skin.name}</b><br>` +
        `Armas: ${p.weapons.map(w => D.def(w.id).icon + 'nv' + w.level).join(' ') || '—'}`;
      show('pause');
    } else if (G.state === 'pause') {
      G.state = 'play';
      hideAll();
    }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    el.hud = $('hud'); el.menu = $('menu'); el.shop = $('shop'); el.levelup = $('levelup');
    el.pause = $('pause'); el.gameover = $('gameover'); el.toast = $('toast'); el.chars = $('chars');
    el.hpFill = $('hpFill'); el.hpText = $('hpText'); el.xpFill = $('xpFill'); el.xpText = $('xpText');
    el.timer = $('timer'); el.waveInfo = $('waveInfo'); el.kills = $('kills'); el.money = $('money'); el.gems = $('gems');
    el.weaponsBar = $('weaponsBar'); el.relicBar = $('relicBar');
    el.bossBar = $('bossBar'); el.bossFill = $('bossFill'); el.bossName = $('bossName');
    el.chestPrompt = $('chestPrompt'); el.chestCost = $('chestCost'); el.fusionBanner = $('fusionBanner');
    el.roomBanner = $('roomBanner');
    el.modeList = $('modeList'); el.menuBuild = $('menuBuild'); el.cards = $('cards'); el.lvNum = $('lvNum');
    el.shopGrid = $('shopGrid'); el.shopGems = $('shopGems');
    el.charGrid = $('charGrid'); el.charsGems = $('charsGems');
    el.skinGrid = $('skinGrid'); el.skinsGems = $('skinsGems'); el.skins = $('skins');
    el.worldPanel = $('worldPanel'); el.worldInfo = $('worldInfo'); el.btnPlay = $('btnPlay');
    el.results = $('results'); el.gained = $('gained'); el.overTitle = $('overTitle'); el.overMode = $('overMode');
    el.pauseStats = $('pauseStats');
    el.codexWeapons = $('codexWeapons'); el.codexFusions = $('codexFusions'); el.codexChars = $('codexChars');
    el.codexRelics = $('codexRelics');
    el.codeBox = $('codeBox');
    el.codeInput = $('codeInput');
    el.touchHint = $('touchHint');

    if ('ontouchstart' in window) {
      el.touchHint.classList.remove('hidden');
      setTimeout(() => el.touchHint.classList.add('hidden'), 8000);
    }

    loadSave();
    buildMenu();

    $('btnCode').onclick = () => tryCode(el.codeInput.value);
    el.codeInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.stopPropagation();
      tryCode(el.codeInput.value);
    });
    $('btnPlay').onclick = () => { VS.Audio.resume(); VS.Game.start(chosenMode); };
    $('btnShop').onclick = () => { VS.Audio.resume(); buildShop(); show('shop'); };
    $('btnShopBack').onclick = () => { buildMenu(); show('menu'); };
    $('btnShop2').onclick = () => { buildShop(); show('shop'); };
    $('btnSkins').onclick = () => { buildSkins(); show('skins'); };
    $('btnSkinsBack').onclick = () => { buildMenu(); show('menu'); };
    $('btnChars').onclick = () => { buildChars(); show('chars'); };
    $('btnCharsBack').onclick = () => { buildMenu(); show('menu'); };
    $('btnChars2').onclick = () => { buildChars(); show('chars'); };
    $('btnMenu').onclick = () => { buildMenu(); show('menu'); };
    $('btnPause').onclick = () => togglePause();
    $('btnResume').onclick = () => togglePause();
    $('btnQuit').onclick = () => {
      VS.Game.saveWorld();
      VS.Game.state = 'menu';
      roomBanner(null);
      worldInfoHide();
      buildMenu();
      show('menu');
    };
    $('btnOpenChest').onclick = () => VS.Game.openChest();

    /* atalhos de teclado */
    addEventListener('keydown', (e) => {
      const G = VS.Game;
      if (G.state === 'levelup') {
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
        if (n >= 0) choose(n);
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (G.state === 'play' || G.state === 'pause') togglePause();
      }
      if (e.code === 'KeyE' && G.state === 'play' && G.nearChest) G.openChest();
    });

    /* toque na tela = abre baú (lado direito) */
    $('game').addEventListener('pointerdown', (e) => {
      if (VS.Game.state === 'play' && e.clientX > innerWidth * 0.55 && VS.Game.nearChest) VS.Game.openChest();
    });
  }

  return { init, show, hideAll, toast, banner, roomBanner, syncHud, syncRelics, chestPrompt, openLevelUp, buildShop, buildMenu, buildChars, buildSkins, buildWorldPanel, gameOver, togglePause, resetBar, tryCode, get mode() { return chosenMode; } };
})();

/* ============================================================
   chars.js  —  personagens: destrave, compra, seleção
                 e a lista de armas que cada um libera
   ============================================================ */
window.VS = window.VS || {};

VS.Chars = (function () {
  const D = VS.DATA;

  const meta = () => VS.Game.meta;
  const all = () => D.allCharacters();

  function unlocked(id) { return meta().chars.unlocked.indexOf(id) >= 0; }
  function owned(id) { return meta().chars.owned.indexOf(id) >= 0; }
  function isGod() { return owned('god'); }

  /* personagem que você está usando agora */
  function current() { return D.char(meta().chars.sel); }

  function unlock(id) {
    const m = meta();
    if (unlocked(id)) return false;
    m.chars.unlocked.push(id);
    return true;
  }

  /* conta uma coisa que o jogo fez e reavalia os destravios */
  function note(key, n) {
    const st = meta().stats;
    st[key] = (st[key] || 0) + (n === undefined ? 1 : n);
    return st[key];
  }

  function level() {
    const p = VS.Game.p;
    const lv = p ? p.level : (meta().stats.level || 1);
    if (p && p.level > (meta().stats.level || 1)) meta().stats.level = p.level;
    return lv;
  }

  /* checa todos os personagens e devolve os que acabaram de destravar */
  function sync() {
    const st = meta().stats;
    const lv = level();
    const newly = [];
    for (const c of all()) {
      if (c.codeOnly) continue;                 /* GOD só pelo código 2026 */
      if (unlocked(c.id)) continue;
      if (D.meets(c.req, st, lv)) {
        unlock(c.id);
        /* liberou o personagem: a skin dele entra na loja de skins */
        const sk = D.SKINS[c.id];
        if (sk) unlockSkin(sk.id);
        newly.push(c);
      }
    }
    if (newly.length) {
      VS.Save && VS.Save.write(meta());
      for (const c of newly) {
        VS.UI.toast('🧙 PERSONAGEM LIBERADO: ' + c.icon + ' ' + c.name + ' — compre na tela de personagens!', 3400);
        VS.Audio.SFX.fusion();
      }
      if (VS.UI.buildChars) VS.UI.buildChars();
      if (VS.UI.buildMenu) VS.UI.buildMenu();
    }
    return newly;
  }

  /* compra um personagem destravado */
  function buy(id) {
    const c = D.char(id), m = meta();
    if (!c || c.codeOnly && id !== 'god') return false;
    if (owned(id)) return false;
    if (!unlocked(id)) { VS.UI.toast('Esse personagem ainda não foi liberado'); return false; }
    if (c.cost > 0 && m.gems < c.cost) { VS.UI.toast('Gemas insuficientes'); VS.Audio.SFX.deny(); return false; }
    m.gems -= c.cost;
    m.chars.owned.push(id);
    m.chars.sel = id;
    /* o personagem traz a skin dele de graça */
    if (c.skinId) { unlockSkin(c.skinId); if (!m.skins.owned.includes(c.skinId)) m.skins.owned.push(c.skinId); }
    else if (D.SKINS[id]) { unlockSkin(id); if (m.skins.owned.indexOf(id) < 0) m.skins.owned.push(id); }
    VS.Save && VS.Save.writeNow(m);
    VS.Audio.SFX.buy();
    VS.UI.toast(c.icon + ' ' + c.name + ' comprado e equipado!', 2600);
    if (VS.UI.buildChars) VS.UI.buildChars();
    if (VS.UI.buildMenu) VS.UI.buildMenu();
    return true;
  }

  /* só usar (sem gastar) */
  function select(id) {
    const m = meta();
    if (!owned(id)) return false;
    m.chars.sel = id;
    VS.Save && VS.Save.write(m);
    VS.Audio.SFX.buy();
    VS.UI.toast('👤 Usando ' + D.char(id).icon + ' ' + D.char(id).name, 1800);
    if (VS.UI.buildChars) VS.UI.buildChars();
    if (VS.UI.buildMenu) VS.UI.buildMenu();
    return true;
  }

  /* código 2026: destrava e libera TODOS os personagens e TODAS as skins */
  function unlockAll() {
    const m = meta();
    for (const c of all()) {
      if (!unlocked(c.id)) m.chars.unlocked.push(c.id);
      if (owned(c.id)) continue;
      m.chars.owned.push(c.id);
    }
    if (!unlocked('god')) m.chars.unlocked.push('god');
    if (!owned('god')) m.chars.owned.push('god');
    m.chars.sel = 'god';
    /* TODAS as skins: as de cada personagem E as extras (sangrento, osso,
       gelo, lava, ouro, arco-iris, vazio...) — todas liberadas e compradas */
    for (const sk of D.allSkins()) {
      if (m.skins.unlocked.indexOf(sk.id) < 0) m.skins.unlocked.push(sk.id);
      if (m.skins.owned.indexOf(sk.id) < 0) m.skins.owned.push(sk.id);
    }
    m.skins.sel = 'god';
    VS.Save && VS.Save.writeNow(m);
    if (VS.Game.persist) VS.Game.persist();
    if (VS.UI.buildChars) VS.UI.buildChars();
    if (VS.UI.buildSkins) VS.UI.buildSkins();
    if (VS.UI.buildMenu) VS.UI.buildMenu();
  }

  /* --------------------------------------------------------
     ARMAS DISPONÍVEIS — só as dos personagens que você tem.
     O GOD tem TUDO: as 10 armas e as 9 fusões.
     -------------------------------------------------------- */
  function pool() {
    const out = [], seen = Object.create(null);
    const add = (w) => { if (w && !seen[w.id]) { seen[w.id] = 1; out.push(w); } };

    if (isGod()) {
      for (const w of D.allWeapons()) add(w);
      for (const w of D.allFusions()) add(w);
      return out;
    }

    for (const c of all()) {
      if (!owned(c.id) || !c.weapon) continue;
      add(D.def(c.weapon));            /* def() acha tanto arma quanto fusão */
    }
    return out.length ? out : [D.WEAPONS.espada];
  }

  /* só as armas normais (sem fusão) que o GOD tem */
  function basicPool() {
    return pool().filter(w => !D.isFusion(w.id));
  }

  function hasWeapon(id) {
    for (const w of pool()) if (w.id === id) return true;
    return false;
  }

  /* ============================================================
     SKINS — aaparência do personagem.
     Cada personagem comprado libera a skin dele de graça;
     as extras se compram com gemas na tela de skins.
     ============================================================ */
  function skins() { return meta().skins; }

  function skinUnlocked(id) { return skins().unlocked.indexOf(id) >= 0; }
  function skinOwned(id) { return skins().owned.indexOf(id) >= 0; }
  function skin(id) { return D.skin(id || skins().sel); }
  function unlockSkin(id) {
    const s = skins();
    if (s.unlocked.indexOf(id) >= 0) return false;
    s.unlocked.push(id);
    return true;
  }

  function buySkin(id) {
    const def = D.skin(id), m2 = meta();
    if (skinOwned(id)) return false;
    if (!skinUnlocked(id)) { VS.UI.toast('Essa skin ainda não foi liberada'); return false; }
    if (m2.gems < def.custo) { VS.UI.toast('Gemas insuficientes'); VS.Audio.SFX.deny(); return false; }
    m2.gems -= def.custo;
    m2.skins.owned.push(id);
    m2.skins.sel = id;
    VS.Save && VS.Save.writeNow(m2);
    VS.Audio.SFX.buy();
    VS.UI.toast('🧑‍🎨 Skin ' + def.icon + ' ' + def.name + ' comprada e equipada!', 2600);
    if (VS.Game.refreshSkin) VS.Game.refreshSkin();
    if (VS.UI.buildSkins) VS.UI.buildSkins();
    if (VS.UI.buildMenu) VS.UI.buildMenu();
    return true;
  }

  function selectSkin(id) {
    const m2 = meta();
    if (!skinOwned(id)) return false;
    m2.skins.sel = id;
    VS.Save && VS.Save.write(m2);
    if (VS.Game.persist) VS.Game.persist();
    VS.Audio.SFX.buy();
    if (VS.Game.refreshSkin) VS.Game.refreshSkin();
    VS.UI.toast('🧑‍🎨 Skin: ' + D.skin(id).icon + ' ' + D.skin(id).name, 1800);
    if (VS.UI.buildSkins) VS.UI.buildSkins();
    if (VS.UI.buildMenu) VS.UI.buildMenu();
    return true;
  }

  /* todas as skins que o jogador pode ter (as do personagem + as extras) */
  function skinList() {
    const out = [];
    for (const s of D.allSkins()) out.push(s);
    return out;
  }

  return {
    current, all, unlocked, owned, unlock, unlockAll,
    note, sync, buy, select, pool, basicPool, hasWeapon, isGod,
    skin, skins, skinUnlocked, skinOwned, unlockSkin, buySkin, selectSkin, skinList
  };
})();
/* ============================================================
   save.js  —  guarda gemas e melhorias da loja no navegador
                (sobrevive ao fechar o Chrome; substitui cookies)
   ============================================================ */
window.VS = window.VS || {};

VS.Save = (function () {
  const KEY = 'vs2d_save_v1';

  let timer = null;

  function disponivel() {
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
      return true;
    } catch (e) { return false; }
  }

  function read() {
    if (!disponivel()) return null;
    try {
      const s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  /* grava com um mini atraso para nao chamar o disco toda vez que muda */
  function write(meta) {
    if (!disponivel()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { }
    }, 120);
  }

  /* grava na hora (usado nos codigos do criador) */
  function writeNow(meta) {
    if (!disponivel()) return;
    clearTimeout(timer);
    try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { }
  }

  /* apaga tudo — o equivalente ao codigo "1602" */
  function wipe() {
    if (!disponivel()) return false;
    clearTimeout(timer);
    try {
      localStorage.removeItem(KEY);
      for (const k in localStorage) if (k.indexOf('vs2d') === 0) localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /* junta o save com o meta atual, sem perder campos novos */
  function apply(meta, saved) {
    if (!saved) { if (VS.DATA.fixMeta) VS.DATA.fixMeta(meta); return meta; }
    meta.gems = saved.gems || 0;
    meta.slot = saved.slot || 0;
    meta.nivel = saved.nivel || 0;
    meta.revive = saved.revive || 0;
    meta.ouro = saved.ouro || 0;
    meta.usados = Array.isArray(saved.usados) ? saved.usados : [];
    if (saved.bonus) for (const k in meta.bonus) meta.bonus[k] = saved.bonus[k] || 0;
    /* personagens e estatísticas novas */
    if (saved.chars) {
      meta.chars = {
        unlocked: Array.isArray(saved.chars.unlocked) && saved.chars.unlocked.length ? saved.chars.unlocked : meta.chars.unlocked,
        owned: Array.isArray(saved.chars.owned) && saved.chars.owned.length ? saved.chars.owned : meta.chars.owned,
        sel: saved.chars.sel || meta.chars.sel
      };
    }
    if (saved.stats) {
      meta.stats = Object.assign(meta.stats, saved.stats);
    }
    if (VS.DATA.fixMeta) VS.DATA.fixMeta(meta);
    return meta;
  }

  /* ============================================================
     MUNDO HARDCORE — um save separado, que é o "mundo" do jogo.
     Existe em disco até você morrer (e aí apaga tudo).
     ============================================================ */
  let wTimer = null;

  function worldRead() {
    if (!disponivel()) return null;
    try {
      const s = localStorage.getItem('vs2d_world_v1');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function worldWrite(w) {
    if (!disponivel() || !w) return;
    clearTimeout(wTimer);
    wTimer = setTimeout(() => {
      try { localStorage.setItem('vs2d_world_v1', JSON.stringify(w)); } catch (e) { }
    }, 150);
  }

  function worldWriteNow(w) {
    if (!disponivel() || !w) return;
    clearTimeout(wTimer);
    try { localStorage.setItem('vs2d_world_v1', JSON.stringify(w)); } catch (e) { }
  }

  /* morte / reset manual: o mundo desaparece */
  function worldWipe() {
    if (!disponivel()) return false;
    clearTimeout(wTimer);
    try {
      localStorage.removeItem('vs2d_world_v1');
      return true;
    } catch (e) { return false; }
  }

  return { read, write, writeNow, wipe, apply, disponivel, KEY,
           worldRead, worldWrite, worldWriteNow, worldWipe };
})();

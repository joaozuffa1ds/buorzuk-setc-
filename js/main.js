/* ============================================================
   main.js  —  boot + loop principal
   ============================================================ */
(function () {
  const G = VS.Game, IN = VS.Input;

  function boot() {
    G.resize();
    IN.init();
    VS.UI.init();
    VS.UI.show('menu');
    if (VS.SPR) VS.SPR.load();

    let last = performance.now();
    let acc = 0;

    function loop(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;      /* evita "teleporte" ao voltar pra aba */
      if (dt < 0) dt = 0;

      /* tempo visual roda sempre (fundo do menu) */
      if (G.state === 'menu' || G.state === 'shop') G.time += dt;

      G.update(dt);
      G.draw();
      IN.flush();

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();

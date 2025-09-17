// scripts/new/overlay.js
(() => {
  const MG = (window.MG = window.MG || {});

  MG.updateOverlay = (json, options = {}) => {
    let tip = document.querySelector('.marketguard-tooltip');
    if (!tip) tip = MG.mountOverlayShell?.(options);
    const risk = String(json?.risk || '—').toUpperCase();
    const paused = !!(MG.state?.prefs?.pauseScanning);
    const pctText = paused ? '--' : String(MG.pct?.(json?.score || 0));
    const riskEl = tip?.querySelector('[data-ss-risk]');
    if (riskEl) riskEl.textContent = `MarketGuard Risk: ${risk} (${pctText}%)`;
    if (tip) tip.classList.toggle('marketguard-pulse', risk === 'HIGH' && !paused);
    MG.drawSparklineInto?.(tip?.querySelector('#mg-sparkline'));
    MG.updateHlSummary?.();
  };

  MG.removeOverlayIfAny = () => {
    const tip = document.querySelector('.marketguard-tooltip');
    if (!tip) return;
    if (MG.applyGenieAnimation && typeof MG.applyGenieAnimation === 'function') {
      MG.applyGenieAnimation(tip, true);
      setTimeout(() => { try { tip.remove(); } catch {} }, 450);
    } else {
      tip.classList.add('marketguard-out');
      setTimeout(() => { try { tip.remove(); } catch {} }, 220);
    }
  };
})();



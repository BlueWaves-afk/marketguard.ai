// scripts/05g-overlay-update.js
// Public overlay update + remove helpers

(() => {
  const MG = (window.MG = window.MG || {});

  MG.updateOverlay = (json) => {
    let tip = MG.qs(".marketguard-tooltip");
    if (!tip) tip = MG.mountOverlayShell();

    const prefs = MG.getPrefs?.() || (function () { if (!MG.state) MG.state = {}; return MG.state.prefs || {}; })();
    const paused = !!prefs.pauseScanning;

    const risk = String(json?.risk || "—").toUpperCase();
    const pctText = paused ? "--" : String(MG.pct?.(json?.score || 0));

    const riskEl = MG.qs("[data-ss-risk]", tip);
    if (riskEl) { riskEl.textContent = `MarketGuard Risk: ${risk} (${pctText}%)`; }

    tip.classList.toggle("marketguard-pulse", risk === "HIGH" && !paused);
    MG.drawSparklineInto?.(MG.qs("#mg-sparkline", tip));
    MG.updateHlSummary?.();
  };

  MG.removeOverlayIfAny = () => {
    const tip = MG.qs(".marketguard-tooltip");
    if (tip) {
      tip.classList.add("marketguard-out");
      setTimeout(() => tip.remove(), 220);
    }
  };
})();

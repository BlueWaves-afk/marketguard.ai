// scripts/new/fab.js
(() => {
  const MG = (window.MG = window.MG || {});

  function ensureState() {
    if (!MG.state) MG.state = {};
    return MG.state;
  }

  function resolveAsset(path) {
    try { return chrome?.runtime?.getURL?.(path) || path; } catch { return path; }
  }

  function computeLogoSrc({ score, riskText, pausedExplicit }) {
    const paused = pausedExplicit || String(riskText || "").toUpperCase() === "PAUSED" || !!(MG.state?.prefs?.pauseScanning);
    if (paused) return resolveAsset("assets/logo-paused.png");
    const isHigh = (!isNaN(score) && Number(score) >= (MG.CUTS?.HIGH ?? 0.6)) || String(riskText || '').toUpperCase() === 'HIGH';
    return resolveAsset(isHigh ? "assets/logo-high-risk.png" : "assets/logo.png");
  }

  MG.ensureFab = async function ensureFab() {
    if (!document?.body) return;
    let fab = document.querySelector('.marketguard-fab');
    if (fab) return fab;

    fab = document.createElement('div');
    fab.className = 'marketguard-fab mg-fab-low mg-fab-with-logo';
    fab.setAttribute('role', 'button');
    fab.setAttribute('aria-label', 'Open MarketGuard overlay');

    const st = ensureState();
    const initialScore = st.lastRiskJson?.score;
    const initialRisk = st.lastRiskJson?.risk;
    const paused = !!st?.prefs?.pauseScanning;

    const initialLogoSrc = computeLogoSrc({ score: initialScore, riskText: initialRisk, pausedExplicit: paused });
    fab.innerHTML = `
      <div class="mg-fab-inner">
        <div class="mg-logo"><img alt="MarketGuard" src="${initialLogoSrc}" /></div>
        <div class="mg-text">
          <div class="mg-perc">--%</div>
          <div class="mg-label">MarketGuard</div>
          <div class="mg-badge mg-badge--paused" ${paused ? '' : 'hidden'}>Paused</div>
        </div>
      </div>
    `;
    document.body.appendChild(fab);

    // Guard against drag triggering click-open
    let dragMoved = false; let pointerDownAt = null;
    fab.addEventListener('pointerdown', (e) => {
      pointerDownAt = { x: e.clientX, y: e.clientY, t: Date.now() };
      dragMoved = false;
    });
    fab.addEventListener('pointermove', (e) => {
      if (!pointerDownAt) return;
      const dx = Math.abs(e.clientX - pointerDownAt.x);
      const dy = Math.abs(e.clientY - pointerDownAt.y);
      if (dx > 4 || dy > 4) dragMoved = true;
    });
    fab.addEventListener('pointerup', () => { pointerDownAt = null; });
    try { MG.makeDraggable?.(fab, fab, MG.KEYS.POS_FAB); } catch {}

    fab.addEventListener('click', (e) => {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; }
      const st = ensureState();
      st.forceShowOverlay = true;
      st.overlayClosed = false;
      if (st.lastRiskJson) MG.updateOverlay?.(st.lastRiskJson, { fromFabClick: true });
      else MG.runScan?.();
    });

    MG.refreshFabFromState?.();
    return fab;
  };

  MG.setFabScore = function setFabScore(score, riskText) {
    const fab = document.querySelector('.marketguard-fab');
    if (!fab) return;
    const pct = MG.pct?.(score) ?? 0;
    const per = fab.querySelector('.mg-perc');
    if (per) {
      const txt = isNaN(score) ? '--%' : `${pct}%`;
      per.textContent = txt;
      per.classList.toggle('long-text', txt.length > 4);
    }
    const paused = String(riskText || '').toUpperCase() === 'PAUSED' || !!(MG.state?.prefs?.pauseScanning);
    fab.classList.remove('mg-fab-low', 'mg-fab-med', 'mg-fab-high', 'mg-fab-paused');
    if (paused) fab.classList.add('mg-fab-paused');
    else {
      const v = Number(score) || 0;
      const { LOW, HIGH } = MG.CUTS || { LOW: 0.34, HIGH: 0.6 };
      fab.classList.add(v >= HIGH ? 'mg-fab-high' : v >= LOW ? 'mg-fab-med' : 'mg-fab-low');
    }
    const img = fab.querySelector('.mg-logo img');
    if (img) img.src = computeLogoSrc({ score, riskText, pausedExplicit: paused });
  };
})();




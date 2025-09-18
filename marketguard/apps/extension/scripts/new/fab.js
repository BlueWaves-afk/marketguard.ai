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

  // ---- Check backend health ----
  MG.checkBackendHealth = async function checkBackendHealth() {
    try {
      const resp = await fetch("http://127.0.0.1:8003/healthz", { method: "GET", cache: "no-store" });
      if (!resp.ok) throw new Error("not ok");
      const txt = await resp.text();
      return txt.includes("ok") || txt.includes("healthy");
    } catch {
      return false;
    }
  };

  // ---- Show dark themed popup ----
  MG.showMissingPopup = function showMissingPopup() {
    if (document.querySelector(".mg-missing-popup")) return;

    const div = document.createElement("div");
    div.className = "mg-missing-popup";
    div.innerHTML = `
      <div class="mg-popup-header">Missing Companion App</div>
      <div class="mg-popup-body">
        Please <a href="https://your-download-link" target="_blank">download & install</a> the backend app.
      </div>
      <div class="mg-popup-actions">
        <button class="mg-close-btn">Close</button>
      </div>
    `;
    document.body.appendChild(div);

    // Animate in
    requestAnimationFrame(() => {
      div.style.opacity = "1";
      div.style.transform = "translateY(0)";
    });

    div.querySelector(".mg-close-btn").addEventListener("click", () => {
      div.style.opacity = "0";
      div.style.transform = "translateY(20px)";
      setTimeout(() => div.remove(), 300);
    });
  };

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
          <div class="mg-badge mg-badge--missing" hidden>Missing Companion App</div>
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

    fab.addEventListener('click', async (e) => {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; }
      const ok = await MG.checkBackendHealth();
      const missingBadge = fab.querySelector(".mg-badge--missing");
      if (!ok) {
        MG.showMissingPopup();
        MG.setFabScore(NaN, "PAUSED");
        if (missingBadge) missingBadge.hidden = false;
        return;
      }
      if (missingBadge) missingBadge.hidden = true;
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

  // ---- inject CSS for missing badge + dark popup ----
  const style = document.createElement("style");
  style.textContent = `
    .mg-badge--missing {
      background: linear-gradient(90deg, #00ff9d, #009dff, #ff4dff);
      color: #fff;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 12px;
      margin-top: 2px;
      display: inline-block;
    }

    .mg-missing-popup {
      position: fixed;
      bottom: 80px;
      right: 20px;
      min-width: 280px;
      max-width: 320px;
      background: rgba(20, 20, 20, 0.95);
      backdrop-filter: blur(12px) saturate(180%);
      -webkit-backdrop-filter: blur(12px) saturate(180%);
      border-radius: 18px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #eee;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      z-index: 999999;
    }

    .mg-missing-popup .mg-popup-header {
      font-weight: 600;
      font-size: 15px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(90deg, #00ff9d, #009dff, #ff4dff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .mg-missing-popup .mg-popup-body {
      padding: 12px 16px;
      font-size: 14px;
      line-height: 1.4;
    }

    .mg-missing-popup .mg-popup-body a {
      color: #4da6ff;
      text-decoration: none;
      font-weight: 500;
    }

    .mg-missing-popup .mg-popup-body a:hover {
      text-decoration: underline;
    }

    .mg-missing-popup .mg-popup-actions {
      padding: 12px 16px;
      text-align: right;
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    .mg-missing-popup .mg-close-btn {
      background: #333;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .mg-missing-popup .mg-close-btn:hover {
      background: #555;
    }
  `;
  document.head.appendChild(style);
})();
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

  // -------------------- tiny animation helpers --------------------
  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  // Tween numbers smoothly in the mg-perc element
  function animateNumber(el, from, to, duration = 450) {
    if (!el) return;
    if (prefersReducedMotion()) { el.textContent = isNaN(to) ? "--%" : `${Math.round(to)}%`; return; }
    const start = performance.now();
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    function frame(now) {
      const t = clamp((now - start) / duration, 0, 1);
      const v = Math.round(from + (to - from) * (t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t)); // easeInOutQuad
      el.textContent = isNaN(to) ? "--%" : `${v}%`;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = isNaN(to) ? "--%" : `${Math.round(to)}%`;
    }
    requestAnimationFrame(frame);
    // bump animation
    el.classList.remove("mg-perc-bump");
    // force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("mg-perc-bump");
  }

  // Crossfade logo when the src changes

  function swapLogo(imgEl, nextSrc) {
    if (!imgEl || !nextSrc) return;
    if (imgEl.getAttribute("src") === nextSrc) return;

    const wrapper = imgEl.closest(".mg-logo");
    if (!wrapper) { imgEl.src = nextSrc; imgEl.style.opacity = "1"; return; }

    // Create the new image layer
    const nextImg = imgEl.cloneNode(false);
    nextImg.src = nextSrc;
    nextImg.style.position = "absolute";
    nextImg.style.inset = "0";
    nextImg.style.opacity = "0";

    // Ensure wrapper can stack children
    wrapper.style.position = wrapper.style.position || "relative";
    wrapper.appendChild(nextImg);

    // Old image becomes absolutely positioned for the crossfade
    imgEl.style.position = "absolute";
    imgEl.style.inset = "0";
    imgEl.style.opacity = "1";

    // Reduced motion: instant swap
    if (prefersReducedMotion()) {
      imgEl.remove(); // remove old
      nextImg.style.position = "";
      nextImg.style.inset = "";
      nextImg.style.opacity = "1";
      return;
    }

    // Crossfade using CSS transitions (more widely reliable than WAAPI here)
    // Use small timeouts to ensure styles apply in correct order
    requestAnimationFrame(() => {
      nextImg.style.transition = "opacity 200ms ease";
      imgEl.style.transition = "opacity 180ms ease";

      nextImg.style.opacity = "1";
      imgEl.style.opacity = "0";

      const finalize = () => {
        // Clean up: keep only the new image as the single child
        if (imgEl && imgEl.parentNode) imgEl.remove();
        if (nextImg) {
          nextImg.style.transition = "";
          nextImg.style.position = "";
          nextImg.style.inset = "";
          nextImg.style.opacity = "1";
        }
      };

      // Safety net in case 'transitionend' is skipped
      const killTimer = setTimeout(finalize, 260);

      nextImg.addEventListener("transitionend", () => {
        clearTimeout(killTimer);
        finalize();
      }, { once: true });
    });
  }

  // Pulse the whole FAB briefly when risk band increases
  function pulseFab(fab, kind /* 'up' | 'down' | 'paused' | 'resume' */) {
    if (!fab || prefersReducedMotion()) return;
    const cls = {
      up: "mg-band-up",
      down: "mg-band-down",
      paused: "mg-paused-pop",
      resume: "mg-resume-pop",
    }[kind] || "mg-band-up";

    fab.classList.remove("mg-band-up", "mg-band-down", "mg-paused-pop", "mg-resume-pop");
    void fab.offsetWidth; // restart
    fab.classList.add(cls);
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

    // remember last visuals to detect transitions
    const s = ensureState();
    s._fabPrev = {
      band: "low",
      paused,
      pct: NaN,
      logo: initialLogoSrc,
    };

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

    const s = ensureState();
    const prev = s._fabPrev || { band: "low", paused: false, pct: NaN, logo: "" };
    const pctNum = MG.pct?.(score);
    const pct = isNaN(score) ? NaN : (typeof pctNum === "number" ? pctNum : 0);
    const per = fab.querySelector('.mg-perc');

    // paused?
    const paused = String(riskText || '').toUpperCase() === 'PAUSED' || !!(MG.state?.prefs?.pauseScanning);

    // compute band
    const v = Number(score) || 0;
    const { LOW, HIGH } = MG.CUTS || { LOW: 0.34, HIGH: 0.6 };
    const band = paused ? "paused" : (v >= HIGH ? "high" : (v >= LOW ? "med" : "low"));

    // update percentage with tween + bump
    if (per) {
      const fromPct = isNaN(prev.pct) ? (isNaN(pct) ? NaN : pct) : prev.pct;
      animateNumber(per, isNaN(fromPct) ? (isNaN(pct) ? 0 : pct) : fromPct, pct);
      const txt = isNaN(score) ? '--%' : `${Math.round(pct)}%`;
      per.classList.toggle('long-text', txt.length > 4);
    }

    // band class swap with one-shot pulse
    fab.classList.remove('mg-fab-low', 'mg-fab-med', 'mg-fab-high', 'mg-fab-paused');
    if (band === "paused") {
      fab.classList.add('mg-fab-paused');
      if (!prev.paused) pulseFab(fab, "paused");
    } else {
      fab.classList.add(band === "high" ? 'mg-fab-high' : band === "med" ? 'mg-fab-med' : 'mg-fab-low');
      if (prev.paused && band !== "paused") pulseFab(fab, "resume");
      else if ((prev.band === "low" && (band === "med" || band === "high")) || (prev.band === "med" && band === "high")) {
        pulseFab(fab, "up");
      } else if ((prev.band === "high" && (band === "med" || band === "low")) || (prev.band === "med" && band === "low")) {
        pulseFab(fab, "down");
      }
    }

    // paused badge toggle
    const pausedBadge = fab.querySelector(".mg-badge--paused");
    if (pausedBadge) pausedBadge.hidden = !paused;

    // logo crossfade if needed
    const img = fab.querySelector('.mg-logo img');
    const nextLogo = computeLogoSrc({ score, riskText, pausedExplicit: paused });
    if (img) swapLogo(img, nextLogo);

    // remember
    s._fabPrev = { band, paused, pct, logo: nextLogo };
  };

  // ---- inject CSS for visuals & animations ----
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

    /* Percentage bump */
    @keyframes mg-bump {
      0% { transform: translateZ(0) scale(1); }
      35% { transform: translateZ(0) scale(1.08); }
      100% { transform: translateZ(0) scale(1); }
    }
    .mg-perc-bump { animation: mg-bump 220ms ease-out; will-change: transform; }

    /* Band transition pulses */
    @keyframes mg-band-up-kf {
      0% { box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0); transform: translateZ(0) scale(1); }
      50% { box-shadow: 0 0 0 14px rgba(0, 220, 130, 0.12); transform: translateZ(0) scale(1.02); }
      100% { box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0); transform: translateZ(0) scale(1); }
    }
    @keyframes mg-band-down-kf {
      0% { transform: translateZ(0) scale(1); filter: none; }
      50% { transform: translateZ(0) scale(0.98); filter: saturate(0.9) brightness(0.98); }
      100% { transform: translateZ(0) scale(1); filter: none; }
    }
    .marketguard-fab.mg-band-up { animation: mg-band-up-kf 380ms ease-out; }
    .marketguard-fab.mg-band-down { animation: mg-band-down-kf 300ms ease-out; }

    /* Paused/resume pops */
    @keyframes mg-paused-pop-kf {
      0% { transform: translateZ(0) scale(1); }
      40% { transform: translateZ(0) scale(1.06); }
      100% { transform: translateZ(0) scale(1); }
    }
    @keyframes mg-resume-pop-kf {
      0% { transform: translateZ(0) scale(1); }
      40% { transform: translateZ(0) scale(1.04); }
      100% { transform: translateZ(0) scale(1); }
    }
    .marketguard-fab.mg-paused-pop { animation: mg-paused-pop-kf 260ms ease-out; }
    .marketguard-fab.mg-resume-pop { animation: mg-resume-pop-kf 220ms ease-out; }

    /* High risk subtle continuous pulse */
    @keyframes mg-high-pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.0); }
      50% { box-shadow: 0 0 0 10px rgba(255, 68, 68, 0.12); }
      100% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.0); }
    }
    .marketguard-fab.mg-fab-high { animation: mg-high-pulse 2.2s ease-in-out infinite; }

    /* Paused breathing glow */
    @keyframes mg-paused-breathe {
      0% { box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0); }
      50% { box-shadow: 0 0 0 10px rgba(140, 140, 160, 0.16); }
      100% { box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0); }
    }
    .marketguard-fab.mg-fab-paused { animation: mg-paused-breathe 3s ease-in-out infinite; }

    /* Logo wrapper ensures crossfade absolute clone aligns */
    .mg-logo { position: relative; width: 28px; height: 28px; }
    .mg-logo img { width: 100%; height: 100%; display: block; }

    /* Missing popup (unchanged) */
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
    .mg-missing-popup .mg-popup-body a:hover { text-decoration: underline; }
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
    .mg-missing-popup .mg-close-btn:hover { background: #555; }

    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .marketguard-fab,
      .mg-logo img,
      .mg-perc-bump,
      .mg-badge--missing {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
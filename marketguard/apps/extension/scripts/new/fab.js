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

  // -------------------- enhanced animation helpers --------------------
  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  // Enhanced number animation with smoother easing
  function animateNumber(el, from, to, duration = 500) {
    if (!el) return;
    if (prefersReducedMotion()) { el.textContent = isNaN(to) ? "--%" : `${Math.round(to)}%`; return; }
    
    const start = performance.now();
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    
    // Smooth easing function
    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }
    
    function frame(now) {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = easeOutQuart(t);
      const v = Math.round(from + (to - from) * eased);
      el.textContent = isNaN(to) ? "--%" : `${v}%`;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = isNaN(to) ? "--%" : `${Math.round(to)}%`;
    }
    requestAnimationFrame(frame);
    
    // Enhanced bump animation with scale and color
    el.classList.remove("mg-perc-bump");
    void el.offsetWidth;
    el.classList.add("mg-perc-bump");
  }

  // Enhanced logo crossfade with scale animation
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
    nextImg.style.transform = "scale(0.8)";
    nextImg.style.transition = "all 300ms cubic-bezier(0.16, 1, 0.3, 1)";

    // Ensure wrapper can stack children
    wrapper.style.position = wrapper.style.position || "relative";
    wrapper.appendChild(nextImg);

    // Old image becomes absolutely positioned
    imgEl.style.position = "absolute";
    imgEl.style.inset = "0";
    imgEl.style.opacity = "1";
    imgEl.style.transform = "scale(1)";
    imgEl.style.transition = "all 300ms cubic-bezier(0.16, 1, 0.3, 1)";

    // Reduced motion: instant swap
    if (prefersReducedMotion()) {
      imgEl.remove();
      nextImg.style.position = "";
      nextImg.style.inset = "";
      nextImg.style.opacity = "1";
      nextImg.style.transform = "";
      return;
    }

    // Enhanced crossfade with scale
    requestAnimationFrame(() => {
      nextImg.style.opacity = "1";
      nextImg.style.transform = "scale(1)";
      imgEl.style.opacity = "0";
      imgEl.style.transform = "scale(1.2)";

      const finalize = () => {
        if (imgEl && imgEl.parentNode) imgEl.remove();
        if (nextImg) {
          nextImg.style.transition = "";
          nextImg.style.position = "";
          nextImg.style.inset = "";
          nextImg.style.opacity = "1";
          nextImg.style.transform = "";
        }
      };

      const killTimer = setTimeout(finalize, 350);

      nextImg.addEventListener("transitionend", () => {
        clearTimeout(killTimer);
        finalize();
      }, { once: true });
    });
  }

  // Enhanced FAB pulse with better visual feedback
  function pulseFab(fab, kind /* 'up' | 'down' | 'paused' | 'resume' */) {
    if (!fab || prefersReducedMotion()) return;
    
    const cls = {
      up: "mg-band-up",
      down: "mg-band-down",
      paused: "mg-paused-pop",
      resume: "mg-resume-pop",
    }[kind] || "mg-band-up";

    // Remove all animation classes
    const animClasses = ["mg-band-up", "mg-band-down", "mg-paused-pop", "mg-resume-pop"];
    fab.classList.remove(...animClasses);
    
    // Force reflow and apply new animation
    void fab.offsetWidth;
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

    // Enhanced entrance animation
    requestAnimationFrame(() => {
      div.style.opacity = "1";
      div.style.transform = "translateY(0) scale(1)";
    });

    div.querySelector(".mg-close-btn").addEventListener("click", () => {
      div.style.opacity = "0";
      div.style.transform = "translateY(20px) scale(0.95)";
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
    
    // Add entrance animation
    fab.style.opacity = "0";
    fab.style.transform = "scale(0.8) translateY(20px)";
    document.body.appendChild(fab);
    
    // Animate in
    requestAnimationFrame(() => {
      fab.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
      fab.style.opacity = "1";
      fab.style.transform = "scale(1) translateY(0)";
      
      // Remove transition after entrance
      setTimeout(() => {
        fab.style.transition = "";
      }, 400);
    });

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
      
      // Add press feedback
      fab.style.transform = "scale(0.95)";
    });
    
    fab.addEventListener('pointermove', (e) => {
      if (!pointerDownAt) return;
      const dx = Math.abs(e.clientX - pointerDownAt.x);
      const dy = Math.abs(e.clientY - pointerDownAt.y);
      if (dx > 4 || dy > 4) dragMoved = true;
    });
    
    fab.addEventListener('pointerup', () => {
      // Restore scale on release
      fab.style.transform = "";
      pointerDownAt = null;
    });
    
    fab.addEventListener('pointercancel', () => {
      fab.style.transform = "";
      pointerDownAt = null;
    });
    
    try { MG.makeDraggable?.(fab, fab, MG.KEYS.POS_FAB); } catch {}

    fab.addEventListener('click', async (e) => {
      if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; }
      
      // Add click feedback
      fab.style.transform = "scale(0.92)";
      setTimeout(() => {
        fab.style.transform = "";
      }, 100);
      
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

  // ---- inject CSS for enhanced visuals & animations ----
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
      animation: mg-badge-pulse 2s ease-in-out infinite;
    }

    /* Enhanced percentage bump */
    @keyframes mg-bump {
      0% { 
        transform: scale(1);
        color: inherit;
      }
      35% { 
        transform: scale(1.15);
        color: #fff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }
      100% { 
        transform: scale(1);
        color: inherit;
      }
    }
    .mg-perc-bump { 
      animation: mg-bump 300ms cubic-bezier(0.16, 1, 0.3, 1);
      will-change: transform, color;
    }

    /* Enhanced band transition pulses */
    @keyframes mg-band-up-kf {
      0% { 
        box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0);
        transform: scale(1);
      }
      50% { 
        box-shadow: 0 0 0 16px rgba(0, 220, 130, 0.18);
        transform: scale(1.05);
      }
      100% { 
        box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0);
        transform: scale(1);
      }
    }
    
    @keyframes mg-band-down-kf {
      0% { 
        transform: scale(1);
        filter: none;
      }
      50% { 
        transform: scale(0.96);
        filter: saturate(0.85) brightness(0.95);
      }
      100% { 
        transform: scale(1);
        filter: none;
      }
    }
    
    .marketguard-fab.mg-band-up { 
      animation: mg-band-up-kf 450ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .marketguard-fab.mg-band-down { 
      animation: mg-band-down-kf 380ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Enhanced paused/resume pops */
    @keyframes mg-paused-pop-kf {
      0% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0);
      }
      40% { 
        transform: scale(1.08);
        box-shadow: 0 0 0 12px rgba(140, 140, 160, 0.2);
      }
      100% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0);
      }
    }
    
    @keyframes mg-resume-pop-kf {
      0% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0);
      }
      40% { 
        transform: scale(1.06);
        box-shadow: 0 0 0 10px rgba(0, 220, 130, 0.15);
      }
      100% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(0, 220, 130, 0.0);
      }
    }
    
    .marketguard-fab.mg-paused-pop { 
      animation: mg-paused-pop-kf 320ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .marketguard-fab.mg-resume-pop { 
      animation: mg-resume-pop-kf 280ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Enhanced high risk pulse */
    @keyframes mg-high-pulse {
      0% { 
        box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.0);
        transform: scale(1);
      }
      50% { 
        box-shadow: 0 0 0 14px rgba(255, 68, 68, 0.18);
        transform: scale(1.02);
      }
      100% { 
        box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.0);
        transform: scale(1);
      }
    }
    
    .marketguard-fab.mg-fab-high { 
      animation: mg-high-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    /* Enhanced paused breathing glow */
    @keyframes mg-paused-breathe {
      0% { 
        box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0);
        transform: scale(1);
      }
      50% { 
        box-shadow: 0 0 0 14px rgba(140, 140, 160, 0.2);
        transform: scale(1.01);
      }
      100% { 
        box-shadow: 0 0 0 0 rgba(140, 140, 160, 0.0);
        transform: scale(1);
      }
    }
    
    .marketguard-fab.mg-fab-paused { 
      animation: mg-paused-breathe 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    /* Badge pulse animation */
    @keyframes mg-badge-pulse {
      0%, 100% { 
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(0, 255, 157, 0);
      }
      50% { 
        transform: scale(1.05);
        box-shadow: 0 0 8px 2px rgba(0, 255, 157, 0.3);
      }
    }

    /* Logo wrapper ensures crossfade absolute clone aligns */
    .mg-logo { 
      position: relative; 
      width: 28px; 
      height: 28px; 
      will-change: transform;
    }
    
    .mg-logo img { 
      width: 100%; 
      height: 100%; 
      display: block; 
      will-change: transform, opacity;
    }

    /* Missing popup enhancements */
    .mg-missing-popup {
      position: fixed;
      bottom: 80px;
      right: 20px;
      min-width: 280px;
      max-width: 320px;
      background: rgba(20, 20, 20, 0.98);
      backdrop-filter: blur(16px) saturate(200%);
      -webkit-backdrop-filter: blur(16px) saturate(200%);
      border-radius: 20px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.7);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #eee;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 999999;
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    .mg-missing-popup .mg-popup-header {
      font-weight: 600;
      font-size: 16px;
      padding: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(90deg, #00ff9d, #009dff, #ff4dff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .mg-missing-popup .mg-popup-body {
      padding: 16px;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .mg-missing-popup .mg-popup-body a {
      color: #4da6ff;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s ease;
    }
    
    .mg-missing-popup .mg-popup-body a:hover { 
      color: #80c1ff;
      text-decoration: underline;
    }
    
    .mg-missing-popup .mg-popup-actions {
      padding: 16px;
      text-align: right;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    
    .mg-missing-popup .mg-close-btn {
      background: linear-gradient(45deg, #333, #555);
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 500;
      padding: 8px 18px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    
    .mg-missing-popup .mg-close-btn:hover { 
      background: linear-gradient(45deg, #444, #666);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }

    /* Enhanced FAB base styles */
    .marketguard-fab {
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                 box-shadow 0.2s ease;
      will-change: transform, box-shadow;
    }

    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .marketguard-fab,
      .mg-logo img,
      .mg-perc-bump,
      .mg-badge--missing,
      .mg-missing-popup {
        animation: none !important;
        transition: opacity 0.3s ease !important;
        transform: none !important;
      }
      
      .marketguard-fab:active {
        transform: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
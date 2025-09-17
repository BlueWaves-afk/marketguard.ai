// scripts/new/constants.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---- Feature toggles
  MG.FEATURES = {
    MEDIA_SCAN_ENABLED: true,
  };

  // ---- API endpoints
  MG.API = {
    NLP: "http://localhost:8002/api/nlp/v1/score",
    NLP_BATCH: "http://localhost:8002/api/nlp/v1/batch-score",
    NLP_GENERATIVE_EXPLANATION: "http://localhost:8002/api/nlp/v1/generative-explanation",
    CHECK_UPI: "http://localhost:8001/api/check/v1/upi-verify",
    SEBI_REGISTRY: "http://localhost:8001/api/registry/v1/verify",
    DEEPFAKE_IMAGE_DATAURL: "http://localhost:8003/api/detect/image-dataurl",
    DEEPFAKE_VIDEO_DATAURL: "http://localhost:8003/api/detect/video-dataurl",
    MEDIA_BATCH: "http://localhost:8003/api/detect/batch-media"
  };

  // ---- Storage keys
  MG.KEYS = {
    PREFS: "marketGuardPrefs",
    POS_FAB: "marketGuardFabPos",
    POS_OVERLAY: "marketGuardOverlayPos",
    ONBOARD: "marketGuardOnboard",
    HIST: "marketGuardSiteHistory",
  };

  // ---- Defaults (60% threshold)
  MG.DEFAULT_PREFS = {
    threshold: 0.6,
    theme: "dark",
    defaultMode: "compact",
    pauseScanning: false,
    animation: "genie",
  };

  MG.CUTS = { LOW: 0.34, HIGH: 0.6 };
  MG.UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;
  MG.pct = (x) => Math.round((Number(x) || 0) * 100);

  // ---- Micro-animations (slide open/close)
  MG.slideOpen = function slideOpen(panelEl, durationMs = 300) {
    try {
      if (!panelEl) return;
      const prefersReduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (prefersReduced) { panelEl.hidden = false; return; }

      // Prepare
      panelEl.setAttribute('data-animating', '1');
      panelEl.hidden = false;
      panelEl.style.willChange = 'height, opacity, transform';
      panelEl.style.overflow = 'hidden';
      panelEl.style.opacity = '0';
      panelEl.style.transform = 'translateY(-6px)';
      panelEl.style.height = '0px';
      const target = Math.max(1, panelEl.scrollHeight);

      // Animate
      panelEl.style.transition = `height ${durationMs}ms cubic-bezier(.2,.8,.2,1), opacity ${Math.max(180, durationMs - 60)}ms ease, transform ${Math.max(180, durationMs - 60)}ms ease`;
      requestAnimationFrame(() => {
        panelEl.style.height = `${target}px`;
        panelEl.style.opacity = '1';
        panelEl.style.transform = 'translateY(0)';
      });

      const onEnd = () => {
        panelEl.removeEventListener('transitionend', onEnd);
        // Cleanup inline styles keeping it in natural layout height
        panelEl.style.transition = '';
        panelEl.style.height = '';
        panelEl.style.opacity = '';
        panelEl.style.transform = '';
        panelEl.style.overflow = '';
        panelEl.style.willChange = '';
        panelEl.removeAttribute('data-animating');
      };
      panelEl.addEventListener('transitionend', onEnd);
    } catch {}
  };

  MG.slideClose = function slideClose(panelEl, durationMs = 260) {
    try {
      if (!panelEl) return;
      const prefersReduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (prefersReduced) { panelEl.hidden = true; return; }

      const current = panelEl.scrollHeight;
      panelEl.setAttribute('data-animating', '1');
      panelEl.style.willChange = 'height, opacity, transform';
      panelEl.style.overflow = 'hidden';
      panelEl.style.height = `${current}px`;
      panelEl.style.opacity = '1';
      panelEl.style.transform = 'translateY(0)';
      // Force reflow to lock the start height
      void panelEl.offsetHeight;
      panelEl.style.transition = `height ${durationMs}ms cubic-bezier(.2,.8,.2,1), opacity ${Math.max(180, durationMs - 60)}ms ease, transform ${Math.max(180, durationMs - 60)}ms ease`;
      requestAnimationFrame(() => {
        panelEl.style.height = '0px';
        panelEl.style.opacity = '0';
        panelEl.style.transform = 'translateY(-6px)';
      });

      const onEnd = () => {
        panelEl.removeEventListener('transitionend', onEnd);
        panelEl.hidden = true;
        panelEl.style.transition = '';
        panelEl.style.height = '';
        panelEl.style.opacity = '';
        panelEl.style.transform = '';
        panelEl.style.overflow = '';
        panelEl.style.willChange = '';
        panelEl.removeAttribute('data-animating');
      };
      panelEl.addEventListener('transitionend', onEnd);
    } catch {}
  };

  // ---- Overlay genie animation (open/close)
  MG.applyGenieAnimation = function applyGenieAnimation(overlayEl, isClosing) {
    try {
      if (!overlayEl) return;
      const animPref = (MG.state?.prefs?.animation) || 'genie';
      if (animPref !== 'genie') {
        // No animation: snap state
        if (isClosing) {
          overlayEl.classList.remove('marketguard-in', 'mg-genie-in', 'mg-genie-out');
          // return a duration of 0ms to signal immediate removal by caller
          return 0;
        } else {
          overlayEl.classList.remove('mg-genie-in', 'mg-genie-out');
          overlayEl.classList.add('marketguard-in');
          return 0;
        }
      }
      // Compute vector from overlay to FAB center for nicer directionality
      const fab = document.querySelector('.marketguard-fab');
      const tip = overlayEl;
      let dx = 0, dy = 0;
      if (fab && tip && typeof tip.getBoundingClientRect === 'function') {
        const fr = fab.getBoundingClientRect();
        const tr = tip.getBoundingClientRect();
        const fabCx = fr.left + fr.width / 2;
        const fabCy = fr.top + fr.height / 2;
        const tipRight = tr.left + tr.width;
        const tipBottom = tr.top + tr.height;
        dx = Math.round(fabCx - tipRight);
        dy = Math.round(fabCy - tipBottom);
      }
      tip.style.setProperty('--mg-genie-start-x', dx + 'px');
      tip.style.setProperty('--mg-genie-start-y', dy + 'px');
      tip.classList.remove('mg-genie-in', 'mg-genie-out', 'marketguard-in');
      const cls = isClosing ? 'mg-genie-out' : 'mg-genie-in';
      tip.classList.add(cls);
      // Ensure events pass through only when visible
      if (!isClosing) {
        tip.style.pointerEvents = 'auto';
      }
      return isClosing ? 400 : 600;
    } catch {}
  };
})();




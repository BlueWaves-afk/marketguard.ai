// scripts/new/overlay-shell.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---------------------------------------------------------------------------
  // macOS-style "Genie" animation (open/close) + minimal CSS injector
  // ---------------------------------------------------------------------------

  // one-time CSS injection for animation+glass polish
  function injectGenieCSS() {
    if (document.getElementById("mg-genie-style")) return;
    const css = `
      .mg-genie-animating {
        will-change: transform, opacity, filter, clip-path;
        backface-visibility: hidden;
        contain: layout style paint;
      }
      .mg-glassy {
        backdrop-filter: saturate(1.2) blur(10px);
      }
    `;
    const s = document.createElement("style");
    s.id = "mg-genie-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  // FAB / dock anchor point (prefers your floating FAB)
  function getDockPoint() {
    const br = document.documentElement.getBoundingClientRect();
    const fab =
      (MG.qs && (MG.qs(".marketguard-fab") || MG.qs("[data-mg-fab]"))) || null;
    if (fab) {
      const r = fab.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const margin = 18;
    return { x: br.right - margin, y: br.bottom - margin };
  }

  // feature checks + helpers
  const EASE_OPEN = "cubic-bezier(0.16, 1, 0.3, 1)";
  const EASE_CLOSE = "cubic-bezier(0.4, 0, 1, 1)";

  function supportsClipPathAnim() {
    const el = document.createElement("div");
    try {
      el.style.clipPath = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
      return el.style.clipPath.includes("polygon");
    } catch {
      return false;
    }
  }
  function pinchPolygon(t) {
    const pinch = Math.min(42, 8 + t * 42); // %
    const inset = Math.min(6 + t * 8, 14); // %
    return `polygon(
      ${inset}% 0%,
      ${100 - inset}% 0%,
      ${100 - inset}% ${inset}%,
      ${100 - pinch}% 50%,
      ${100 - inset}% ${100 - inset}%,
      ${100 - inset}% 100%,
      ${inset}% 100%,
      ${inset}% ${100 - inset}%,
      ${pinch}% 50%,
      ${inset}% ${inset}%
    )`;
  }
  function prefersReduced() {
    try {
      return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
  }

  // Public: MG.applyGenieAnimation(el, isClosing)
  MG.applyGenieAnimation = function applyGenieAnimation(el, isClosing = false) {
    if (!el || !(el instanceof Element)) return;

    // Respect settings: disable animation when prefs.animation === 'none'
    try {
      if (MG?.state?.prefs?.animation === 'none') {
        el.classList.remove('mg-genie-animating');
        el.style.transformOrigin = '';
        el.style.clipPath = 'none';
        el.style.filter = 'none';
        el.style.transform = 'none';
        if (!isClosing) el.classList.add('marketguard-in');
        return;
      }
    } catch {}

    injectGenieCSS();
    const rect = el.getBoundingClientRect();
    const dock = getDockPoint();

    const originX = `${dock.x - rect.left}px`;
    const originY = `${dock.y - rect.top}px`;
    el.style.transformOrigin = `${originX} ${originY}`;

    if (!el.classList.contains("mg-glassy")) el.classList.add("mg-glassy");
    el.classList.add("mg-genie-animating");

    const reduce = prefersReduced();
    const DUR_OPEN = 420;
    const DUR_CLOSE = 380;
    const useClip = supportsClipPathAnim();

    const startScale = "scale(0.06, 0.18)";
    const endScale = "scale(1, 1)";
    const startFilter = "blur(2px) saturate(0.92)";
    const endFilter = "none";

    if (reduce) {
      const keyframes = isClosing
        ? [
            { opacity: 1, transform: endScale },
            { opacity: 0, transform: "scale(0.92)" },
          ]
        : [
            { opacity: 0, transform: "scale(0.92)" },
            { opacity: 1, transform: endScale },
          ];
      const anim = el.animate(keyframes, {
        duration: isClosing ? 180 : 200,
        easing: "linear",
        fill: "both",
      });
      anim.onfinish = () => el.classList.remove("mg-genie-animating");
      return;
    }

    const finalize = (wasClosing) => {
      try {
        // Minimal cleanup; final frame already matches the steady-state
        el.style.transformOrigin = '';
        el.classList.remove('mg-genie-animating');
        if (!wasClosing) el.classList.add('marketguard-in');
      } catch {}
    };

    if (useClip) {
      const frames = [];
      const steps = 24;
      const lerp = (a, b, u) => a + (b - a) * u;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const scaleX = isClosing ? lerp(1, 0.06, t) : lerp(0.06, 1, t);
        const scaleY = isClosing ? lerp(1, 0.18, t) : lerp(0.18, 1, t);
        const blurAmt = isClosing ? lerp(0, 2, t) : lerp(2, 0, t);
        const pinchT = isClosing ? t : 1 - t;

        // For the final frame on open, ensure we fully resolve to unclipped, untransformed state
        if (!isClosing && i === steps) {
          frames.push({
            opacity: 1,
            filter: 'none',
            clipPath: 'none',
            transform: 'none',
          });
        } else if (isClosing && i === steps) {
          frames.push({
            opacity: 0.88, // near the last value
            filter: `blur(${blurAmt}px)`,
            clipPath: pinchPolygon(pinchT),
            transform: `perspective(900px) translateZ(0px) scale(${scaleX}, ${scaleY})`,
          });
        } else {
          frames.push({
            opacity: isClosing ? 1 - t * 0.08 : 0.92 + t * 0.08,
            filter: `blur(${blurAmt}px)`,
            clipPath: pinchPolygon(pinchT),
            transform: `perspective(900px) translateZ(0px) scale(${scaleX}, ${scaleY})`,
          });
        }
      }

      const anim = el.animate(frames, {
        duration: isClosing ? DUR_CLOSE : DUR_OPEN,
        easing: isClosing ? EASE_CLOSE : EASE_OPEN,
        fill: "both",
      });
      anim.onfinish = () => finalize(isClosing);
      anim.oncancel = () => finalize(isClosing);
    } else {
      const keyframes = isClosing
        ? [
            { opacity: 1, filter: endFilter, transform: 'none' },
            { opacity: 0.94, filter: 'blur(0.6px)', transform: 'perspective(900px) scale(0.82, 0.86) skewY(-1deg)' },
            { opacity: 0.88, filter: startFilter, transform: `perspective(900px) ${startScale}` },
          ]
        : [
            { opacity: 0.88, filter: startFilter, transform: `perspective(900px) ${startScale}` },
            { opacity: 0.94, filter: 'blur(0.6px)', transform: 'perspective(900px) scale(0.82, 0.86) skewY(-1deg)' },
            { opacity: 1, filter: endFilter, transform: 'none' },
          ];

      const anim = el.animate(keyframes, {
        duration: isClosing ? DUR_CLOSE : DUR_OPEN,
        easing: isClosing ? EASE_CLOSE : EASE_OPEN,
        fill: "both",
      });
      anim.onfinish = () => finalize(isClosing);
      anim.oncancel = () => finalize(isClosing);
    }
  };

  // ---------------------------------------------------------------------------
  // Overlay shell (unchanged API, upgraded to use the genie animation)
  // ---------------------------------------------------------------------------
  MG.mountOverlayShell = (options = {}) => {
    let tip = MG.qs?.(".marketguard-tooltip");
    if (tip) return tip;

    const isFromFabClick =
      options.fromFabClick || MG.state?.forceShowOverlay === true;

    tip = document.createElement("div");
    tip.className = "marketguard-tooltip";
    tip.style.position = "fixed";

    try {
      chrome?.storage?.local?.get?.(MG.KEYS.POS_OVERLAY, (res) => {
        const pos = res?.[MG.KEYS.POS_OVERLAY];
        if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
          tip.style.left = pos.left + "px";
          tip.style.top = pos.top + "px";
          tip.style.right = "auto";
          tip.style.bottom = "auto";
        }
      });
    } catch {}

    const header = document.createElement("div");
    header.className = "ss-header";

    function getLogoUrlLocal() {
      if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length)
        return MG.LOGO_URL;
      try {
        return chrome?.runtime?.getURL?.("assets/logo.png") || "";
      } catch {
        return "";
      }
    }

    const avatar = document.createElement("div");
    avatar.className = "ss-avatar ss-avatar--logo";
    const logoUrl = getLogoUrlLocal();
    avatar.innerHTML = logoUrl
      ? `<img class="ss-avatar-img" src="${logoUrl}" alt="${
          MG.BRAND_NAME || "MarketGuard"
        } logo" decoding="async" loading="eager" />`
      : `<div class="ss-avatar-fallback" aria-hidden="true"></div>`;
    header.appendChild(avatar);

    const title = document.createElement("h3");
    title.className = "ss-title";
    title.textContent = "MarketGuard Advisor Check";
    header.appendChild(title);

    const gear = document.createElement("div");
    gear.className = "ss-gear";
    gear.title = "Settings";
    gear.textContent = "⚙";
    gear.setAttribute("aria-expanded", "false");
    header.appendChild(gear);

    let cleanupFns = [];
    const close = document.createElement("div");
    close.className = "ss-close";
    close.title = "Close";
    close.textContent = "×";
    close.onclick = () => {
      if (!MG.state) MG.state = {};
      MG.state.overlayClosed = true;
      const animPref = MG?.state?.prefs?.animation;
      if (animPref === 'none') {
        try { cleanupFns.forEach((fn) => fn?.()); } catch {}
        try { tip.remove(); } catch {}
        return;
      }
      MG.applyGenieAnimation?.(tip, true);
      try { cleanupFns.forEach((fn) => fn?.()); } catch {}
      const finishMs = 420;
      setTimeout(() => { try { tip.remove(); } catch {} }, finishMs);
    };
    header.appendChild(close);
    tip.appendChild(header);

    const body = document.createElement("div");
    body.className = "ss-body";
    body.innerHTML = `
      <p class="ss-risk" data-ss-risk></p>
      <p class="ss-sub">Suspicious language flagged on this page.</p>
      <div class="ss-row">
        <span class="ss-chip" data-chip-threshold>Auto threshold: 60%</span>
        <span class="ss-chip" data-chip-mode>Mode: compact</span>
      </div>
      <div class="mg-card">
        <div style="font-weight:700; margin-bottom:6px;">Site Risk Trend (last 20)</div>
        <canvas id="mg-sparkline" height="24"></canvas>
      </div>`;
    tip.appendChild(body);

    // Actions
    const actions = document.createElement("div");
    actions.className = "ss-actions";
    actions.innerHTML = `
      <div class="ss-left-actions">
        <button class="ss-nav-btn" data-mg-prev>◀ Prev</button>
        <button class="ss-nav-btn" data-mg-next>Next ▶</button>
        <button class="ss-nav-btn" data-mg-explain>Explain</button>
        <span data-mg-hl-summary>No risky elements</span>
      </div>
      <div class="ss-right-actions">
        <button class="ss-btn ss-btn--danger" data-mg-report>Report to SEBI (SCORES)</button>
        <button class="ss-btn" data-mg-verify>Verify Advisor (select text)</button>
      </div>`;
    body.appendChild(actions);

    const btnPrev = actions.querySelector("[data-mg-prev]");
    const btnNext = actions.querySelector("[data-mg-next]");
    const btnExplain = actions.querySelector("[data-mg-explain]");
    const btnReport = actions.querySelector("[data-mg-report]");
    const btnVerify = actions.querySelector("[data-mg-verify]");
    btnPrev?.addEventListener("click", () => MG.goToHighlight?.(-1));
    btnNext?.addEventListener("click", () => MG.goToHighlight?.(+1));
    btnExplain?.addEventListener("click", () => MG.explainCurrentHighlight?.());
    btnReport?.addEventListener("click", () => {
      const url = "https://scores.sebi.gov.in/";
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        location.href = url;
      }
    });
    btnVerify?.addEventListener("click", async () => {
      const text = String(window.getSelection?.()?.toString() || "").trim();
      if (!text) {
        alert(
          "Select advisor name or SEBI regn no./PAN/UPI on the page, then click Verify."
        );
        return;
      }
      const cls = MG.classifyQuery?.(text);
      if (!cls) {
        alert("Could not classify your selection.");
        return;
      }
      const params = {};
      params[cls.kind] = cls.value;
      if (cls.kind === "name") params.fuzzy = 1;
      try {
        btnVerify.disabled = true;
        btnVerify.textContent = "Verifying...";
        const json = await MG.registryVerify?.(params);
        btnVerify.textContent = MG.summarizeMatches?.(json) || "Done";
      } catch {
        btnVerify.textContent = "Error";
      } finally {
        setTimeout(() => {
          btnVerify.textContent = "Verify Advisor (select text)";
          btnVerify.disabled = false;
        }, 1600);
      }
    });

    // Media card (optional)
    if (MG.FEATURES?.MEDIA_SCAN_ENABLED) {
      const mediaCard = document.createElement("div");
      mediaCard.className = "mg-card mg-media-card";
      mediaCard.innerHTML = `
        <div class="mg-media-header">
          <div><span style="font-weight:700;">Media Risk</span> <span class="mg-media-summary" data-media-summary>– not scanned –</span></div>
          <div class="mg-media-actions">
            <button class="ss-btn mg-media-btn" data-media-scan>Scan Media</button>
            <button class="ss-btn" data-media-open hidden>View Results</button>
          </div>
        </div>
        <div class="mg-media-progress" data-media-progress hidden>
          <div class="mg-media-bar"><span data-media-bar></span></div>
          <div class="mg-media-status" data-media-status>Idle</div>
        </div>`;
      body.appendChild(mediaCard);

      let btnScan = mediaCard.querySelector("[data-media-scan]");
      let btnOpen = mediaCard.querySelector("[data-media-open]");
      let progWrap = mediaCard.querySelector("[data-media-progress]");
      let progBar = mediaCard.querySelector("[data-media-bar]");
      let progText = mediaCard.querySelector("[data-media-status]");
      let summaryEl = mediaCard.querySelector("[data-media-summary]");
      let mediaItems = [];

      const setProgress = (done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        progBar.style.width = pct + "%";
        progText.textContent = `Scanning media... ${done} / ${total}`;
      };
      const setSummary = (counts) => {
        const s = ` ${counts.HIGH || 0} High • ${counts.MEDIUM || 0} Medium • ${
          counts.SAFE || 0
        } Safe`;
        summaryEl.textContent = s;
      };
      const detectDataUrlSafe = async (dataUrl) => {
        try {
          return await MG.detectDataUrl?.(dataUrl);
        } catch {
          return null;
        }
      };

      async function startScan() {
        const mediaEls = MG.enumerateMedia?.() || [];
        if (!mediaEls.length) {
          btnOpen.hidden = false;
          alert("No media found in view.");
          return;
        }
        mediaItems = [];
        btnScan.disabled = true;
        btnScan.textContent = "Scanning…";
        tip.classList.add("mg-scan-active");
        progWrap.hidden = false;
        setProgress(0, mediaEls.length);

        const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, SAFE: 0, UNKNOWN: 0 };
        let shotCache = null;

        for (let i = 0; i < mediaEls.length; i++) {
          const el = mediaEls[i];
          let dataUrl = await MG.captureElement?.(el);
          if (!dataUrl) {
            if (!shotCache) shotCache = await MG.captureViewport?.();
            if (shotCache) dataUrl = await MG.cropFromScreenshot?.(shotCache, el);
          }
          const result = dataUrl ? await detectDataUrlSafe(dataUrl) : null;
          const level = String(result?.risk?.level || "UNKNOWN").toUpperCase();
          counts[level] = (counts[level] || 0) + 1;
          mediaItems.push({
            dataUrl: dataUrl || null,
            level,
            score: result?.risk?.score || null,
            element: el,
          });
          setProgress(i + 1, mediaEls.length);
        }

        setSummary(counts);
        btnScan.textContent = "Scan Media";
        btnScan.disabled = false;
        tip.classList.remove("mg-scan-active");
        progText.textContent = "Done";
        if (btnOpen) {
          btnOpen.hidden = false;
          btnOpen.disabled = false;
          btnOpen.style.display = "";
          btnOpen.removeAttribute("hidden");
        }
      }

      btnScan?.addEventListener("click", () => {
        startScan();
      });
      btnOpen?.addEventListener("click", (e) => {
        e.preventDefault();
        if (btnOpen?.disabled) return;
        try {
          const validMediaItems = Array.isArray(mediaItems) ? mediaItems : [];
          MG.openMediaPopup?.({ mediaItems: validMediaItems, summary: {} });
        } catch {
          alert("Unable to open media results. Please try scanning again.");
        }
      });

      cleanupFns.push(() => {
        try {
          mediaItems = [];
        } catch {}
      });
    }

    document.body.appendChild(tip);
    try {
      MG.makeDraggable?.(tip, header, MG.KEYS.POS_OVERLAY);
    } catch {}

    const settingsEl = document.createElement("div");
    settingsEl.className = "mg-settings";
    settingsEl.hidden = true;
    settingsEl.innerHTML = `<div class="mg-settings__inner"></div>`;
    body.appendChild(settingsEl);
    const settingsInner = settingsEl.querySelector(".mg-settings__inner");

    const prefersReducedLocal = !!window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    const toggleSettings = () => {
      const isOpening = settingsEl.hidden;
      if (prefersReducedLocal) {
        settingsEl.hidden = !isOpening ? true : false;
        gear.setAttribute("aria-expanded", String(isOpening));
        return;
      }
      if (isOpening) MG.slideOpen?.(settingsEl, 320);
      else MG.slideClose?.(settingsEl, 280);
      gear.setAttribute("aria-expanded", String(isOpening));
    };
    gear.onclick = toggleSettings;
    MG.buildSettingsPanel?.(settingsInner);

    requestAnimationFrame(() => {
      if (isFromFabClick) {
        if (typeof MG.applyGenieAnimation === "function") {
          MG.applyGenieAnimation(tip, false);
        } else {
          tip.classList.add("marketguard-in");
        }
      } else {
        tip.classList.add("marketguard-in");
      }
      MG.applyPrefsToOverlay?.(tip);
      MG.updateHlSummary?.();
    });

    const hasRisky = (MG.findHighlights?.() || []).length > 0;
    if (hasRisky) {
      if (!MG.state) MG.state = {};
      MG.state.hlIndex = -1;
      setTimeout(() => MG.goToHighlight?.(+1), 300);
    }

    try {
      MG.scanAndBadgeUPIs?.(document.body);
    } catch {}
    try {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === "childList" && (m.addedNodes?.length || 0) > 0)
            MG.scanAndBadgeUPIs?.(m.target || document.body);
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      cleanupFns.push(() => mo.disconnect());
    } catch {}

    return tip;
  };
})();
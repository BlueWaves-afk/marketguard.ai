// scripts/05f-overlay-shell.js
// The overlay UI shell + wiring (verify/explain/nav/media drawer/UPI observer)

(() => {
  const MG = (window.MG = window.MG || {});

  MG.mountOverlayShell = () => {
    let tip = MG.qs(".marketguard-tooltip");
    if (tip) return tip;

    tip = document.createElement("div");
    tip.className = "marketguard-tooltip";
    tip.style.position = "fixed";

    // restore saved position (best-effort)
    try {
      chrome?.storage?.local?.get?.(MG.KEYS.POS_OVERLAY, (res) => {
        const pos = res?.[MG.KEYS.POS_OVERLAY];
        if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
          tip.style.left = pos.left + "px";
          tip.style.top  = pos.top  + "px";
          tip.style.right = "auto";
          tip.style.bottom = "auto";
        }
      });
    } catch {}

    // Header
    const header = document.createElement("div");
    header.className = "ss-header";

    function getLogoUrlLocal() {
      if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length) return MG.LOGO_URL;
      try { return chrome?.runtime?.getURL?.("assets/logo.png") || ""; } catch { return ""; }
    }

    const avatar = document.createElement("div");
    avatar.className = "ss-avatar ss-avatar--logo";
    const logoUrl = getLogoUrlLocal();
    avatar.innerHTML = logoUrl
      ? `<img class="ss-avatar-img" src="${logoUrl}" alt="${MG.BRAND_NAME || "MarketGuard"} logo" decoding="async" loading="eager" />`
      : `<div class="ss-avatar-fallback" aria-hidden="true"></div>`;
    header.appendChild(avatar);

    const title = document.createElement("h3");
    title.className = "ss-title";
    title.textContent = "MarketGuard Advisor Check";
    header.appendChild(title);

    const gear = document.createElement("div");
    gear.className = "ss-gear"; gear.title = "Settings"; gear.textContent = "⚙"; gear.setAttribute("aria-expanded", "false");
    header.appendChild(gear);

    // We'll fill this in after we define cleanup().
    let cleanupFns = [];
    const close = document.createElement("div");
    close.className = "ss-close"; close.title = "Close"; close.textContent = "×";
    close.onclick = () => {
      tip.classList.add("marketguard-out");
      if (!MG.state) MG.state = {};
      MG.state.overlayClosed = true;
      // run cleanup, then remove tip
      try { cleanupFns.forEach(fn => fn?.()); } catch {}
      setTimeout(() => tip.remove(), 220);
    };
    header.appendChild(close);

    tip.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "ss-body";
    body.innerHTML = `
      <p class="ss-risk" data-ss-risk></p>
      <p class="ss-sub">Suspicious language flagged on this page.</p>

      <div class="ss-row">
        <span class="ss-chip" data-chip-threshold>Auto threshold: 50%</span>
        <span class="ss-chip" data-chip-mode>Mode: compact</span>
      </div>

      <div class="mg-card">
        <div style="font-weight:700; margin-bottom:6px;">Site Risk Trend (last 20)</div>
        <canvas id="mg-sparkline" height="24"></canvas>
      </div>
    `;
    tip.appendChild(body);

    // Media UI
    let mediaDrawer, btnScan, btnOpen, btnCloseD, progWrap, progBar, progText, summaryEl, listEl;
    if (MG.FEATURES?.MEDIA_SCAN_ENABLED) {
      const mediaCard = document.createElement("div");
      mediaCard.className = "mg-card mg-media-card";
      mediaCard.innerHTML = `
        <div class="mg-media-header">
          <div><span style="font-weight:700;">Media Risk</span> <span class="mg-media-summary" data-media-summary>– not scanned –</span></div>
          <div class="mg-media-actions">
            <button class="ss-btn mg-media-btn" data-media-scan>Scan Media</button>
            <button class="ss-btn" data-media-open hidden>Open</button>
          </div>
        </div>
        <div class="mg-media-progress" data-media-progress hidden>
          <div class="mg-media-bar"><span data-media-bar></span></div>
          <div class="mg-media-status" data-media-status>Idle</div>
        </div>
      `;
      body.appendChild(mediaCard);

      // Drawer (fixed next to overlay)
      mediaDrawer = document.createElement("div");
      mediaDrawer.className = "mg-media-panel";
      mediaDrawer.hidden = true;
      mediaDrawer.style.zIndex = "2147483646"; // ensure on top
      mediaDrawer.setAttribute("aria-hidden", "true");
      mediaDrawer.innerHTML = `
        <div class="mg-media-panel__inner">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-weight:700;">Media Results</div>
            <button class="ss-nav-btn" data-media-close>Close</button>
          </div>
          <div class="mg-media-grid" data-media-list>
            <div style="padding:8px; font-size:13px; opacity:.8;" data-media-empty> No media scanned yet. </div>
          </div>
        </div>
      `;
      document.body.appendChild(mediaDrawer);

      btnScan   = MG.qs('[data-media-scan]', mediaCard);
      btnOpen   = MG.qs('[data-media-open]', mediaCard);
      btnCloseD = MG.qs('[data-media-close]', mediaDrawer);
      progWrap  = MG.qs('[data-media-progress]', mediaCard);
      progBar   = MG.qs('[data-media-bar]', mediaCard);
      progText  = MG.qs('[data-media-status]', mediaCard);
      summaryEl = MG.qs('[data-media-summary]', mediaCard);
      listEl    = MG.qs('[data-media-list]', mediaDrawer);
    }

    document.body.appendChild(tip);

    // Draggable + drawer sync
    try { MG.makeDraggable(tip, header, MG.KEYS.POS_OVERLAY); } catch {}

    // LEFT-based positioning (resilient to width changes)
    const syncDrawerPosition = () => {
      if (!mediaDrawer || mediaDrawer.hidden) return;
      const rect = tip.getBoundingClientRect();
      const panelW = mediaDrawer.getBoundingClientRect().width || 320;
      const left = Math.max(10, rect.left - panelW - 10);
      mediaDrawer.style.left = left + "px";
      mediaDrawer.style.right = "auto";
      mediaDrawer.style.top = Math.max(10, rect.top) + "px";
      mediaDrawer.style.maxHeight = Math.max(120, window.innerHeight - 20) + "px";
    };
    MG.positionMediaDrawer = syncDrawerPosition;

    const onResize = () => MG.positionMediaDrawer?.();
    const onScroll = () => MG.positionMediaDrawer?.();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll);

    // Toggle settings
    const settingsEl = document.createElement("div");
    settingsEl.className = "mg-settings";
    settingsEl.hidden = true;
    settingsEl.innerHTML = `<div class="mg-settings__inner"></div>`;
    body.appendChild(settingsEl);
    const settingsInner = MG.qs(".mg-settings__inner", settingsEl);

    gear.onclick = () => {
      if (!settingsInner.firstChild) {
        try { MG.buildSettingsPanel?.(settingsInner); } catch {}
      }
      const prefersReduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const isOpening = settingsEl.hidden;
      if (prefersReduced) {
        settingsEl.hidden = !isOpening ? true : false;
        gear.setAttribute("aria-expanded", String(isOpening));
        return;
      }
      if (isOpening) MG.slideOpen?.(settingsEl, 320);
      else MG.slideClose?.(settingsEl, 280);
      gear.setAttribute("aria-expanded", String(isOpening));
    };

    MG.buildSettingsPanel?.(settingsInner);

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
      </div>
    `;
    body.appendChild(actions);

    const btnPrev   = MG.qs('[data-mg-prev]', actions);
    const btnNext   = MG.qs('[data-mg-next]', actions);
    const btnExplain= MG.qs('[data-mg-explain]', actions);
    const btnReport = MG.qs('[data-mg-report]', actions);
    const btnVerify = MG.qs('[data-mg-verify]', actions);

    btnPrev?.addEventListener('click', () => MG.goToHighlight(-1));
    btnNext?.addEventListener('click', () => MG.goToHighlight(+1));
    btnExplain?.addEventListener('click', () => MG.explainCurrentHighlight?.());

    btnReport?.addEventListener('click', () => {
      const url = 'https://scores.sebi.gov.in/';
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { location.href = url; }
    });

    // Verify (reg_no / pan / upi / name)
    btnVerify?.addEventListener('click', async () => {
      const text = String(window.getSelection?.()?.toString() || '').trim();
      if (!text) { alert('Select advisor name or SEBI regn no./PAN/UPI on the page, then click Verify.'); return; }

      const cls = MG.classifyQuery(text);
      if (!cls) { alert('Could not classify your selection.'); return; }

      const params = {}; params[cls.kind] = cls.value;
      if (cls.kind === "name") params.fuzzy = 1;

      try {
        btnVerify.disabled = true; btnVerify.textContent = 'Verifying...';
        const json = await MG.registryVerify(params);
        btnVerify.textContent = MG.summarizeMatches(json);
      } catch (e) {
        console.error(e);
        btnVerify.textContent = 'Error';
      } finally {
        setTimeout(() => { btnVerify.textContent = 'Verify Advisor (select text)'; btnVerify.disabled = false; }, 1600);
      }
    });

    // ---------- MEDIA: scan button + open/close drawer ----------
    let dragObserver;
    if (MG.FEATURES?.MEDIA_SCAN_ENABLED) {
      const setProgress = (done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        progBar.style.width = pct + "%";
        progText.textContent = `Scanning media... ${done} / ${total}`;
      };
      const setSummary = (counts) => {
        const s = ` ${counts.HIGH||0} High • ${counts.MEDIUM||0} Medium • ${counts.SAFE||0} Safe`;
        summaryEl.textContent = s;
      };
      const showEmptyIfNeeded = () => {
        const empty = MG.qs("[data-media-empty]", mediaDrawer);
        empty && (empty.hidden = listEl.children.length > 0);
      };
      const detectDataUrlSafe = async (dataUrl) => { try { return await MG.detectDataUrl(dataUrl); } catch { return null; } };

      async function startScan() {
        const mediaEls = MG.enumerateMedia();
        if (!mediaEls.length) {
          // still allow opening drawer to show empty state
          btnOpen.hidden = false;
          alert("No media found in view.");
          return;
        }

        // clear old tiles
        listEl.innerHTML = "";

        btnScan.disabled = true; btnScan.textContent = "Scanning…";
        tip.classList.add("mg-scan-active");
        progWrap.hidden = false;
        setProgress(0, mediaEls.length);

        const counts = { HIGH:0, MEDIUM:0, LOW:0, SAFE:0, UNKNOWN:0 };

        let shotCache = null;
        for (let i = 0; i < mediaEls.length; i++) {
          const el = mediaEls[i];
          let dataUrl = await MG.captureElement(el);
          if (!dataUrl) {
            if (!shotCache) shotCache = await MG.captureViewport();
            if (shotCache) dataUrl = await MG.cropFromScreenshot(shotCache, el);
          }
          const result = dataUrl ? await detectDataUrlSafe(dataUrl) : null;
          const level = String(result?.risk?.level || "UNKNOWN").toUpperCase();
          counts[level] = (counts[level] || 0) + 1;

          const item = document.createElement("div");
          item.className = "mg-media-item";
          const badge = document.createElement("div");
          badge.className = "mg-media-badge";
          badge.style.background = MG.riskColor(level);
          badge.textContent = `${level}${result?.risk?.score!=null ? ` (${MG.pct(result.risk.score)}%)` : ""}`;
          item.appendChild(badge);

          const img = new Image();
          img.src = dataUrl
            ? dataUrl
            : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>
                   <rect width='100%' height='100%' fill='#222'/>
                   <text x='50%' y='50%' fill='#bbb' font-family='sans-serif' font-size='14'
                         text-anchor='middle' dominant-baseline='middle'>capture failed</text>
                 </svg>`
              );
          img.className = "mg-media-thumb";
          item.appendChild(img);
          listEl.appendChild(item);

          setProgress(i+1, mediaEls.length);
        }

        showEmptyIfNeeded();
        setSummary(counts);
        btnScan.textContent = "Scan Media";
        btnScan.disabled = false;
        tip.classList.remove("mg-scan-active");
        progText.textContent = "Done";
        btnOpen.hidden = false;
        MG.positionMediaDrawer?.();
      }

      btnScan?.addEventListener("click", () => { startScan().finally(() => MG.positionMediaDrawer?.()); });

      // Always try to open the drawer (even if empty)
      btnOpen?.addEventListener("click", () => {
        const empty = MG.qs("[data-media-empty]", mediaDrawer);
        empty && (empty.hidden = listEl.children.length > 0);
        mediaDrawer.hidden = false;         // unhide immediately so it can measure width
        mediaDrawer.style.width = "0px";    // reset so animation is visible
        MG.positionMediaDrawer?.();         // compute left before anim
        MG.slideOpenX(mediaDrawer, 320, 320);
        mediaDrawer.setAttribute("aria-hidden","false");
      });
      btnCloseD?.addEventListener("click", () => {
        MG.slideCloseX(mediaDrawer, 280);
        mediaDrawer.setAttribute("aria-hidden","true");
      });

      // keep drawer aligned if overlay moves
      dragObserver = new MutationObserver(() => MG.positionMediaDrawer?.());
      dragObserver.observe(tip, { attributes: true, attributeFilter: ["style", "class"] });
    }

    // ---- CLEANUP on overlay close (prevents freeze on reopen) ----
    cleanupFns.push(() => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      try { dragObserver?.disconnect?.(); } catch {}
      try { mediaDrawer?.remove?.(); } catch {}
      // clear exported helper to avoid stale references on next mount
      MG.positionMediaDrawer = undefined;
    });

    // Fade in + initial state
    requestAnimationFrame(() => tip.classList.add("marketguard-in"));
    MG.applyPrefsToOverlay?.(tip);
    MG.updateHlSummary?.();

    // Autofocus first risky element
    const hasRisky = MG.findHighlights().length > 0;
    if (hasRisky) {
      if (!MG.state) MG.state = {};
      MG.state.hlIndex = -1;
      setTimeout(() => MG.goToHighlight(+1), 300);
    }

    // UPI inline chips + observer
    try { MG.scanAndBadgeUPIs?.(document.body); } catch {}
    try {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === "childList" && (m.addedNodes?.length || 0) > 0) {
            MG.scanAndBadgeUPIs?.(m.target || document.body);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      cleanupFns.push(() => mo.disconnect());
    } catch {}

    return tip;
  };
})();

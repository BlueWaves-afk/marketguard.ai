// scripts/05f-overlay-shell.js
// The overlay UI shell + wiring (verify/explain/nav/media drawer/UPI observer)

(() => {
  const MG = (window.MG = window.MG || {});

  MG.mountOverlayShell = (options = {}) => {
    let tip = MG.qs(".marketguard-tooltip");
    if (tip) return tip;
    
    // Check if this is being called from FAB click or automatic
    const isFromFabClick = options.fromFabClick || (MG.state?.forceShowOverlay === true);

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
      if (!MG.state) MG.state = {};
      MG.state.overlayClosed = true;
      
      // Apply genie closing animation
      MG.applyGenieAnimation?.(tip, true);
      
      // run cleanup, then remove tip
      try { cleanupFns.forEach(fn => fn?.()); } catch {}
      
      // Wait for genie animation to complete (400ms)
      setTimeout(() => {
        try {
          tip.remove();
        } catch (e) {
          console.warn('Error removing overlay:', e);
        }
      }, 450);
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
    let btnScan, btnOpen, progWrap, progBar, progText, summaryEl, mediaItems = [];
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
        </div>
      `;
      body.appendChild(mediaCard);

      btnScan   = MG.qs('[data-media-scan]', mediaCard);
      btnOpen   = MG.qs('[data-media-open]', mediaCard);
      progWrap  = MG.qs('[data-media-progress]', mediaCard);
      progBar   = MG.qs('[data-media-bar]', mediaCard);
      progText  = MG.qs('[data-media-status]', mediaCard);
      summaryEl = MG.qs('[data-media-summary]', mediaCard);
      
      console.log("Media buttons initialized:", { btnScan, btnOpen });
    }

    document.body.appendChild(tip);

    // Draggable
    try { MG.makeDraggable(tip, header, MG.KEYS.POS_OVERLAY); } catch {}

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

    // ---------- MEDIA: scan button + popup functionality ----------
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
      const detectDataUrlSafe = async (dataUrl) => { try { return await MG.detectDataUrl(dataUrl); } catch { return null; } };

      async function startScan() {
        const mediaEls = MG.enumerateMedia();
        if (!mediaEls.length) {
          btnOpen.hidden = false;
          alert("No media found in view.");
          return;
        }

        // Reset media items array
        mediaItems = [];

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

          // Store media item for popup
          mediaItems.push({
            dataUrl: dataUrl || null,
            level: level,
            score: result?.risk?.score || null,
            element: el
          });

          setProgress(i+1, mediaEls.length);
        }

        setSummary(counts);
        btnScan.textContent = "Scan Media";
        btnScan.disabled = false;
        tip.classList.remove("mg-scan-active");
        progText.textContent = "Done";
        
        // Enable and show the open button
        console.log("Scan completed, enabling open button", { btnOpen, mediaItemsCount: mediaItems.length });
        if (btnOpen) {
          btnOpen.hidden = false;
          btnOpen.disabled = false;
          btnOpen.style.display = "";
          btnOpen.removeAttribute('hidden');
          console.log("Open button enabled", { 
            hidden: btnOpen.hidden, 
            disabled: btnOpen.disabled,
            mediaItems: mediaItems.length
          });
        }
      }

      btnScan?.addEventListener("click", () => { startScan(); });

      // Open media popup with results
      btnOpen?.addEventListener("click", (e) => {
        console.log("View Results button clicked", { mediaItems: mediaItems?.length || 0 });
        e.preventDefault();
        if (btnOpen?.disabled) return;
        
        try {
          // Ensure we have the popup function and valid data
          if (typeof MG.openMediaPopup !== 'function') {
            console.error('MG.openMediaPopup function not available');
            alert('Media popup feature is not available. Please refresh the page.');
            return;
          }
          
          // Ensure mediaItems is an array
          const validMediaItems = Array.isArray(mediaItems) ? mediaItems : [];
          console.log('Opening media popup with', validMediaItems.length, 'items');
          
          // Open the media popup with scanned items
          MG.openMediaPopup({ 
            mediaItems: validMediaItems,
            summary: {}
          });
        } catch (error) {
          console.error('Error opening media popup:', error);
          alert('Unable to open media results. Please try scanning again.');
        }
      });
    }

    // ---- CLEANUP on overlay close (prevents freeze on reopen) ----
    cleanupFns.push(() => {
      // Clean up any remaining references
      try { mediaItems = []; } catch {}
    });

    // Genie animation + initial state
    MG.applyGenieAnimation = MG.applyGenieAnimation || function(element, isClosing = false) {
      try {
        // Find the FAB element
        const fab = document.querySelector('.marketguard-fab');
        if (!fab) {
          // Fallback to regular animation if no FAB found
          element.classList.add(isClosing ? "marketguard-out" : "marketguard-in");
          return;
        }

        // Get FAB position
        const fabRect = fab.getBoundingClientRect();
        const fabCenterX = fabRect.left + fabRect.width / 2;
        const fabCenterY = fabRect.top + fabRect.height / 2;

        // Get overlay position
        const overlayRect = element.getBoundingClientRect();
        const overlayCenterX = overlayRect.left + overlayRect.width / 2;
        const overlayCenterY = overlayRect.top + overlayRect.height / 2;

        // Calculate translation needed to move from overlay center to FAB center
        const deltaX = fabCenterX - overlayCenterX;
        const deltaY = fabCenterY - overlayCenterY;

        // Set CSS custom properties for the animation
        element.style.setProperty('--mg-genie-start-x', `${deltaX}px`);
        element.style.setProperty('--mg-genie-start-y', `${deltaY}px`);

        // Apply the genie animation class
        element.classList.remove('marketguard-in', 'marketguard-out', 'mg-genie-in', 'mg-genie-out');
        requestAnimationFrame(() => {
          element.classList.add(isClosing ? 'mg-genie-out' : 'mg-genie-in');
        });

        console.log('Genie animation applied:', { 
          fabPosition: { x: fabCenterX, y: fabCenterY },
          overlayPosition: { x: overlayCenterX, y: overlayCenterY },
          delta: { x: deltaX, y: deltaY },
          isClosing
        });
      } catch (error) {
        console.warn('Failed to apply genie animation:', error);
        // Fallback to regular animation
        element.classList.add(isClosing ? "marketguard-out" : "marketguard-in");
      }
    };

    // Apply genie animation for opening
    requestAnimationFrame(() => {
      // Use genie animation if opened from FAB or forced, otherwise use regular animation
      if (isFromFabClick) {
        console.log('Opening overlay with genie animation (from FAB click)');
        MG.applyGenieAnimation(tip, false);
      } else {
        console.log('Opening overlay with regular animation (automatic)');
        tip.classList.add("marketguard-in");
      }
      MG.applyPrefsToOverlay?.(tip);
      MG.updateHlSummary?.();
    });

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

// scripts/05-overlay.js (buttery-smooth, symmetric open/close; measure-once; isolated layout)
(() => {
  const MG = (window.MG = window.MG || {});

  // ---------- small safe fallbacks ----------
  MG.qs = MG.qs || ((sel, root = document) => root.querySelector(sel));
  MG.pct = MG.pct || ((x) => Math.round((Number(x) || 0) * 100));
  MG.makeDraggable = MG.makeDraggable || (() => {});
  MG.saveSync = MG.saveSync || (async () => {});
  MG.loadSync = MG.loadSync || (async (_k, defv) => defv);
  MG.KEYS = MG.KEYS || { PREFS: "marketGuardPrefs", POS_OVERLAY: "marketGuardOverlayPos" };

  const FALLBACK_PREFS = { threshold: 0.5, theme: "dark", defaultMode: "compact", pauseScanning: false };

  function coercePrefs(p) {
    const base = (MG.DEFAULT_PREFS && typeof MG.DEFAULT_PREFS === "object") ? MG.DEFAULT_PREFS : FALLBACK_PREFS;
    if (!p || typeof p !== "object") return { ...base };
    const out = { ...base, ...p };
    if (!out.defaultMode) out.defaultMode = base.defaultMode || "compact";
    if (typeof out.threshold !== "number") out.threshold = Number(base.threshold) || 0.5;
    if (typeof out.pauseScanning !== "boolean") out.pauseScanning = !!base.pauseScanning;
    if (!out.theme) out.theme = base.theme || "dark";
    return out;
  }
  function getPrefs() {
    if (!MG.state) MG.state = {};
    MG.state.prefs = coercePrefs(MG.state.prefs);
    return MG.state.prefs;
  }

  // ---------- highlight navigation helpers ----------
  MG.findHighlights = function () {
    return Array.from(document.querySelectorAll('mark.marketguard[data-mg-flag="1"]'));
  };
  MG.updateHlSummary = function () {
    const tip = MG.qs(".marketguard-tooltip");
    if (!tip) return;
    const items = MG.findHighlights();
    const idx = (MG.state?.hlIndex ?? -1) + 1;
    const span = MG.qs('[data-mg-hl-summary]', tip);
    if (span) span.textContent = items.length ? `Match ${Math.max(idx, 1)} of ${items.length}` : "No highlights";
  };
  MG.goToHighlight = function (delta = 0) {
    if (!MG.state) MG.state = {};
    const items = MG.findHighlights();
    if (!items.length) { MG.state.hlIndex = -1; MG.updateHlSummary(); return null; }
    MG.state.hlIndex = (MG.state.hlIndex ?? -1) + delta;
    if (MG.state.hlIndex < 0) MG.state.hlIndex = items.length - 1;
    if (MG.state.hlIndex >= items.length) MG.state.hlIndex = 0;
    const el = items[MG.state.hlIndex];
    items.forEach(i => i.classList.remove("mg-hl-focus"));
    el.classList.add("mg-hl-focus");
    try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch {}
    MG.updateHlSummary();
    return el;
  };

  // ---------- apply prefs to overlay ----------
  MG.applyPrefsToOverlay = (tip) => {
    if (!tip) return;
    const prefs = MG.getPrefs?.() || getPrefs();

    tip.classList.toggle("mg-theme-light", prefs.theme === "light");

    const chip = MG.qs("[data-chip-threshold]", tip);
    if (chip) chip.textContent = `Auto threshold: ${MG.pct(prefs.threshold)}%`;

    const modeChip = MG.qs("[data-chip-mode]", tip);
    if (modeChip) modeChip.textContent = `Mode: ${prefs.defaultMode}`;
  };

  // ---------- mount overlay shell ----------
  MG.mountOverlayShell = () => {
    let tip = MG.qs(".marketguard-tooltip");
    if (tip) return tip;

    tip = document.createElement("div");
    tip.className = "marketguard-tooltip";

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

    function getLogoUrl() {
      if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length) return MG.LOGO_URL;
      try { return chrome?.runtime?.getURL?.("assets/logo.png") || ""; } catch { return ""; }
    }

    const avatar = document.createElement("div");
    avatar.className = "ss-avatar ss-avatar--logo";
    const logoUrl = getLogoUrl();
    avatar.innerHTML = logoUrl
      ? `<img class="ss-avatar-img" src="${logoUrl}" alt="${MG.BRAND_NAME || "MarketGuard"} logo" decoding="async" loading="eager" />`
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

    const close = document.createElement("div");
    close.className = "ss-close";
    close.title = "Close";
    close.textContent = "×";
    close.onclick = () => {
      tip.classList.add("marketguard-out");
      if (!MG.state) MG.state = {};
      MG.state.overlayClosed = true;
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

      <div class="ss-actions">
        <div class="ss-left-actions">
          <button class="ss-nav-btn" data-mg-prev>◀ Prev</button>
          <button class="ss-nav-btn" data-mg-next>Next ▶</button>
          <span data-mg-hl-summary>No highlights</span>
        </div>
        <div class="ss-right-actions">
          <button class="ss-btn ss-btn--danger" data-mg-report>Report to SEBI (SCORES)</button>
          <button class="ss-btn" data-mg-verify>Verify Advisor (select text)</button>
        </div>
      </div>

      <!-- NOTE: add a dedicated inner to animate opacity/translate while outer animates height -->
      <div class="mg-settings" hidden><div class="mg-settings__inner"></div></div>
    `;
    tip.appendChild(body);

    document.body.appendChild(tip);

    // Draggable (save overlay position)
    try { MG.makeDraggable(tip, header, MG.KEYS.POS_OVERLAY); } catch {}

    // Toggle settings (symmetric smooth slide)
    const settingsEl = MG.qs(".mg-settings", tip);
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

    // Build settings panel (includes Pause scanning) into inner
    MG.buildSettingsPanel?.(settingsInner);

    // Wire action buttons
    const btnPrev   = MG.qs('[data-mg-prev]', tip);
    const btnNext   = MG.qs('[data-mg-next]', tip);
    const btnReport = MG.qs('[data-mg-report]', tip);
    const btnVerify = MG.qs('[data-mg-verify]', tip);

    btnPrev?.addEventListener('click', () => MG.goToHighlight(-1));
    btnNext?.addEventListener('click', () => MG.goToHighlight(+1));

    btnReport?.addEventListener('click', () => {
      const url = 'https://scores.sebi.gov.in/';
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { location.href = url; }
    });

    btnVerify?.addEventListener('click', async () => {
      const text = String(window.getSelection?.()?.toString() || '').trim();
      if (!text) { alert('Select advisor name or SEBI regn no. on the page, then click Verify.'); return; }
      try {
        const endpoint = MG?.API?.VERIFY;
        if (!endpoint) { alert('Verify API not configured'); return; }
        btnVerify.disabled = true; btnVerify.textContent = 'Verifying...';
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text, url: location.href })
        });
        const j = await r.json();
        btnVerify.textContent = j?.status || j?.result || 'Done';
      } catch {
        btnVerify.textContent = 'Error';
      } finally {
        setTimeout(() => { btnVerify.textContent = 'Verify Advisor (select text)'; btnVerify.disabled = false; }, 1200);
      }
    });

    // Fade in + initial state
    requestAnimationFrame(() => tip.classList.add("marketguard-in"));
    MG.applyPrefsToOverlay?.(tip);
    MG.updateHlSummary?.();

    return tip;
  };

  // ---- utilities for animation timing ----
  async function settleLayout() {
    try { await document.fonts?.ready; } catch {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  function getInner(el) { return MG.qs(".mg-settings__inner", el) || el; }

  // ---- Symmetric, silky slide (outer height + inner fade/translate) ----
  MG.slideOpen = async function slideOpen(el, dur = 320) {
    if (!el) return;
    try { el._mgHeightAnim?.cancel(); el._mgInnerAnim?.cancel(); } catch {}

    const inner = getInner(el);
    el.hidden = false;

    // isolate layout & promote layer during anim
    el.style.contain = "layout paint size";
    el.style.overflow = "clip";
    el.style.willChange = "height";
    inner.style.willChange = "opacity, transform";
    inner.style.opacity = "0";
    inner.style.transform = "translateY(8px)";

    // measure once
    el.style.height = "auto";
    await settleLayout();
    const targetH = el.scrollHeight;

    // set start frame
    el.style.height = "0px";

    const easing = "cubic-bezier(.25,.9,.25,1)";
    const heightAnim = el.animate(
      [{ height: "0px" }, { height: targetH + "px" }],
      { duration: dur, easing, fill: "both", composite: "replace" }
    );
    const innerAnim = inner.animate(
      [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: dur * 0.9, easing, fill: "both", composite: "replace" }
    );
    el._mgHeightAnim = heightAnim;
    el._mgInnerAnim = innerAnim;

    await Promise.allSettled([heightAnim.finished, innerAnim.finished]);

    // cleanup -> natural sizing
    el.style.height = "";
    el.style.contain = "";
    el.style.overflow = "";
    el.style.willChange = "";
    inner.style.willChange = "";
    inner.style.opacity = "";
    inner.style.transform = "";
    el._mgHeightAnim = el._mgInnerAnim = null;
  };

  MG.slideClose = async function slideClose(el, dur = 280) {
    if (!el) return;
    try { el._mgHeightAnim?.cancel(); el._mgInnerAnim?.cancel(); } catch {}

    const inner = getInner(el);

    // isolate layout & promote layer during anim
    el.style.contain = "layout paint size";
    el.style.overflow = "clip";
    el.style.willChange = "height";
    inner.style.willChange = "opacity, transform";

    // measure once
    el.style.height = "auto";
    await settleLayout();
    const startH = el.scrollHeight;

    // start frame
    el.style.height = startH + "px";
    inner.style.opacity = "1";
    inner.style.transform = "translateY(0)";

    const easing = "cubic-bezier(.25,.9,.25,1)";
    const heightAnim = el.animate(
      [{ height: startH + "px" }, { height: "0px" }],
      { duration: dur, easing, fill: "both", composite: "replace" }
    );
    const innerAnim = inner.animate(
      [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(8px)" }],
      { duration: dur * 0.9, easing, fill: "both", composite: "replace" }
    );
    el._mgHeightAnim = heightAnim;
    el._mgInnerAnim = innerAnim;

    await Promise.allSettled([heightAnim.finished, innerAnim.finished]);

    // finalize
    el.hidden = true;
    el.style.height = "";
    el.style.contain = "";
    el.style.overflow = "";
    el.style.willChange = "";
    inner.style.willChange = "";
    inner.style.opacity = "";
    inner.style.transform = "";
    el._mgHeightAnim = el._mgInnerAnim = null;
  };

  // ---------- settings panel (MODERN CONTROLS) ----------
  MG.buildSettingsPanel = (container) => {
    if (!container) return;
    const prefs = MG.getPrefs?.() || getPrefs();

    container.innerHTML = "";

    // ----- Pause scanning (modern switch) -----
    const rowPause = document.createElement("div");
    rowPause.className = "row";
    rowPause.innerHTML = `
      <label class="mg-field">
        <span class="mg-field-label">Pause scanning</span>
        <span class="mg-switch">
          <input type="checkbox" role="switch" aria-label="Pause scanning" data-mg-pause />
          <span class="mg-switch-track"><span class="mg-switch-thumb"></span></span>
        </span>
      </label>
    `;
    container.appendChild(rowPause);

    const elPause = MG.qs('[data-mg-pause]', rowPause);
    elPause.checked = !!prefs.pauseScanning;
    elPause.onchange = async () => {
      prefs.pauseScanning = elPause.checked;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}

      if (prefs.pauseScanning) {
        MG.removeOverlayIfAny?.();
        await MG.ensureFab?.();
        MG.setFabScore?.(NaN, "PAUSED");
      } else {
        MG.runScan?.();
      }
    };

    // ----- Auto threshold (modern range + live bubble) -----
    const rowTh = document.createElement("div");
    rowTh.className = "row";
    rowTh.innerHTML = `
      <div class="mg-field">
        <span class="mg-field-label">Auto threshold</span>
        <div class="mg-range-wrap">
          <input class="mg-range" type="range" min="0" max="100" step="5" data-mg-th />
          <output class="mg-range-bubble" data-mg-th-val></output>
        </div>
      </div>
    `;
    container.appendChild(rowTh);

    const th = MG.qs("[data-mg-th]", rowTh);
    const thVal = MG.qs("[data-mg-th-val]", rowTh);

    const setRangeUI = () => {
      thVal.value = `${th.value}%`;
      thVal.textContent = `${th.value}%`;
      th.style.setProperty("--val", th.value);
    };

    th.value = MG.pct(prefs.threshold);
    setRangeUI();
    th.oninput = setRangeUI;
    th.onchange = async () => {
      prefs.threshold = Number(th.value) / 100;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}
      const tip = MG.qs(".marketguard-tooltip");
      if (tip) MG.applyPrefsToOverlay(tip);
      if (MG.state?.lastRiskJson) MG.updateAutoShow?.(MG.state.lastRiskJson);
    };

    // ----- Theme (modern select) -----
    const rowTheme = document.createElement("div");
    rowTheme.className = "row";
    rowTheme.innerHTML = `
      <div class="mg-field">
        <span class="mg-field-label">Theme</span>
        <div class="mg-select">
          <select data-mg-theme aria-label="Theme">
            <option value="dark">glass-dark</option>
            <option value="light">glass-light</option>
          </select>
          <span class="mg-select-caret" aria-hidden="true"></span>
        </div>
      </div>
    `;
    container.appendChild(rowTheme);

    const themeSel = MG.qs("[data-mg-theme]", rowTheme);
    themeSel.value = prefs.theme;
    themeSel.onchange = async () => {
      prefs.theme = themeSel.value;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}
      MG.applyPrefsToOverlay(MG.qs(".marketguard-tooltip"));
    };
  };

  // ---------- update overlay from NLP (shows --% when paused) ----------
  MG.updateOverlay = (json) => {
    let tip = MG.qs(".marketguard-tooltip");
    if (!tip) tip = MG.mountOverlayShell();

    const prefs = MG.getPrefs?.() || (function () { if (!MG.state) MG.state = {}; return MG.state.prefs || {}; })();
    const paused = !!prefs.pauseScanning;

    const risk = String(json?.risk || "—").toUpperCase();
    const pctText = paused ? "--" : String(MG.pct?.(json?.score || 0));

    const riskEl = MG.qs("[data-ss-risk]", tip);
    if (riskEl) {
      riskEl.textContent = `MarketGuard Risk: ${risk} (${pctText}%)`;
    }

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

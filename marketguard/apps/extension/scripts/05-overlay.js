// scripts/05-overlay.js (buttery-smooth, symmetric open/close; measure-once; isolated layout)
// Updated to navigate via data-mg-id anchors, autofocus first risky element, and show a glossy "Risk Explanation" popup using the generative-explanation API.
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

  // ---------- focus style for risky targets ----------
  function injectHighlightStyles() {
    if (document.getElementById("mg-hl-focus-style")) return;
    const st = document.createElement("style");
    st.id = "mg-hl-focus-style";
    st.textContent = `
      .mg-hl-focus {
        outline: 3px solid #ff4d4f !important;
        outline-offset: 2px !important;
        animation: mgHlPulse 1.1s ease-in-out 2;
      }
      @keyframes mgHlPulse {
        0% { outline-color: #ff4d4f; }
        50% { outline-color: rgba(255,77,79,0.25); }
        100% { outline-color: #ff4d4f; }
      }
    `;
    document.head.appendChild(st);
  }

  // ---------- risky element navigation helpers (via data-mg-id anchors) ----------
  MG.findHighlights = function () {
    const prefix = MG.state?.mgAnchorPrefix || "mg-anchor-";
    return Array.from(document.querySelectorAll(`[data-mg-id^="${prefix}"]`));
  };

  MG.updateHlSummary = function () {
    const tip = MG.qs(".marketguard-tooltip");
    if (!tip) return;
    const items = MG.findHighlights();
    const idx = (MG.state?.hlIndex ?? -1) + 1;
    const span = MG.qs('[data-mg-hl-summary]', tip);
    if (span) span.textContent = items.length ? `Risk ${Math.max(idx, 1)} of ${items.length}` : "No risky elements";
  };

  MG.goToHighlight = function (delta = 0) {
    injectHighlightStyles();
    if (!MG.state) MG.state = {};
    const items = MG.findHighlights();
    if (!items.length) { MG.state.hlIndex = -1; MG.updateHlSummary(); return null; }

    MG.state.hlIndex = (MG.state.hlIndex ?? -1) + delta;
    if (MG.state.hlIndex < 0) MG.state.hlIndex = items.length - 1;
    if (MG.state.hlIndex >= items.length) MG.state.hlIndex = 0;

    const el = items[MG.state.hlIndex];

    try { document.querySelectorAll(".mg-hl-focus").forEach(n => n.classList.remove("mg-hl-focus")); } catch {}

    if (el) {
      try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch {}
      try { el.classList.add("mg-hl-focus"); setTimeout(() => el.classList.remove("mg-hl-focus"), 1600); } catch {}
    }

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

  // ---------- Explain popup (glossy iOS-style sheet) ----------
  function injectExplainStyles() {
    if (document.getElementById("mg-explain-style")) return;
    const st = document.createElement("style");
    st.id = "mg-explain-style";
    st.textContent = `
      @keyframes mgExplainFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes mgSheetIn {
        from { transform: translateY(10px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes mgSheetOut {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(10px); opacity: 0; }
      }

      .mg-explain-overlay {
        position: fixed; inset: 0; z-index: 2147483647; /* above everything, incl. overlay */
        display: grid; place-items: center;
        padding: env(safe-area-inset-top, 12px) 12px env(safe-area-inset-bottom, 12px);
        background: color-mix(in oklab, rgba(8,10,14,.55) 70%, rgba(8,10,14,.55));
        -webkit-backdrop-filter: blur(12px) saturate(1.2);
        backdrop-filter: blur(12px) saturate(1.2);
        animation: mgExplainFade .14s ease;
      }

      .mg-explain-sheet {
        width: min(560px, 100%);
        max-height: min(76vh, 720px);
        overflow: hidden;
        border-radius: 20px;
        position: relative;
        box-shadow:
          0 20px 50px rgba(0,0,0,.45),
          0 1px 0 rgba(255,255,255,.06) inset;
        background:
          linear-gradient(180deg, rgba(20,22,28,.86) 0%, rgba(14,16,22,.9) 100%);
        border: 1px solid rgba(255,255,255,.08);
        color: #f5f7fb;
        display: flex; flex-direction: column;
        -webkit-backdrop-filter: blur(16px) saturate(1.1);
        backdrop-filter: blur(16px) saturate(1.1);
        background-clip: padding-box;
        animation: mgSheetIn .18s cubic-bezier(.25,.9,.25,1);
      }
      .mg-explain-sheet::before {
        content: "";
        position: absolute; inset: 0;
        background:
          radial-gradient(80% 60% at 10% -10%, rgba(0,255,255,.08), transparent 60%),
          radial-gradient(60% 50% at 100% 0%, rgba(0,255,200,.06), transparent 60%),
          radial-gradient(50% 40% at 50% 120%, rgba(0,200,255,.05), transparent 60%);
        pointer-events: none;
      }

      .mg-explain-sheet.mg-light {
        background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(245,247,250,.96));
        color: #111;
        border-color: rgba(0,0,0,.08);
        box-shadow:
          0 20px 50px rgba(0,0,0,.25),
          0 1px 0 rgba(255,255,255,.35) inset;
      }

      .mg-explain-header {
        display: grid; grid-template-columns: 36px 1fr 28px; gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .mg-explain-sheet.mg-light .mg-explain-header {
        border-bottom-color: rgba(0,0,0,.08);
      }

      .mg-explain-logo {
        width: 36px; height: 36px; border-radius: 12px; overflow: hidden;
        background: rgba(255,255,255,.06);
        display: grid; place-items: center;
      }

      .mg-explain-title {
        font-size: 16px; font-weight: 700; letter-spacing: .2px;
      }

      .mg-explain-close {
        display: inline-grid; place-items: center;
        width: 28px; height: 28px;
        border-radius: 999px;
        font-size: 18px; line-height: 1;
        cursor: pointer; user-select: none;
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        transition: transform .12s ease, opacity .12s ease;
      }
      .mg-explain-close:hover { opacity: 1; transform: scale(1.06); }
      .mg-explain-sheet.mg-light .mg-explain-close {
        background: rgba(0,0,0,.06); border-color: rgba(0,0,0,.12);
      }

      .mg-explain-body {
        padding: 12px 16px 16px 16px;
        overflow: auto;
        scrollbar-width: thin;
      }

      .mg-explain-meta {
        display: flex; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px;
      }

      .mg-chip {
        font-size: 12px; padding: 4px 10px; border-radius: 999px;
        background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.14);
        backdrop-filter: blur(6px);
      }
      .mg-explain-sheet.mg-light .mg-chip {
        background: rgba(0,0,0,.06); border-color: rgba(0,0,0,.08);
      }

      .mg-explain-text {
        font-size: 14px; line-height: 1.55;
        white-space: pre-wrap;
      }

      .mg-explain-loading {
        font-size: 13px; opacity: .85; padding: 12px 0;
      }

      .mg-explain-error {
        color: #ffb4b4; font-size: 13px; padding: 8px 0;
      }

      .ss-nav-btn[data-mg-explain] { margin-left: 8px; }
    `;
    document.head.appendChild(st);
  }

  function getLogoUrl() {
    if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length) return MG.LOGO_URL;
    try { return chrome?.runtime?.getURL?.("assets/logo.png") || ""; } catch { return ""; }
  }

  function extractReadableText(el) {
    if (!el) return "";
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT") return String(el.value || "");
    if (el.hasAttribute && el.hasAttribute("contenteditable")) return String(el.innerText || el.textContent || "");
    return String(el.innerText || el.textContent || "");
  }

  function openExplainPopup({ risk = "—", score = 0, text = "Loading...", loading = true } = {}) {
    injectExplainStyles();
    const prefs = MG.getPrefs?.() || getPrefs();
    const isLight = prefs.theme === "light";

    // Remove any existing explain overlays to avoid stacking
    try { document.querySelectorAll(".mg-explain-overlay").forEach(n => n.remove()); } catch {}

    // Body scroll lock
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const wrap = document.createElement("div");
    wrap.className = "mg-explain-overlay";
    wrap.setAttribute("role", "presentation");

    const sheet = document.createElement("div");
    sheet.className = "mg-explain-sheet" + (isLight ? " mg-light" : "");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "Risk Explanation");

    const header = document.createElement("div");
    header.className = "mg-explain-header";

    const logoBox = document.createElement("div");
    logoBox.className = "mg-explain-logo";
    const logoUrl = getLogoUrl();
    logoBox.innerHTML = logoUrl
      ? `<img src="${logoUrl}" alt="${MG.BRAND_NAME || "MarketGuard"}" style="width:28px;height:28px;border-radius:8px;" />`
      : `<div style="width:22px;height:22px;border-radius:6px;background:#999;opacity:.5;"></div>`;

    const ttl = document.createElement("div");
    ttl.className = "mg-explain-title";
    ttl.textContent = "Risk Explanation";

    const closeBtn = document.createElement("button");
    closeBtn.className = "mg-explain-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";

    header.appendChild(logoBox);
    header.appendChild(ttl);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "mg-explain-body";

    const meta = document.createElement("div");
    meta.className = "mg-explain-meta";
    const chipRisk = document.createElement("span");
    chipRisk.className = "mg-chip";
    chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
    const chipScore = document.createElement("span");
    chipScore.className = "mg-chip";
    chipScore.textContent = `Score: ${MG.pct?.(Number(score) || 0)}%`;
    meta.appendChild(chipRisk);
    meta.appendChild(chipScore);

    const textEl = document.createElement("div");
    textEl.className = "mg-explain-text";
    const loadingEl = document.createElement("div");
    loadingEl.className = "mg-explain-loading";
    loadingEl.textContent = "Generating explanation…";

    if (loading) {
      textEl.hidden = true;
    } else {
      loadingEl.hidden = true;
      textEl.textContent = text;
    }

    const errEl = document.createElement("div");
    errEl.className = "mg-explain-error";
    errEl.hidden = true;

    body.appendChild(meta);
    body.appendChild(loadingEl);
    body.appendChild(textEl);
    body.appendChild(errEl);

    sheet.appendChild(header);
    sheet.appendChild(body);
    wrap.appendChild(sheet);
    document.body.appendChild(wrap);

    // ---- iOS-smooth pop animations (match overlay easing) ----
    const easing = "cubic-bezier(.25,.9,.25,1)";
    try {
      wrap.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 140, easing, fill: "both", composite: "replace"
      });
      sheet.animate(
        [
          { opacity: 0, transform: "scale(.98) translateY(8px)" },
          { opacity: 1, transform: "scale(1) translateY(0)" }
        ],
        { duration: 180, easing, fill: "both", composite: "replace" }
      );
    } catch {}

    // ----- Focus trap + keyboard / backdrop close -----
    const focusableSel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(sheet.querySelectorAll(focusableSel)).filter(el => !el.hasAttribute('disabled'));
    let firstFocus = document.activeElement;

    const trap = (e) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };

    function cleanup() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", trap);
      wrap.removeEventListener("click", onBackdrop);
      document.documentElement.style.overflow = prevOverflow || "";
    }

    async function close() {
      // pop-out symmetric close
      try {
        const fadeOut = wrap.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 120, easing, fill: "both", composite: "replace"
        });
        const sheetOut = sheet.animate(
          [
            { opacity: 1, transform: "scale(1) translateY(0)" },
            { opacity: 0, transform: "scale(.985) translateY(8px)" }
          ],
          { duration: 160, easing, fill: "forwards", composite: "replace" }
        );
        await Promise.allSettled([fadeOut.finished, sheetOut.finished]);
      } catch {}
      try { document.body.removeChild(wrap); } catch {}
      cleanup();
      if (firstFocus && typeof firstFocus.focus === "function") firstFocus.focus();
    }

    function onBackdrop(e) {
      if (e.target === wrap) close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }

    // Wire up close button (fix)
    closeBtn.addEventListener("click", close);

    wrap.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", trap);

    // initial focus into dialog
    closeBtn.focus();

    return {
      setData({ risk, score, text }) {
        chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
        chipScore.textContent = `Score: ${MG.pct?.(Number(score) || 0)}%`;
        textEl.textContent = text || "";
        loadingEl.hidden = true;
        textEl.hidden = false;
        errEl.hidden = true;
      },
      setError(msg) {
        loadingEl.hidden = true;
        textEl.hidden = true;
        errEl.textContent = msg || "Failed to generate explanation.";
        errEl.hidden = false;
      },
      close
    };
  }


  async function explainCurrentHighlight() {
    const endpoint = MG?.API?.NLP_GENERATIVE_EXPLANATION;
    if (!endpoint || typeof endpoint !== "string") {
      alert("Generative explanation API not configured.");
      return;
    }

    const el = MG.goToHighlight(0) || (function(){
      const list = MG.findHighlights();
      return list.length ? list[0] : null;
    })();

    if (!el) { alert("No risky element to explain."); return; }

    const text = extractReadableText(el).trim();
    if (!text) { alert("Couldn't extract text from this element."); return; }

    const popup = openExplainPopup({ loading: true, risk: MG.state?.lastRiskJson?.risk || "—", score: MG.state?.lastRiskJson?.score || 0 });

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const j = await r.json();
      if (!r.ok) {
        popup.setError(j?.detail || "Server error.");
        return;
      }
      popup.setData({
        risk: j?.risk || "—",
        score: Number(j?.score || 0),
        text: String(j?.explanation || "").trim() || "No explanation returned."
      });
    } catch (e) {
      popup.setError("Network error. Please try again.");
    }
  }

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
          <button class="ss-nav-btn" data-mg-explain>Explain</button>
          <span data-mg-hl-summary>No risky elements</span>
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
    const btnExplain= MG.qs('[data-mg-explain]', tip);
    const btnReport = MG.qs('[data-mg-report]', tip);
    const btnVerify = MG.qs('[data-mg-verify]', tip);

    btnPrev?.addEventListener('click', () => MG.goToHighlight(-1));
    btnNext?.addEventListener('click', () => MG.goToHighlight(+1));
    btnExplain?.addEventListener('click', () => explainCurrentHighlight());

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

    // --------- Autofocus first risky element on open ----------
    const hasRisky = MG.findHighlights().length > 0;
    if (hasRisky) {
      if (!MG.state) MG.state = {};
      MG.state.hlIndex = -1; // reset so +1 goes to index 0
      setTimeout(() => MG.goToHighlight(+1), 300); // small delay so overlay is fully visible
    }
    // ----------------------------------------------------------

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

    el.style.contain = "layout paint size";
    el.style.overflow = "clip";
    el.style.willChange = "height";
    inner.style.willChange = "opacity, transform";
    inner.style.opacity = "0";
    inner.style.transform = "translateY(8px)";

    el.style.height = "auto";
    await settleLayout();
    const targetH = el.scrollHeight;

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

    el.style.contain = "layout paint size";
    el.style.overflow = "clip";
    el.style.willChange = "height";
    inner.style.willChange = "opacity, transform";

    el.style.height = "auto";
    await settleLayout();
    const startH = el.scrollHeight;

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

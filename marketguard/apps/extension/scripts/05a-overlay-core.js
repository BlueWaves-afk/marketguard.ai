
// scripts/05a-overlay-core.js
// Core: MG namespace helpers, prefs, risk colors, highlight+UPI+media styles, hl nav, applyPrefs

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
  MG.getPrefs = MG.getPrefs || function getPrefs() {
    if (!MG.state) MG.state = {};
    MG.state.prefs = coercePrefs(MG.state.prefs);
    return MG.state.prefs;
  };

  // ---------- risk colors ----------
  const RCOL = { SAFE:"#00C853", LOW:"#64DD17", MEDIUM:"#FFAB00", HIGH:"#D50000", UNKNOWN:"#999" };
  MG.riskColor = MG.riskColor || function riskColor(level){ return RCOL[String(level||"").toUpperCase()] || RCOL.UNKNOWN; };

  // ---------- focus style / scanning glow ----------
  MG.injectHighlightStyles = MG.injectHighlightStyles || function () {
    if (document.getElementById("mg-hl-focus-style")) return;
    const st = document.createElement("style");
    st.id = "mg-hl-focus-style";
    st.textContent = `
      .mg-hl-focus { outline: 3px solid #ff4d4f !important; outline-offset: 2px !important; animation: mgHlPulse 1.1s ease-in-out 2; }
      @keyframes mgHlPulse { 0% { outline-color: #ff4d4f; } 50% { outline-color: rgba(255,77,79,0.25); } 100% { outline-color: #ff4d4f; } }
      .marketguard-tooltip.mg-scan-active {
        box-shadow: 0 0 0 2px rgba(24,255,177,.35), 0 0 26px rgba(24,255,177,.25), 0 10px 40px rgba(0,0,0,.35);
      }`;
    document.head.appendChild(st);
  };

  // ---------- tiny UPI chip styles ----------
  MG.injectUpiChipStyles = MG.injectUpiChipStyles || function () {
    if (document.getElementById("mg-upi-chip-style")) return;
    const st = document.createElement("style");
    st.id = "mg-upi-chip-style";
    st.textContent = `
      .mg-upi-wrap { display:inline-flex; align-items:center; gap:6px; }
      .mg-upi-badge { font-weight:600; opacity:.85; }
      .mg-upi-chip {
        display:inline-flex; align-items:center; gap:6px; font-size:11px; line-height:1;
        padding:3px 6px; border-radius:999px; border:1px solid rgba(255,255,255,.18);
        background:rgba(255,255,255,.08); color:#f8f8f8; cursor:pointer; user-select:none;
      }
      .mg-theme-light .mg-upi-chip { background:rgba(0,0,0,.06); color:#222; border-color:rgba(0,0,0,.12); }
      .mg-upi-chip:hover { filter:brightness(1.1); }
      .mg-upi-chip[disabled] { opacity:.6; cursor:default; }`;
    document.head.appendChild(st);
  };

  // ---------- Media card + drawer styles ----------
  MG.injectMediaStyles = MG.injectMediaStyles || function () {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return;
    if (document.getElementById("mg-media-style")) return;
    const st = document.createElement("style");
    st.id = "mg-media-style";
    st.textContent = `
      .mg-media-card .mg-media-header { display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight:600; margin-bottom:6px; }
      .mg-media-header .mg-media-summary { font-weight:500; opacity:.85; font-size:13px; }
      .mg-media-actions { display:flex; gap:8px; }
      .mg-media-progress { margin-top:8px; }
      .mg-media-bar { height:6px; border-radius:999px; background:rgba(255,255,255,.10); overflow:hidden; }
      .mg-media-bar > span { display:block; height:100%; width:0%; background:linear-gradient(90deg,#18ffb1,#00e676); transition:width .25s ease; }
      .mg-media-status { font-size:12px; opacity:.85; margin-top:5px; }
      .mg-media-btn[disabled] { opacity:.6; cursor:default; }
      .mg-media-panel { position:fixed; z-index:2147483646; top:10px; right:calc(100% + 10px); width:0px; max-height:calc(100vh - 20px);
        overflow:hidden; contain:layout paint size; will-change:width; border-radius:16px;
        background:linear-gradient(180deg, rgba(20,22,28,.86), rgba(14,16,22,.9)); border:1px solid rgba(255,255,255,.08);
        box-shadow:0 10px 30px rgba(0,0,0,.35); }
      .mg-theme-light ~ .mg-media-panel { background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(245,247,250,.96)); border-color:rgba(0,0,0,.08); }
      .mg-media-panel__inner { width:320px; max-width:80vw; max-height:inherit; overflow:auto; padding:10px; }
      .mg-media-grid { display:grid; grid-template-columns:1fr; gap:10px; }
      .mg-media-item { position:relative; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); background:#0b0e14; }
      .mg-media-thumb { display:block; width:100%; height:auto; }
      .mg-media-badge { position:absolute; top:6px; left:6px; padding:3px 6px; border-radius:999px; font-size:11px; font-weight:700; color:#fff; backdrop-filter: blur(6px); }
      .mg-theme-light .mg-media-item { background:#fff; border-color:rgba(0,0,0,.08); }`;
    document.head.appendChild(st);
  };

  // ---------- risky element navigation helpers ----------
  MG.findHighlights = MG.findHighlights || function () {
    const prefix = MG.state?.mgAnchorPrefix || "mg-anchor-";
    return Array.from(document.querySelectorAll(`[data-mg-id^="${prefix}"]`));
  };
  MG.updateHlSummary = MG.updateHlSummary || function () {
    const tip = MG.qs(".marketguard-tooltip");
    if (!tip) return;
    const items = MG.findHighlights();
    const idx = (MG.state?.hlIndex ?? -1) + 1;
    const span = MG.qs('[data-mg-hl-summary]', tip);
    if (span) span.textContent = items.length ? `Risk ${Math.max(idx, 1)} of ${items.length}` : "No risky elements";
  };
  MG.goToHighlight = MG.goToHighlight || function (delta = 0) {
    MG.injectHighlightStyles();
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
  MG.applyPrefsToOverlay = MG.applyPrefsToOverlay || ((tip) => {
    if (!tip) return;
    const prefs = MG.getPrefs?.() || MG.getPrefs();
    tip.classList.toggle("mg-theme-light", prefs.theme === "light");
    const chip = MG.qs("[data-chip-threshold]", tip);
    if (chip) chip.textContent = `Auto threshold: ${MG.pct(prefs.threshold)}%`;
    const modeChip = MG.qs("[data-chip-mode]", tip);
    if (modeChip) modeChip.textContent = `Mode: ${prefs.defaultMode}`;
  });
})();

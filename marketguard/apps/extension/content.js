// MarketGuard Content Script (fixed)
// - Skips all editable areas (inputs/textarea/contenteditable) to avoid caret jumps
// - Debounces rescans while the user is typing
// - Settings persist in chrome.storage.sync and apply live
// - Compact FAB + Expanded Overlay (draggable, remembered), fade/pulse, highlight nav, history/sparkline, advisor card

(function () {
  // ====== CONFIG ======
  const NLP_API   = "http://localhost:8002/api/nlp/v1/score";
  const CHECK_API = "http://localhost:8003/api/check/v1/upi-verify";
  const REG_API   = "http://localhost:8001/api/registry/v1/verify";

  const DEFAULT_PREFS = {
    threshold: 0.50,
    defaultMode: "compact",          // "compact" | "expanded"
    theme: "glass-dark"              // "glass-dark" | "glass-light"
  };

  const LOW_CUT = 0.33;
  const HIGH_CUT = 0.66;

  const RISK_TERMS = [
    "guaranteed returns", "assured returns", "multibagger",
    "insider access", "FPI access", "DM me",
    "limited window", "send UPI", "double your money",
  ];
  const UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  // Keys
  const POS_KEY_OVERLAY = "marketGuardV2Pos::" + location.origin;
  const POS_KEY_FAB     = "marketGuardFabPos::" + location.origin;
  const HISTORY_KEY     = "mgHistory::" + location.origin; // local
  const ONBOARD_KEY     = "mgOnboarded::v1";               // local
  const PREFS_KEY       = "mgPrefs::v1";                   // sync

  // State
  let prefs = { ...DEFAULT_PREFS };
  let isScanning = false;
  let overlayClosed = false;
  let forceShowOverlay = false;
  let lastRiskJson = null;
  let highlightIndex = -1;

  // ====== UTILS ======
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const pct = (x) => Math.round((Number(x)||0)*100);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const nowTs = () => Date.now();

  const loadSync = (k, fb) => new Promise(res => {
    try { chrome.storage.sync.get([k], o => res(o && o[k]!=null ? o[k] : fb)); } catch { res(fb); }
  });
  const saveSync = (k, v) => new Promise(res => {
    try { chrome.storage.sync.set({[k]:v}, res); } catch { res(); }
  });
  const loadLocal = (k, fb) => new Promise(res => {
    try { chrome.storage.local.get([k], o => res(o && o[k]!=null ? o[k] : fb)); } catch { res(fb); }
  });
  const saveLocal = (k, v) => new Promise(res => {
    try { chrome.storage.local.set({[k]:v}, res); } catch { res(); }
  });

  function isOurElement(el) {
    return el?.classList && Array.from(el.classList).some(c => c.startsWith("marketguard") || c.startsWith("ss-"));
  }

  function isEditable(el) {
    // true for INPUT/TEXTAREA or inside a contenteditable region
    while (el && el.nodeType === 1) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  function safeReplace(node, frag) {
    try {
      if (!node || !frag?.childNodes.length) return;
      const p = node.parentNode;
      if (p && document.contains(p)) p.replaceChild(frag, node);
    } catch {}
  }

  // ====== STYLES ======
  const STYLE = `
  .marketguard-badge-inline{display:inline-block;padding:2px 6px;margin-left:6px;font:12px/1.2 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;border-radius:6px;background:#ffe7c2;color:#7a4f00;border:1px solid #f0c36d;cursor:pointer}
  .marketguard-risk{background:#ffe5e5;color:#a80000;border-color:#ff8a8a}
  mark.marketguard{background:#fff6a5}
  mark.marketguard.mg-active { outline: 2px solid #7ea6ff; background:#fff19e; border-radius:4px; }

  .marketguard-fab{
    position:fixed; bottom:24px; right:24px; z-index:2147483646;
    width:46px; height:46px; border-radius:12px; display:grid; place-items:center;
    font: 12px/1 Inter, system-ui; color:#eaf2ff;
    background: radial-gradient(120% 120% at 90% -10%, rgba(55,148,255,.2) 0%, rgba(255,255,255,.08) 45%, rgba(0,0,0,.45) 100%), rgba(14,20,34,.85);
    backdrop-filter:saturate(140%) blur(8px);
    box-shadow: 0 10px 24px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.06);
    cursor:grab; user-select:none;
    transition: transform .06s ease, box-shadow .2s ease, background .2s ease;
  }
  .marketguard-fab:active{ cursor:grabbing; transform: translateY(1px); }
  .mg-fab-low  { border: 1px solid rgba(18,255,176,.35) }
  .mg-fab-med  { border: 1px solid rgba(255,221,80,.35) }
  .mg-fab-high { border: 1px solid rgba(255,107,107,.45) }
  .marketguard-fab .mg-perc { font-weight:800; font-size:13px; }
  .marketguard-fab .mg-label { opacity:.85; font-size:10px; margin-top:2px; }

  .marketguard-tooltip{
    position:fixed; bottom:24px; right:78px; z-index:2147483647;
    width:min(620px, 44vw); min-width:380px; display:flex; flex-direction:column; gap:14px;
    border-radius:20px;
    background: radial-gradient(120% 120% at 90% -10%, rgba(55,148,255,.18) 0%, rgba(255,255,255,.05) 45%, rgba(0,0,0,.35) 100%), rgba(14,20,34,.84);
    backdrop-filter:saturate(140%) blur(8px);
    box-shadow: 0 18px 44px rgba(0,0,0,.30), inset 0 0 0 1px rgba(255,255,255,.06);
    color:#eaf2ff; padding:16px 18px; font: 14px/1.45 Inter, system-ui;
    user-select:none; opacity:0; transform: translateY(8px) scale(.98);
    transition: opacity .18s ease, transform .2s ease, box-shadow .2s ease, background .2s ease;
  }
  .marketguard-tooltip.marketguard-in{ opacity:1; transform: translateY(0) scale(1) }
  .marketguard-tooltip.marketguard-out{ opacity:0 !important; transform: translateY(8px) scale(.98) !important }
  @keyframes mgPulse {
    0% { box-shadow: 0 18px 44px rgba(255,64,64,.22), inset 0 0 0 1px rgba(255,255,255,.06) }
    50%{ box-shadow: 0 22px 60px rgba(255,64,64,.42), 0 0 24px rgba(255,64,64,.35), inset 0 0 0 1px rgba(255,255,255,.06) }
    100%{ box-shadow: 0 18px 44px rgba(255,64,64,.22), inset 0 0 0 1px rgba(255,255,255,.06) }
  }
  .marketguard-tooltip.marketguard-pulse{ animation: mgPulse 1.8s ease-in-out infinite; }

  .marketguard-tooltip.mg-theme-light{
    background: radial-gradient(120% 120% at 90% -10%, rgba(55,148,255,.10) 0%, rgba(255,255,255,.50) 45%, rgba(255,255,255,.92) 100%), rgba(255,255,255,.96);
    color:#0b1220; box-shadow: 0 18px 44px rgba(0,0,0,.18), inset 0 0 0 1px rgba(0,0,0,.06);
  }

  .ss-header{ display:flex; align-items:center; gap:12px; cursor:grab; }
  .ss-header:active{ cursor:grabbing; }
  .ss-avatar{ flex:0 0 44px; height:44px; width:44px; border-radius:12px; overflow:hidden;
    display:grid; place-items:center; background: linear-gradient(135deg, #2a3348, #111827);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
  }
  .mg-theme-light .ss-avatar{ background: linear-gradient(135deg, #e9eefb, #f8faff); box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
  .ss-title{ font-weight:800; font-size:18px; letter-spacing:.2px; margin:0; flex:1 1 auto; }
  .ss-close, .ss-gear{
    flex:0 0 auto; width:28px; height:28px; border-radius:8px; display:grid; place-items:center;
    background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:inherit; font-weight:700; cursor:pointer;
    transition: background .12s ease, border-color .12s ease, transform .06s ease;
  }
  .mg-theme-light .ss-close, .mg-theme-light .ss-gear{ background: rgba(0,0,0,.05); border:1px solid rgba(0,0,0,.10); }
  .ss-close:hover, .ss-gear:hover{ background: rgba(255,255,255,.12); }
  .mg-theme-light .ss-close:hover, .mg-theme-light .ss-gear:hover{ background: rgba(0,0,0,.08); }
  .ss-close:active, .ss-gear:active{ transform: translateY(1px); }

  .ss-body{ display:flex; flex-direction:column; gap:8px; }
  .ss-risk{ font-size:17px; font-weight:800; margin:0;
    background: linear-gradient(90deg, #12ffb0, #79ffa0 60%, #a7ff6f);
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .mg-theme-light .ss-risk{ background: linear-gradient(90deg, #00875a, #3fbf6d 60%, #78d64f); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .ss-sub{ margin:0; opacity:.85; font-size:13px; line-height:1.45; }

  .ss-row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .ss-chip { font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.18); opacity:.9; }
  .mg-theme-light .ss-chip{ border-color: rgba(0,0,0,.14); }

  .ss-divider{ height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.09),transparent); }
  .mg-theme-light .ss-divider{ background:linear-gradient(90deg,transparent,rgba(0,0,0,.12),transparent); }
  .ss-actions{ display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .ss-left-actions { display:flex; align-items:center; gap:8px; }
  .ss-nav-btn{ appearance:none; border:1px dashed rgba(255,255,255,.25); background:transparent; color:inherit; padding:6px 10px; border-radius:10px; cursor:pointer; font-weight:600; }
  .mg-theme-light .ss-nav-btn{ border-color: rgba(0,0,0,.18); }

  .ss-btn{
    appearance:none; border:1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.07); color:inherit; padding:10px 14px;
    border-radius:12px; font-weight:700; cursor:pointer; white-space:nowrap; font-size:14px;
    transition: transform .06s ease, background .12s ease, border-color .12s ease;
  }
  .ss-btn:hover{ background: rgba(255,255,255,.12); border-color:rgba(255,255,255,.22); }
  .ss-btn:active{ transform: translateY(1px); }
  .ss-btn--danger{ color:#ff7979; background: rgba(255,107,107,.12); border-color:rgba(255,107,107,.38); }
  .mg-theme-light .ss-btn{ background: rgba(0,0,0,.06); border-color: rgba(0,0,0,.14); }
  .mg-theme-light .ss-btn:hover{ background: rgba(0,0,0,.10); border-color: rgba(0,0,0,.20); }

  .mg-card{ border:1px solid rgba(255,255,255,.14); border-radius:12px; padding:10px 12px; background: rgba(255,255,255,.04); }
  .mg-theme-light .mg-card{ background: rgba(0,0,0,.04); border-color: rgba(0,0,0,.12); }

  .mg-settings{ display:none; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.18); margin-top:4px; }
  .mg-theme-light .mg-settings{ background: rgba(255,255,255,.7); border-color: rgba(0,0,0,.12); }
  .mg-settings .row{ display:flex; align-items:center; gap:8px; margin:6px 0; }
  .mg-settings label{ width:130px; font-size:12px; opacity:.85; }
  .mg-settings input[type="range"]{ width:180px; }
  .mg-settings select{ padding:6px 8px; border-radius:8px; }
  .mg-settings .mg-save{ margin-top:8px; }
  `;
  document.documentElement.appendChild(Object.assign(document.createElement("style"), {textContent: STYLE}));

  // ====== DRAGGABLE ======
  function makeDraggable(box, handle, posKey) {
    let startX, startY, startLeft, startTop, dragging=false;
    function onDown(e) {
      const evt = e.touches ? e.touches[0] : e;
      dragging = true; startX = evt.clientX; startY = evt.clientY;
      const r = box.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.top = r.top + "px";
      box.style.right = "auto"; box.style.bottom = "auto";
      startLeft = r.left; startTop = r.top;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, {passive:false});
      window.addEventListener("touchend", onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      const evt = e.touches ? e.touches[0] : e;
      if (e.touches) e.preventDefault();
      let left = startLeft + (evt.clientX - startX);
      let top  = startTop  + (evt.clientY - startY);
      const m=10, vw=innerWidth, vh=innerHeight, w=box.offsetWidth, h=box.offsetHeight;
      box.style.left = clamp(left, m, vw-w-m) + "px";
      box.style.top  = clamp(top , m, vh-h-m) + "px";
    }
    async function onUp() {
      if (!dragging) return;
      dragging=false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      const r = box.getBoundingClientRect();
      await saveLocal(posKey, {left:r.left, top:r.top});
    }
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, {passive:true});
  }

  // ====== HIGHLIGHTING ======
  function highlightMatches(node, regex, mode) {
    if (node?.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || isOurElement(parent) || isEditable(parent)) return;

    const text = node.nodeValue || "";
    if (!text.trim()) return;

    const frag = document.createDocumentFragment();
    let lastIndex = 0, match; regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement("mark");
      mark.className = "marketguard";
      mark.textContent = match[0];
      if (mode === "risk") mark.dataset.mgFlag = "1";
      if (mode === "upi")  mark.dataset.mgUpi = "1";
      frag.appendChild(mark);

      if (mode === "upi") {
        const btn = document.createElement("span");
        btn.className = "marketguard-badge-inline";
        btn.textContent = "Verify UPI";
        const matchedText = match[0];
        btn.addEventListener("click", async () => {
          btn.textContent = "Verifying...";
          try {
            const res = await fetch(CHECK_API, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({upi:matchedText})});
            const json = await res.json();
            btn.textContent = json.display || (json.verified ? "Verified" : "Not Found");
            btn.classList.toggle("marketguard-risk", !json.verified);
          } catch { btn.textContent = "Error"; }
        });
        frag.appendChild(btn);
      }

      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    safeReplace(node, frag);
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!n.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (isOurElement(p)) return NodeFilter.FILTER_REJECT;
        if (["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (isEditable(p)) return NodeFilter.FILTER_REJECT;  // <-- skip editors & inputs
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const out=[]; let curr; while((curr=walker.nextNode())) out.push(curr);
    return out;
  }

  // ====== FAB ======
  async function ensureFab() {
    let fab = qs(".marketguard-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.className = "marketguard-fab mg-fab-low";
    fab.innerHTML = `<div class="mg-perc">--%</div><div class="mg-label">MarketGuard</div>`;
    document.body.appendChild(fab);

    const pos = await loadLocal(POS_KEY_FAB, null);
    if (pos && typeof pos.left==="number" && typeof pos.top==="number") {
      fab.style.left = pos.left+"px"; fab.style.top = pos.top+"px";
      fab.style.right="auto"; fab.style.bottom="auto";
    }

    makeDraggable(fab, fab, POS_KEY_FAB);

    fab.addEventListener("click", () => {
      forceShowOverlay = true; overlayClosed = false;
      if (lastRiskJson) updateOverlay(lastRiskJson); else runScan();
    });

    const onboarded = await loadLocal(ONBOARD_KEY, false);
    if (!onboarded) {
      const tip = document.createElement("div");
      tip.className = "mg-tip";
      const r = fab.getBoundingClientRect();
      tip.style.left = (r.left-8)+"px"; tip.style.top = (r.top-60)+"px";
      tip.innerHTML = `Click to open MarketGuard overlay.<br/>Drag to reposition.<br/><button>Got it</button>`;
      document.body.appendChild(tip);
      tip.querySelector("button").onclick = async () => { tip.remove(); await saveLocal(ONBOARD_KEY, true); };
    }

    return fab;
  }

  function setFabScore(score, riskText) {
    const fab = qs(".marketguard-fab"); if (!fab) return;
    const per = qs(".mg-perc", fab); if (per) per.textContent = isNaN(score) ? "--%" : `${pct(score)}%`;
    fab.classList.remove("mg-fab-low","mg-fab-med","mg-fab-high");
    const bucket = score >= HIGH_CUT ? "high" : score >= LOW_CUT ? "med" : "low";
    fab.classList.add(`mg-fab-${bucket}`);
    if ((riskText||"").toUpperCase()==="HIGH")
      fab.style.boxShadow = "0 10px 28px rgba(255,64,64,.35), inset 0 0 0 1px rgba(255,255,255,.06)";
    else
      fab.style.boxShadow = "0 10px 24px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.06)";
  }

  // ====== OVERLAY ======
  function buildOverlayShell() {
    let tip = qs(".marketguard-tooltip");
    if (tip) return tip;

    tip = document.createElement("div");
    tip.className = "marketguard-tooltip";
    document.body.appendChild(tip);

    const header = document.createElement("div");
    header.className = "ss-header";
    const avatar = document.createElement("div");
    avatar.className = "ss-avatar";
    avatar.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#9fb4ff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#7fa0ff" opacity=".65"/></svg>`;
    header.appendChild(avatar);

    const title = document.createElement("h3"); title.className = "ss-title"; title.textContent = "MarketGuard Advisor Check"; header.appendChild(title);

    const langChip = document.createElement("span"); langChip.className="ss-chip"; langChip.setAttribute("data-mg-lang",""); langChip.style.marginLeft="auto"; header.appendChild(langChip);

    const gear = document.createElement("div"); gear.className="ss-gear"; gear.title="Settings"; gear.textContent="⚙"; header.appendChild(gear);
    const close = document.createElement("div"); close.className="ss-close"; close.title="Close"; close.textContent="×";
    close.onclick = () => { tip.classList.add("marketguard-out"); overlayClosed=true; forceShowOverlay=false; setTimeout(()=>tip.remove(),220); };
    header.appendChild(close);
    tip.appendChild(header);

    const body = document.createElement("div");
    body.className="ss-body";
    body.innerHTML = `
      <p class="ss-risk" data-ss-risk></p>
      <p class="ss-sub">Suspicious language flagged on this page.</p>
      <div class="ss-row" style="gap:6px;">
        <span class="ss-chip">Auto threshold: <b data-mg-thr></b></span>
        <span class="ss-chip">Mode: <b data-mg-mode></b></span>
        <span class="ss-chip">Theme: <b data-mg-theme></b></span>
      </div>
      <div class="ss-row" style="gap:10px; align-items:center;">
        <div class="mg-card" style="flex:1;">
          <div style="font-weight:700; margin-bottom:4px;">Site Risk Trend (last 20)</div>
          <div id="mg-sparkline" style="height:42px;"></div>
        </div>
      </div>
      <div id="mg-advisor" class="mg-card" style="display:none;"></div>
      <div class="mg-settings" id="mg-settings">
        <div class="row">
          <label>Auto-show threshold</label>
          <input id="mg-threshold" type="range" min="0" max="1" step="0.05">
          <span id="mg-threshold-val" style="width:40px; text-align:right;"></span>
        </div>
        <div class="row">
          <label>Default mode</label>
          <select id="mg-mode"><option value="compact">Compact</option><option value="expanded">Expanded</option></select>
        </div>
        <div class="row">
          <label>Theme</label>
          <select id="mg-theme"><option value="glass-dark">Glass (Dark)</option><option value="glass-light">Glass (Light)</option></select>
        </div>
        <button class="ss-btn mg-save">Save Settings</button>
      </div>
    `;
    tip.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "ss-actions";
    const left = document.createElement("div"); left.className="ss-left-actions";
    const prev = document.createElement("button"); prev.className="ss-nav-btn"; prev.textContent="◀ Prev";
    const next = document.createElement("button"); next.className="ss-nav-btn"; next.textContent="Next ▶";
    const count = document.createElement("span"); count.style.opacity=".8"; count.style.fontSize="12px";
    left.appendChild(prev); left.appendChild(next); left.appendChild(count);

    const right = document.createElement("div");
    const report = document.createElement("button"); report.className="ss-btn ss-btn--danger"; report.textContent="Report to SEBI (SCORES)"; report.onclick=()=>window.open("https://scores.sebi.gov.in/","_blank");
    const verifyBtn = document.createElement("button"); verifyBtn.className="ss-btn"; verifyBtn.textContent="Verify Advisor (select text)"; verifyBtn.onclick=()=>handleAdvisorVerify();
    right.appendChild(report); right.appendChild(verifyBtn);

    actions.appendChild(left); actions.appendChild(right);
    tip.appendChild(Object.assign(document.createElement("div"), {className:"ss-divider"}));
    tip.appendChild(actions);

    gear.onclick = () => {
      const pane = qs("#mg-settings", tip);
      if (!pane) return;
      pane.style.display = pane.style.display === "none" ? "block" : "none";
    };

    const saveBtn = qs("#mg-settings .mg-save", tip);
    saveBtn.onclick = async () => {
      const thr  = parseFloat(qs("#mg-threshold", tip).value);
      const mode = qs("#mg-mode", tip).value;
      const theme= qs("#mg-theme", tip).value;
      prefs = { threshold: thr, defaultMode: mode, theme };
      await saveSync(PREFS_KEY, prefs);       // persist
      applyPrefsToOverlay(tip);               // apply immediately
      if (lastRiskJson) updateAutoShow(lastRiskJson); // re-eval visibility
    };

    prev.onclick = () => navigateHighlight(-1, count);
    next.onclick = () => navigateHighlight(+1, count);

    loadLocal(POS_KEY_OVERLAY, null).then(pos => {
      if (pos && typeof pos.left==="number" && typeof pos.top==="number") {
        tip.style.left = pos.left+"px"; tip.style.top = pos.top+"px";
        tip.style.right="auto"; tip.style.bottom="auto";
      }
    });
    makeDraggable(tip, header, POS_KEY_OVERLAY);

    applyTheme(tip, prefs.theme);
    requestAnimationFrame(()=> tip.classList.add("marketguard-in"));
    return tip;
  }

  function applyTheme(tip, theme) {
    tip.classList.toggle("mg-theme-light", theme === "glass-light");
  }

  function applyPrefsToOverlay(tip) {
    applyTheme(tip, prefs.theme);
    const thr = qs("[data-mg-thr]", tip); if (thr) thr.textContent = `${pct(prefs.threshold)}%`;
    const mode= qs("[data-mg-mode]", tip); if (mode) mode.textContent = prefs.defaultMode;
    const thm = qs("[data-mg-theme]", tip); if (thm) thm.textContent = prefs.theme;

    const r = qs("#mg-threshold", tip), rv = qs("#mg-threshold-val", tip);
    if (r && rv) { r.value = String(prefs.threshold); rv.textContent = `${pct(prefs.threshold)}%`; r.oninput = () => rv.textContent = `${pct(r.value)}%`; }
    const m = qs("#mg-mode", tip);  if (m) m.value = prefs.defaultMode;
    const t = qs("#mg-theme", tip); if (t) t.value = prefs.theme;
  }

  function updateOverlay(json) {
    const tip = buildOverlayShell();
    applyPrefsToOverlay(tip);

    const riskEl = qs("[data-ss-risk]", tip);
    if (riskEl) riskEl.textContent = `MarketGuard Risk: ${(json.risk||'').toUpperCase()} (${pct(json.score)}%)`;

    const isHigh = String(json.risk||"").toUpperCase() === "HIGH";
    tip.classList.toggle("marketguard-pulse", isHigh);

    const langChip = qs("[data-mg-lang]", tip);
    const lang = (json.lang || json.language || json?.meta?.lang || "EN").toUpperCase();
    const lconf = json.lang_confidence ?? json.langScore ?? null;
    langChip.textContent = `Lang: ${lang}${lconf!=null ? ` (${pct(lconf)}%)` : ""}`;

    drawSparklineInto(qs("#mg-sparkline", tip));

    const countLabel = tip.querySelector(".ss-left-actions span:last-child");
    updateHighlightCount(countLabel);
  }

  function removeOverlayIfAny() {
    const tip = qs(".marketguard-tooltip");
    if (tip) { tip.classList.add("marketguard-out"); setTimeout(()=>tip.remove(),220); }
  }

  // ====== ADVISOR CARD ======
  async function handleAdvisorVerify() {
    const q = (getSelection()?.toString() || "").trim();
    if (!q) return alert("Select a name/handle first.");
    try {
      const res = await fetch(`${REG_API}?nameOrHandle=${encodeURIComponent(q)}`);
      const data = await res.json();
      const box = qs("#mg-advisor"); if (!box) return;
      if (data?.matches?.length) {
        const m = data.matches[0] || {};
        const { name, type, status, link, reg_no, validity, valid_till, photo } = m;
        box.style.display="block";
        box.innerHTML = `
          <div style="display:flex; gap:10px; align-items:center;">
            <div style="width:44px; height:44px; border-radius:10px; overflow:hidden; background:#223;">
              ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;">`
                      : `<div style="display:grid;place-items:center;width:100%;height:100%;color:#9fb4ff;font-weight:800;">${(name||'?').slice(0,1).toUpperCase()}</div>`}
            </div>
            <div style="flex:1;">
              <div style="font-weight:800">${name || "Unknown"}</div>
              <div style="opacity:.85; font-size:12px;">${type || ""} • <b>${status || ""}</b></div>
              <div style="opacity:.85; font-size:12px;">${reg_no ? `SEBI ID: ${reg_no} • `: ""}${valid_till ? `Valid till: ${valid_till}` : (validity || "")}</div>
            </div>
            ${link ? `<a href="${link}" target="_blank" class="ss-btn" style="text-decoration:none;">Open Registry</a>` : ""}
          </div>`;
      } else {
        box.style.display="block";
        box.innerHTML = `<div style="font-weight:700">No registry match found for “${q}”.</div>`;
      }
    } catch { alert("Verify error"); }
  }

  // ====== HIGHLIGHT NAV ======
  function getFlagMarks() {
    return qsa('mark.marketguard[data-mg-flag="1"]').filter(el => document.contains(el));
  }
  function updateHighlightCount(labelEl) {
    const list = getFlagMarks(); const count = list.length;
    if (count===0) { if (labelEl) labelEl.textContent = "No highlights"; highlightIndex = -1; return; }
    if (highlightIndex < 0) highlightIndex = 0;
    if (labelEl) labelEl.textContent = `${highlightIndex+1}/${count}`;
  }
  function navigateHighlight(dir, labelEl) {
    const list = getFlagMarks(); const count = list.length;
    if (!count) { if (labelEl) labelEl.textContent = "No highlights"; return; }
    if (list[highlightIndex]) list[highlightIndex].classList.remove("mg-active");
    highlightIndex = (highlightIndex + dir + count) % count;
    const target = list[highlightIndex];
    target.classList.add("mg-active");
    target.scrollIntoView({behavior:"smooth", block:"center"});
    updateHighlightCount(labelEl);
  }

  // ====== HISTORY/SPARKLINE ======
  async function pushHistory(score) {
    if (isNaN(score)) return;
    const hist = await loadLocal(HISTORY_KEY, []);
    hist.push({t: nowTs(), s: Number(score)});
    while (hist.length > 20) hist.shift();
    await saveLocal(HISTORY_KEY, hist);
  }
  async function drawSparklineInto(container) {
    if (!container) return;
    const hist = await loadLocal(HISTORY_KEY, []);
    const W = Math.max(container.clientWidth || 280, 180), H = 40, P = 3;
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.display="block";
    const n = hist.length;
    if (n <= 1) { svg.innerHTML = `<text x="8" y="${H-10}" fill="currentColor" opacity=".7" font-size="11">No history yet</text>`; container.innerHTML=""; container.appendChild(svg); return; }
    const step = (W - P*2) / (n - 1);
    const pts = hist.map((h,i)=>`${(P+i*step).toFixed(1)},${(H-P-(H-P*2)*clamp(h.s,0,1)).toFixed(1)}`);
    svg.innerHTML = `<polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".9"/>`;
    container.innerHTML=""; container.appendChild(svg);
  }

  // ====== PREFS ======
  async function loadPrefs() {
    const saved = await loadSync(PREFS_KEY, null);
    if (saved && typeof saved === "object") prefs = { ...DEFAULT_PREFS, ...saved };
  }

  // Apply threshold logic and show/hide overlay
  function updateAutoShow(json) {
    const score = Number(json.score||0);
    const allow = (score >= prefs.threshold) || forceShowOverlay || (prefs.defaultMode === "expanded" && !overlayClosed);
    if (allow && !overlayClosed) updateOverlay(json);
    else removeOverlayIfAny();
  }

  // ====== MAIN SCAN ======
  async function runScan() {
    if (isScanning) return; isScanning = true;

    await ensureFab();

    // 1) decorate text (skip editable areas)
    const nodes = collectTextNodes(document.body);
    nodes.forEach(n => highlightMatches(n, UPI_REGEX, "upi"));
    const phraseRegex = new RegExp("\\b(" + RISK_TERMS.map(t => t.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")).join("|") + ")\\b", "ig");
    nodes.forEach(n => highlightMatches(n, phraseRegex, "risk"));

    // 2) NLP
    try {
      const sample = (document.body.innerText || "").slice(0, 4000);
      const res = await fetch(NLP_API, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ lang:"en", text: sample, metadata:{source:"webpage", url:location.href} }) });
      const json = await res.json();
      lastRiskJson = json;

      setFabScore(Number(json.score||0), String(json.risk||""));
      await pushHistory(Number(json.score||0));

      const tip = qs(".marketguard-tooltip"); if (tip) drawSparklineInto(qs("#mg-sparkline", tip));
      updateAutoShow(json);
    } catch { /* ignore */ } finally { isScanning = false; }
  }

  // ====== OBSERVER (debounce; pause while typing in editable) ======
  function startObserver() {
    const observer = new MutationObserver(() => {
      // if focused element is editable, wait a bit longer (avoid typing glitches)
      const focused = document.activeElement;
      const delay = isEditable(focused) ? 900 : 300;
      if (isScanning) return;
      clearTimeout(observer._t);
      observer._t = setTimeout(runScan, delay);
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  // ====== INIT ======
  (async function init() {
    await loadPrefs();

    if (prefs.defaultMode === "expanded") { overlayClosed = false; updateOverlay({risk:"—", score:0, lang:"en"}); }
    await runScan();
    startObserver();

    // Force-show from toolbar
    try {
      chrome.runtime?.onMessage.addListener((msg) => {
        if (msg && msg.type === "MARKETGUARD_FORCE_SHOW") {
          forceShowOverlay = true; overlayClosed = false;
          if (lastRiskJson) updateOverlay(lastRiskJson); else runScan();
        }
      });
    } catch {}

    // Live-apply settings changes from other tabs/windows
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[PREFS_KEY]) {
          const next = changes[PREFS_KEY].newValue || {};
          prefs = { ...DEFAULT_PREFS, ...next };
          const tip = qs(".marketguard-tooltip");
          if (tip) applyPrefsToOverlay(tip);
          if (lastRiskJson) updateAutoShow(lastRiskJson);
        }
      });
    } catch {}
  })();

})();

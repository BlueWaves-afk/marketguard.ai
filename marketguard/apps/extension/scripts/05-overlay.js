// Overlay UI (draggable), settings, advisor card, highlight nav, sparkline
(() => {
  const MG = window.MG;
  const { POS_OVERLAY, PREFS, HISTORY } = MG.KEYS;

  function applyTheme(tip, theme) {
    tip.classList.toggle("mg-theme-light", theme === "glass-light");
  }

  function applyPrefsToOverlay(tip) {
    const { prefs } = MG.state;
    applyTheme(tip, prefs.theme);
    const t = MG.qs("[data-mg-thr]", tip); if (t) t.textContent = `${MG.pct(prefs.threshold)}%`;
    const m = MG.qs("[data-mg-mode]", tip); if (m) m.textContent = prefs.defaultMode;
    const th= MG.qs("[data-mg-theme]", tip); if (th) th.textContent = prefs.theme;

    const r = MG.qs("#mg-threshold", tip), rv = MG.qs("#mg-threshold-val", tip);
    if (r && rv) { r.value = String(prefs.threshold); rv.textContent = `${MG.pct(prefs.threshold)}%`; r.oninput = () => rv.textContent = `${MG.pct(r.value)}%`; }
    const mo = MG.qs("#mg-mode", tip);  if (mo) mo.value  = prefs.defaultMode;
    const thm= MG.qs("#mg-theme", tip); if (thm) thm.value = prefs.theme;
  }

  MG.buildOverlayShell = function buildOverlayShell() {
    let tip = MG.qs(".marketguard-tooltip");
    if (tip) return tip;

    tip = document.createElement("div");
    tip.className = "marketguard-tooltip";
    document.body.appendChild(tip);

    // header
    const header = document.createElement("div"); header.className = "ss-header";
    const avatar = document.createElement("div"); avatar.className = "ss-avatar";
    avatar.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#9fb4ff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#7fa0ff" opacity=".65"/></svg>`;
    header.appendChild(avatar);

    const title = document.createElement("h3"); title.className="ss-title"; title.textContent="MarketGuard Advisor Check"; header.appendChild(title);
    const langChip = document.createElement("span"); langChip.className="ss-chip"; langChip.setAttribute("data-mg-lang",""); langChip.style.marginLeft="auto"; header.appendChild(langChip);

    const gear = document.createElement("div"); gear.className="ss-gear"; gear.title="Settings"; gear.textContent="⚙"; header.appendChild(gear);
    const close= document.createElement("div"); close.className="ss-close"; close.title="Close"; close.textContent="×";
    close.onclick = () => { tip.classList.add("marketguard-out"); MG.state.overlayClosed=true; MG.state.forceShowOverlay=false; setTimeout(()=>tip.remove(),220); };
    header.appendChild(close);

    tip.appendChild(header);

    // body
    const body = document.createElement("div");
    body.className = "ss-body";
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

    // actions
    const actions = document.createElement("div"); actions.className="ss-actions";
    const left = document.createElement("div"); left.className="ss-left-actions";
    const prev = document.createElement("button"); prev.className="ss-nav-btn"; prev.textContent="◀ Prev";
    const next = document.createElement("button"); next.className="ss-nav-btn"; next.textContent="Next ▶";
    const count = document.createElement("span"); count.style.opacity=".8"; count.style.fontSize="12px";
    left.appendChild(prev); left.appendChild(next); left.appendChild(count);

    const right = document.createElement("div");
    const report = document.createElement("button"); report.className="ss-btn ss-btn--danger"; report.textContent="Report to SEBI (SCORES)"; report.onclick=()=>window.open("https://scores.sebi.gov.in/","_blank");
    const verifyBtn = document.createElement("button"); verifyBtn.className="ss-btn"; verifyBtn.textContent="Verify Advisor (select text)"; verifyBtn.onclick=()=>MG.handleAdvisorVerify();
    right.appendChild(report); right.appendChild(verifyBtn);

    actions.appendChild(left); actions.appendChild(right);
    tip.appendChild(Object.assign(document.createElement("div"), { className:"ss-divider" }));
    tip.appendChild(actions);

    // settings handlers
    applyPrefsToOverlay(tip);
    MG.qs(".ss-gear", tip).onclick = () => {
      const pane = MG.qs("#mg-settings", tip);
      pane.style.display = pane.style.display === "none" ? "block" : "none";
    };
    MG.qs("#mg-settings .mg-save", tip).onclick = async () => {
      const thr  = parseFloat(MG.qs("#mg-threshold", tip).value);
      const mode = MG.qs("#mg-mode", tip).value;
      const theme= MG.qs("#mg-theme", tip).value;
      MG.state.prefs = { threshold: thr, defaultMode: mode, theme };
      await MG.saveSync(PREFS, MG.state.prefs);
      applyPrefsToOverlay(tip);
      if (MG.state.lastRiskJson) MG.updateAutoShow(MG.state.lastRiskJson);
    };

    // nav handlers
    prev.onclick = () => MG.navigateHighlight(-1, count);
    next.onclick = () => MG.navigateHighlight(+1, count);

    // restore position
    MG.loadLocal(POS_OVERLAY, null).then(pos => {
      if (pos && typeof pos.left==="number" && typeof pos.top==="number") {
        tip.style.left = pos.left+"px"; tip.style.top = pos.top+"px";
        tip.style.right="auto"; tip.style.bottom="auto";
      }
    });
    MG.makeDraggable(tip, header, POS_OVERLAY);

    requestAnimationFrame(() => tip.classList.add("marketguard-in"));
    return tip;
  };

  MG.updateOverlay = function updateOverlay(json) {
    const tip = MG.buildOverlayShell();
    applyPrefsToOverlay(tip);

    const riskEl = MG.qs("[data-ss-risk]", tip);
    if (riskEl) riskEl.textContent = `MarketGuard Risk: ${(json.risk||'').toUpperCase()} (${MG.pct(json.score)}%)`;

    const isHigh = String(json.risk||"").toUpperCase() === "HIGH";
    tip.classList.toggle("marketguard-pulse", isHigh);

    const langChip = MG.qs("[data-mg-lang]", tip);
    const lang = (json.lang || json.language || json?.meta?.lang || "EN").toUpperCase();
    const lconf = json.lang_confidence ?? json.langScore ?? null;
    langChip.textContent = `Lang: ${lang}${lconf!=null ? ` (${MG.pct(lconf)}%)` : ""}`;

    MG.drawSparklineInto(MG.qs("#mg-sparkline", tip));
    const label = tip.querySelector(".ss-left-actions span:last-child");
    MG.updateHighlightCount(label);
  };

  MG.removeOverlayIfAny = function removeOverlayIfAny() {
    const tip = MG.qs(".marketguard-tooltip");
    if (tip) { tip.classList.add("marketguard-out"); setTimeout(() => tip.remove(), 220); }
  };

  // advisor card
  MG.handleAdvisorVerify = async function handleAdvisorVerify() {
    const q = (getSelection()?.toString() || "").trim();
    if (!q) return alert("Select a name/handle first.");
    try {
      const r = await fetch(`${MG.API.REG}?nameOrHandle=${encodeURIComponent(q)}`);
      const data = await r.json();
      const box = MG.qs("#mg-advisor"); if (!box) return;
      if (data?.matches?.length) {
        const m = data.matches[0] || {};
        const { name, type, status, link, reg_no, validity, valid_till, photo } = m;
        box.style.display = "block";
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
  };

  // highlight nav
  MG.getFlagMarks = () =>
    MG.qsa('mark.marketguard[data-mg-flag="1"]').filter(el => document.contains(el));

  MG.updateHighlightCount = (labelEl) => {
    const list = MG.getFlagMarks(); const count = list.length;
    if (!count) { if (labelEl) labelEl.textContent = "No highlights"; MG.state.highlightIndex = -1; return; }
    if (MG.state.highlightIndex < 0) MG.state.highlightIndex = 0;
    if (labelEl) labelEl.textContent = `${MG.state.highlightIndex+1}/${count}`;
  };

  MG.navigateHighlight = (dir, labelEl) => {
    const list = MG.getFlagMarks(); const count = list.length;
    if (!count) { if (labelEl) labelEl.textContent = "No highlights"; return; }
    if (list[MG.state.highlightIndex]) list[MG.state.highlightIndex].classList.remove("mg-active");
    MG.state.highlightIndex = (MG.state.highlightIndex + dir + count) % count;
    const target = list[MG.state.highlightIndex];
    target.classList.add("mg-active");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    MG.updateHighlightCount(labelEl);
  };

  // history sparkline
  MG.pushHistory = async (score) => {
    if (isNaN(score)) return;
    const hist = await MG.loadLocal(HISTORY, []);
    hist.push({ t: MG.nowTs(), s: Number(score) });
    while (hist.length > 20) hist.shift();
    await MG.saveLocal(HISTORY, hist);
  };

  MG.drawSparklineInto = async (container) => {
    if (!container) return;
    const hist = await MG.loadLocal(HISTORY, []);
    const W = Math.max(container.clientWidth || 280, 180), H = 40, P = 3;
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.display="block";
    if (hist.length <= 1) {
      svg.innerHTML = `<text x="8" y="${H-10}" fill="currentColor" opacity=".7" font-size="11">No history yet</text>`;
      container.innerHTML = ""; container.appendChild(svg); return;
    }
    const step = (W - P*2) / (hist.length - 1);
    const pts = hist.map((h,i)=>`${(P+i*step).toFixed(1)},${(H-P-(H-P*2)*MG.clamp(h.s,0,1)).toFixed(1)}`);
    svg.innerHTML = `<polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".9"/>`;
    container.innerHTML = ""; container.appendChild(svg);
  };

  MG.applyTheme = applyTheme;
  MG.applyPrefsToOverlay = applyPrefsToOverlay;
})();

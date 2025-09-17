// scripts/new/explain.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---------- tiny utils ----------
  const ESC = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
  const as01 = (t) => (t > 1 ? t / 100 : t);

  function getElByMgid(mgid) {
    try { return mgid ? document.querySelector(`[data-mg-id="${CSS.escape(mgid)}"]`) : null; }
    catch { return null; }
  }
  function getNodeContext(el, max = 800) {
    if (!el) return "";
    const text = (el.innerText || el.textContent || "")
      .replace(/\s+\n/g, "\n")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (text.length >= 40) return text.slice(0, max);
    const parent = el.closest("section,article,div,p,li") || el.parentElement;
    const pt = parent && parent !== el ? (parent.innerText || parent.textContent || "") : "";
    return (text + "\n" + pt).slice(0, max);
  }

  // ---------- styles ----------
  MG.injectExplainStyles = function () {
    if (document.getElementById("mg-explain-style")) return;
    const st = document.createElement("style");
    st.id = "mg-explain-style";
    st.textContent = `
      @keyframes mgExplainFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes mgExplainSheetIn { from { transform: translateY(20px) scale(.98) } to { transform: translateY(0) scale(1) } }
      @keyframes mgExplainSheetOut { from { transform: translateY(0) scale(1); opacity:1 } to { transform: translateY(20px) scale(.98); opacity:0 } }
      .mg-explain-overlay { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.4); backdrop-filter: blur(20px) saturate(1.6); animation: mgExplainFade .18s ease; }
      .mg-explain-sheet { width: min(560px, 94vw); max-height: min(82vh, 640px); overflow: hidden; border-radius: 24px; position: relative; box-shadow: 0 24px 60px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.1) inset; background: rgba(28,28,30,.95); color: #fff; display: flex; flex-direction: column; border: 0.5px solid rgba(255,255,255,.15); animation: mgExplainSheetIn .22s cubic-bezier(.34,1.56,.64,1); }
      .mg-explain-sheet.mg-light { background: rgba(255,255,255,.95); color: #000; border-color: rgba(0,0,0,.1); box-shadow: 0 24px 60px rgba(0,0,0,.15), 0 1px 0 rgba(255,255,255,.6) inset; }
      .mg-explain-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 0.5px solid rgba(255,255,255,.08); }
      .mg-explain-sheet.mg-light .mg-explain-header { border-bottom-color: rgba(0,0,0,.08) }
      .mg-explain-title { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.2px; }
      .mg-explain-close { width: 32px; height: 32px; border-radius: 16px; border: none; background: rgba(120,120,128,.16); color: inherit; font-weight: 600; font-size: 18px; display: grid; place-items: center; cursor: pointer; transition: all .15s ease; }
      .mg-explain-close:hover { transform: scale(1.05); background: rgba(120,120,128,.24); }
      .mg-explain-body { padding: 12px 18px 18px; overflow-y: auto; }
      .mg-explain-loading { opacity: .8; font-size: 14px; }
      .mg-explain-text { white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
      .mg-flag { margin:10px 0; padding:10px; border-radius:12px; background: rgba(255,255,255,.06); }
      .mg-flag h4 { margin:0 0 6px 0; font-size: 13px; opacity:.9; }
      .mg-flag p { margin:0; opacity:.9; font-size: 13px; }
      .mg-explain-controls { display:flex; gap:8px; align-items:center; margin: 0 18px 8px; }
      .mg-explain-chip { font-size:12px; opacity:.9; padding:4px 8px; border-radius:999px; background: rgba(255,255,255,.08); }
      .mg-explain-link { cursor:pointer; text-decoration: underline; opacity:.9; }
    `;
    document.head.appendChild(st);
  };

  /**
   * Open the explanation popup.
   * Options:
   *   mode: "current" | "all" (default: "current")
   *   threshold: number (0..1 or 0..100)
   */
  MG.openExplainPopup = async function ({ mode = "current", threshold } = {}) {
    MG.injectExplainStyles();

    const prefs = MG.state?.prefs || MG.DEFAULT_PREFS || { theme: "dark", threshold: 0.6 };
    const isLight = (prefs.theme === "light");
    const effThreshold = as01(typeof threshold === "number" ? threshold : Number(prefs.threshold) || 0.6);

    // Load memory (works across reloads/scans)
    const mem = (await (MG.getRiskMemory?.() || Promise.resolve(MG.state?.riskyMemory || []))) || [];
    if (!mem.length) {
      alert("No risky text stored yet. Run a scan first.");
      return;
    }

    // Select items
    let items = mem;
    if (mode === "current" && typeof MG.state?.hlIndex === "number" && mem[MG.state.hlIndex]) {
      items = [mem[MG.state.hlIndex]];
    }

    // UI skeleton
    const overlay = document.createElement("div");
    overlay.className = "mg-explain-overlay";
    const sheet = document.createElement("div");
    sheet.className = "mg-explain-sheet" + (isLight ? " mg-light" : "");
    const header = document.createElement("div");
    header.className = "mg-explain-header";
    const title = document.createElement("h3");
    title.className = "mg-explain-title";
    title.textContent = mode === "current" ? "Explanation (Selected)" : "Explanation (All flags)";
    const close = document.createElement("button");
    close.className = "mg-explain-close";
    close.textContent = "×";
    header.appendChild(title);
    header.appendChild(close);

    const controls = document.createElement("div");
    controls.className = "mg-explain-controls";
    const chip1 = document.createElement("div");
    chip1.className = "mg-explain-chip";
    chip1.textContent = `Flags: ${items.length}/${mem.length}`;
    const chip2 = document.createElement("div");
    chip2.className = "mg-explain-chip";
    chip2.textContent = `Threshold: ${pct(effThreshold)}`;
    const toggleLink = document.createElement("div");
    toggleLink.className = "mg-explain-link";
    toggleLink.textContent = mode === "current" ? "Use all flags" : "Use selected only";
    controls.appendChild(chip1);
    controls.appendChild(chip2);
    controls.appendChild(toggleLink);

    const body = document.createElement("div");
    body.className = "mg-explain-body";
    const content = document.createElement("div");
    content.className = "mg-explain-text";
    body.appendChild(content);

    sheet.appendChild(header);
    sheet.appendChild(controls);
    sheet.appendChild(body);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function destroy() {
      try {
        sheet.style.animation = "mgExplainSheetOut .18s ease both";
        setTimeout(() => { overlay.remove(); }, 180);
      } catch { try { overlay.remove(); } catch {} }
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) destroy(); });
    close.addEventListener("click", destroy);
    document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { destroy(); document.removeEventListener("keydown", onEsc); } });
    toggleLink.addEventListener("click", () => {
      destroy();
      MG.openExplainPopup({ mode: mode === "current" ? "all" : "current", threshold: effThreshold });
    });

    // Show the flags (top 10 for brevity)
    const flagsHtml = items.slice(0, 10).map((m, i) => {
      const el = getElByMgid(m.mgid);
      const ctx = getNodeContext(el, 600);
      return `
        <div class="mg-flag">
          <h4>Flag ${i + 1} • score ${pct(m.score)}</h4>
          <p>${ESC(m.text || m.rawItemText || ctx)}</p>
        </div>`;
    }).join("");
    const headerFlags = `<div style="font-weight:700; margin-bottom:6px;">Flagged text${mode==="current"?" (selected)":""}</div>`;

    // Compose the backend payload EXACTLY as GenExplainReq expects
    // 1) Build the list we’ll send as "highlights"
    const payloadItems = items
      .filter(m => m.score >= effThreshold)
      .slice(0, 25)
      .map(m => {
        const el = getElByMgid(m.mgid);
        const ctx = getNodeContext(el, 800);
        const text = (m.text || m.rawItemText || ctx || "").slice(0, 4000);
        return {
          span: text,              // snippet text for the highlight (backend is flexible)
          reason: String(m.risk || ""),
          locator: String(m.locator || ""),
          mgid: String(m.mgid || ""),
          score: Number(m.score || 0),
          url: String(m.url || location.href)
        };
      });

    // 2) Build the single "text" string (concatenated risky snippets)
    let combined = payloadItems.map(h => h.span).filter(Boolean).join("\n\n");
    combined = combined.slice(0, 12000);

    // If nothing over threshold, just show flags and bail (avoid 400)
    if (!combined) {
      content.innerHTML = `${headerFlags}${flagsHtml || "<div>No risky elements above threshold.</div>"}`;
      return;
    }

    // Loading
    content.innerHTML = '<div class="mg-explain-loading">Generating explanation…</div>';

    // Final payload – EXACT match to FastAPI GenExplainReq
    const payload = {
      text: combined,           // required by backend
      highlights: payloadItems  // optional; backend uses for extra signals
    };

    // Call service (prefer MG.services.generativeExplanation; fallback to fetch)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    async function callService() {
      if (MG.services?.generativeExplanation) {
        return await MG.services.generativeExplanation(payload);
      }
      const endpoint = MG.ENDPOINTS?.explain || "/api/nlp/v1/generative-explanation";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const ct = resp.headers.get("content-type") || "";
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (ct.includes("application/json")) return await resp.json();
      return { explanation: await resp.text() };
    }

    try {
      const resp = await callService();
      clearTimeout(t);
      const explanation = ESC(resp?.explanation || resp?.text || JSON.stringify(resp || {}, null, 2));
      const explainSection = `<div style="font-weight:700; margin:10px 0 6px;">Generated explanation</div><div>${explanation}</div>`;
      content.innerHTML = `${headerFlags}${flagsHtml}${explainSection}`;
    } catch (e) {
      clearTimeout(t);
      content.innerHTML = `${headerFlags}${flagsHtml}<div style="margin-top:10px;color:#ffb4b4;">Failed to fetch explanation. ${ESC(e.message || "")}</div>`;
    }
  };

  // convenience for your button:
  MG.explainCurrentHighlight = () => MG.openExplainPopup({ mode: "current" });
})();
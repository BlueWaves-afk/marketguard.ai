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

  // ---------- enhanced styles ----------
  MG.injectExplainStyles = function () {
    if (document.getElementById("mg-explain-style")) return;
    const st = document.createElement("style");
    st.id = "mg-explain-style";
    st.textContent = `
      /* Modern overlay with gradient backdrop */
      .mg-explain-overlay { 
        position: fixed; 
        inset: 0; 
        z-index: 2147483647; 
        display: grid; 
        place-items: center; 
        padding: 20px; 
        background: rgba(0,0,0,.5); 
        backdrop-filter: blur(10px) saturate(180%);
        -webkit-backdrop-filter: blur(10px) saturate(180%);
        animation: mgExplainFadeIn .3s cubic-bezier(0.16, 1, 0.3, 1) both;
        will-change: opacity, backdrop-filter;
      }
      
      /* Enhanced sheet with glassmorphism effect */
      .mg-explain-sheet { 
        width: min(560px, 94vw); 
        max-height: min(82vh, 640px); 
        overflow: hidden; 
        border-radius: 24px; 
        position: relative; 
        box-shadow: 
          0 25px 50px rgba(0, 0, 0, 0.25), 
          0 1px 0 rgba(255,255,255,.1) inset,
          0 0 0 1px rgba(255, 255, 255, 0.1);
        background: rgba(28, 28, 30, 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: #fff; 
        display: flex; 
        flex-direction: column; 
        border: 0.5px solid rgba(255,255,255,.15);
        animation: mgExplainSheetIn .4s cubic-bezier(0.16, 1, 0.3, 1) both;
        will-change: transform, opacity;
        transform-origin: center bottom;
      }
      
      /* Light theme adjustments */
      .mg-explain-sheet.mg-light { 
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: #000; 
        border-color: rgba(0,0,0,.1); 
        box-shadow: 
          0 25px 50px rgba(0, 0, 0, 0.15), 
          0 1px 0 rgba(255,255,255,.6) inset,
          0 0 0 1px rgba(0, 0, 0, 0.05);
      }
      
      /* Header with gradient border */
      .mg-explain-header { 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        padding: 16px 20px; 
        border-bottom: 1px solid;
        border-image: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%) 1;
        background: rgba(255, 255, 255, 0.03);
      }
      .mg-explain-sheet.mg-light .mg-explain-header { 
        border-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.08) 50%, transparent 100%) 1;
        background: rgba(0, 0, 0, 0.02);
      }
      
      /* Title with subtle glow */
      .mg-explain-title { 
        font-size: 18px; 
        font-weight: 700; 
        margin: 0; 
        letter-spacing: -0.2px; 
        background: linear-gradient(90deg, #fff, #ccc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .mg-explain-sheet.mg-light .mg-explain-title {
        background: linear-gradient(90deg, #000, #444);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      /* Enhanced close button */
      .mg-explain-close { 
        width: 32px; 
        height: 32px; 
        border-radius: 16px; 
        border: none; 
        background: rgba(120,120,128,.16); 
        color: inherit; 
        font-weight: 600; 
        font-size: 18px; 
        display: grid; 
        place-items: center; 
        cursor: pointer; 
        transition: all .2s cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform, background;
      }
      .mg-explain-close:hover { 
        transform: scale(1.1) rotate(90deg); 
        background: rgba(120,120,128,.3); 
      }
      .mg-explain-close:active {
        transform: scale(0.95) rotate(90deg);
      }
      
      /* Body with subtle scrollbar styling */
      .mg-explain-body { 
        padding: 16px 20px 20px; 
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.2) transparent;
      }
      .mg-explain-body::-webkit-scrollbar {
        width: 6px;
      }
      .mg-explain-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: 3px;
      }
      .mg-explain-body::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.3);
      }
      .mg-explain-sheet.mg-light .mg-explain-body::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.2);
      }
      .mg-explain-sheet.mg-light .mg-explain-body::-webkit-scrollbar-thumb:hover {
        background: rgba(0,0,0,0.3);
      }
      
      /* Loading animation */
      .mg-explain-loading { 
        opacity: .8; 
        font-size: 14px; 
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mg-explain-loading::after {
        content: "";
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        animation: mgExplainSpin 1s linear infinite;
      }
      .mg-explain-sheet.mg-light .mg-explain-loading::after {
        border: 2px solid rgba(0,0,0,0.2);
        border-top: 2px solid rgba(0,0,0,0.6);
      }
      
      /* Text styling */
      .mg-explain-text { 
        white-space: pre-wrap; 
        line-height: 1.5; 
        font-size: 14.5px; 
      }
      
      /* Enhanced flag cards */
      .mg-flag { 
        margin: 12px 0; 
        padding: 14px; 
        border-radius: 14px; 
        background: rgba(255,255,255,.07);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.08);
        animation: mgFlagAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        will-change: transform;
      }
      .mg-flag:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      .mg-flag h4 { 
        margin: 0 0 8px 0; 
        font-size: 13.5px; 
        opacity: .95; 
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mg-flag h4::before {
        content: "⚠️";
        font-size: 14px;
      }
      .mg-flag p { 
        margin: 0; 
        opacity: .85; 
        font-size: 13.5px; 
        line-height: 1.5;
      }
      .mg-explain-sheet.mg-light .mg-flag {
        background: rgba(0,0,0,.04);
        border: 1px solid rgba(0,0,0,0.06);
      }
      
      /* Controls with better spacing */
      .mg-explain-controls { 
        display: flex; 
        gap: 10px; 
        align-items: center; 
        margin: 0 20px 12px; 
        flex-wrap: wrap;
      }
      
      /* Enhanced chip styling */
      .mg-explain-chip { 
        font-size: 12px; 
        opacity: .9; 
        padding: 5px 10px; 
        border-radius: 999px; 
        background: rgba(255,255,255,.1);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.1);
        font-weight: 500;
      }
      .mg-explain-sheet.mg-light .mg-explain-chip {
        background: rgba(0,0,0,.08);
        border: 1px solid rgba(0,0,0,0.08);
      }
      
      /* Enhanced link styling */
      .mg-explain-link { 
        cursor: pointer; 
        text-decoration: none; 
        opacity: .9; 
        padding: 5px 0;
        font-size: 12.5px;
        font-weight: 500;
        color: #4da6ff;
        transition: all 0.2s ease;
        position: relative;
      }
      .mg-explain-link:hover {
        opacity: 1;
      }
      .mg-explain-link::after {
        content: "";
        position: absolute;
        bottom: 2px;
        left: 0;
        width: 100%;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: right;
        transition: transform 0.2s ease;
      }
      .mg-explain-link:hover::after {
        transform: scaleX(1);
        transform-origin: left;
      }
      
      /* Keyframes for animations */
      @keyframes mgExplainFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes mgExplainSheetIn {
        from { 
          transform: translateY(20px) scale(0.98); 
          opacity: 0;
        }
        to { 
          transform: translateY(0) scale(1); 
          opacity: 1;
        }
      }
      
      @keyframes mgExplainSheetOut {
        from { 
          transform: translateY(0) scale(1); 
          opacity: 1;
        }
        to { 
          transform: translateY(40px) scale(0.95); 
          opacity: 0;
        }
      }
      
      @keyframes mgExplainSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes mgFlagAppear {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Stagger animation for multiple flags */
      .mg-flag:nth-child(1) { animation-delay: 0.05s; }
      .mg-flag:nth-child(2) { animation-delay: 0.1s; }
      .mg-flag:nth-child(3) { animation-delay: 0.15s; }
      .mg-flag:nth-child(4) { animation-delay: 0.2s; }
      .mg-flag:nth-child(5) { animation-delay: 0.25s; }
      .mg-flag:nth-child(n+6) { animation-delay: 0.3s; }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .mg-explain-overlay,
        .mg-explain-sheet,
        .mg-explain-close,
        .mg-flag {
          animation: none !important;
          transition: none !important;
        }
        
        .mg-explain-loading::after {
          animation: none;
          content: "⋯";
          width: auto;
          height: auto;
          border: none;
          font-size: 18px;
        }
      }
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
      // Enhanced alert with subtle animation
      const alertEl = document.createElement("div");
      alertEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(28,28,30,0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 2147483647;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      `;
      alertEl.textContent = "No risky text stored yet. Run a scan first.";
      document.body.appendChild(alertEl);
      
      // Animate in
      requestAnimationFrame(() => {
        alertEl.style.transform = "translateX(-50%) translateY(0)";
        alertEl.style.opacity = "1";
      });
      
      // Remove after delay
      setTimeout(() => {
        alertEl.style.transform = "translateX(-50%) translateY(-20px)";
        alertEl.style.opacity = "0";
        setTimeout(() => alertEl.remove(), 300);
      }, 3000);
      
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
    close.setAttribute("aria-label", "Close explanation");
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
    toggleLink.setAttribute("role", "button");
    toggleLink.setAttribute("tabindex", "0");
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

    // Focus trap for accessibility
    const focusableElements = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (firstFocusable) firstFocusable.focus();
    
    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleTabKey);

    function destroy() {
      document.removeEventListener('keydown', handleTabKey);
      try {
        sheet.style.animation = "mgExplainSheetOut .3s cubic-bezier(0.16, 1, 0.3, 1) both";
        overlay.style.animation = "mgExplainFadeIn .3s cubic-bezier(0.16, 1, 0.3, 1) reverse both";
        setTimeout(() => { 
          if (overlay.parentNode) {
            overlay.remove(); 
          }
        }, 300);
      } catch { 
        try { 
          if (overlay.parentNode) {
            overlay.remove(); 
          }
        } catch {} 
      }
    }
    
    overlay.addEventListener("click", (e) => { 
      if (e.target === overlay) destroy();
    });
    
    close.addEventListener("click", destroy);
    
    const escHandler = function onEsc(e) { 
      if (e.key === "Escape") { 
        destroy(); 
        document.removeEventListener("keydown", onEsc); 
      } 
    };
    
    document.addEventListener("keydown", escHandler);
    
    toggleLink.addEventListener("click", () => {
      destroy();
      // Small delay to allow the exit animation to complete
      setTimeout(() => {
        MG.openExplainPopup({ mode: mode === "current" ? "all" : "current", threshold: effThreshold });
      }, 320);
    });
    
    // Also handle Enter key on toggle link for accessibility
    toggleLink.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleLink.click();
      }
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
    
    const headerFlags = `<div style="font-weight:700; margin-bottom:8px; font-size:15px;">Flagged text${mode==="current"?" (selected)":""}</div>`;

    // Compose the backend payload EXACTLY as GenExplainReq expects
    // 1) Build the list we'll send as "highlights"
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

    // Enhanced loading indicator
    content.innerHTML = '<div class="mg-explain-loading">Generating explanation</div>';

    // Final payload – EXACT match to FastAPI GenExplainReq
    const payload = {
      text: combined,           // required by backend
      highlights: payloadItems  // optional; backend uses for extra signals
    };

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
      const explainSection = `
        <div style="font-weight:700; margin:16px 0 8px; font-size:15px;">Generated explanation</div>
        <div style="line-height:1.6;">${explanation}</div>
      `;
      content.innerHTML = `${headerFlags}${flagsHtml}${explainSection}`;
    } catch (e) {
      clearTimeout(t);
      content.innerHTML = `
        ${headerFlags}${flagsHtml}
        <div style="margin-top:16px; padding:12px; border-radius:12px; background:rgba(255,100,100,0.1); color:#ffb4b4; border:1px solid rgba(255,100,100,0.2);">
          Failed to fetch explanation. ${ESC(e.message || "")}
        </div>
      `;
    }
  };

  // convenience for your button:
  MG.explainCurrentHighlight = () => MG.openExplainPopup({ mode: "current" });
})();
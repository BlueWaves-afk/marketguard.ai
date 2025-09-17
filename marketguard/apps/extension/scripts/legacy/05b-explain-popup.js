// scripts/05b-explain-popup.js
// Explain popup: styles, open/close, fetch explanation

(() => {
  const MG = (window.MG = window.MG || {});

  function injectExplainStyles() {
    if (document.getElementById("mg-explain-style")) return;
    const st = document.createElement("style");
    st.id = "mg-explain-style";
    st.textContent = `
      @keyframes mgExplainFade { from { opacity: 0; } to { opacity: 1; } }
      .mg-explain-overlay { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
        padding: env(safe-area-inset-top, 12px) 12px env(safe-area-inset-bottom, 12px);
        background: color-mix(in oklab, rgba(8,10,14,.55) 70%, rgba(8,10,14,.55));
        -webkit-backdrop-filter: blur(12px) saturate(1.2); backdrop-filter: blur(12px) saturate(1.2); animation: mgExplainFade .14s ease; }
      .mg-explain-sheet { width: min(560px, 100%); max-height: min(76vh, 720px); overflow: hidden; border-radius: 20px;
        position: relative; box-shadow: 0 20px 50px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.06) inset;
        background: linear-gradient(180deg, rgba(20,22,28,.86) 0%, rgba(14,16,22,.9) 100%); border: 1px solid rgba(255,255,255,.08);
        color: #f5f7fb; display: flex; flex-direction: column; -webkit-backdrop-filter: blur(16px) saturate(1.1);
        backdrop-filter: blur(16px) saturate(1.1); background-clip: padding-box; animation: mgSheetIn .18s cubic-bezier(.25,.9,.25,1); }
      .mg-explain-sheet.mg-light { background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(245,247,250,.96));
        color: #111; border-color: rgba(0,0,0,.08); box-shadow: 0 20px 50px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.35) inset; }
      .mg-explain-header { display: grid; grid-template-columns: 36px 1fr 28px; gap: 12px; align-items: center;
        padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
      .mg-explain-sheet.mg-light .mg-explain-header { border-bottom-color: rgba(0,0,0,.08); }
      .mg-explain-logo { width: 36px; height: 36px; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.06);
        display: grid; place-items: center; }
      .mg-explain-title { font-size: 16px; font-weight: 700; letter-spacing: .2px; }
      .mg-explain-close { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 999px;
        font-size: 18px; line-height: 1; cursor: pointer; user-select: none; background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12); transition: transform .12s ease, opacity .12s ease; }
      .mg-explain-close:hover { opacity: 1; transform: scale(1.06); }
      .mg-explain-body { padding: 12px 16px 16px 16px; overflow: auto; scrollbar-width: thin; }
      .mg-explain-meta { display: flex; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
      .mg-chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.10);
        border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(6px); }
      .mg-explain-sheet.mg-light .mg-chip { background: rgba(0,0,0,.06); border-color: rgba(0,0,0,.08); }
      .mg-explain-text { font-size: 14px; line-height: 1.55; white-space: pre-wrap; }
      .mg-explain-loading { font-size: 13px; opacity: .85; padding: 12px 0; }
      .mg-explain-error { color: #ffb4b4; font-size: 13px; padding: 8px 0; }
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

  MG.openExplainPopup = function openExplainPopup({ risk = "—", score = 0, text = "Loading...", loading = true } = {}) {
    console.log('Opening explain popup...');
    
    try {
      injectExplainStyles();
      const prefs = (MG.getPrefs && typeof MG.getPrefs === 'function') ? MG.getPrefs() : { theme: 'dark' };
      const isLight = prefs.theme === "light";

      // Remove existing popups
      const existing = document.querySelectorAll(".mg-explain-overlay");
      existing.forEach(el => { try { el.remove(); } catch {} });
      
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";

      const wrap = document.createElement("div");
      wrap.className = "mg-explain-overlay";
      wrap.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647; 
        display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(0,0,0,0.4);
        backdrop-filter: blur(12px);
      `;
      
      const sheet = document.createElement("div");
      sheet.className = "mg-explain-sheet";
      sheet.style.cssText = `
        width: min(560px, 90vw); max-height: min(80vh, 600px); 
        border-radius: 20px; overflow: hidden;
        background: ${isLight ? 'rgba(255,255,255,0.95)' : 'rgba(28,28,30,0.95)'};
        color: ${isLight ? '#000' : '#fff'};
        box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
      `;

      // Header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 16px; border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
      `;
      
      const title = document.createElement("h2");
      title.textContent = "Risk Explanation";
      title.style.cssText = `margin: 0; font-size: 20px; font-weight: 700;`;
      
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.style.cssText = `
        width: 32px; height: 32px; border-radius: 16px; border: none;
        background: rgba(120,120,128,0.16); color: inherit;
        font-size: 18px; font-weight: 600; cursor: pointer;
      `;
      
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Body
      const body = document.createElement("div");
      body.style.cssText = `padding: 0 24px 24px; overflow-y: auto;`;

      // Meta chips
      const meta = document.createElement("div");
      meta.style.cssText = `display: flex; gap: 8px; margin-bottom: 16px;`;
      
      const chipRisk = document.createElement("span");
      chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
      chipRisk.style.cssText = `
        padding: 6px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
        background: rgba(120,120,128,0.12);
      `;
      
      const chipScore = document.createElement("span");
      const scoreValue = (MG.pct && typeof MG.pct === 'function') ? MG.pct(Number(score) || 0) : Math.round((Number(score) || 0) * 100);
      chipScore.textContent = `Score: ${scoreValue}%`;
      chipScore.style.cssText = chipRisk.style.cssText;
      
      meta.appendChild(chipRisk);
      meta.appendChild(chipScore);

      // Content
      const textEl = document.createElement("div");
      textEl.style.cssText = `font-size: 14px; line-height: 1.5; white-space: pre-wrap;`;
      
      const loadingEl = document.createElement("div");
      loadingEl.textContent = "Generating explanation…";
      loadingEl.style.cssText = `font-size: 13px; opacity: 0.8; padding: 12px 0;`;
      
      const errEl = document.createElement("div");
      errEl.style.cssText = `color: #ff6b6b; font-size: 13px; padding: 8px 0; display: none;`;

      if (loading) {
        textEl.style.display = 'none';
        loadingEl.style.display = 'block';
      } else {
        textEl.textContent = text || "";
        textEl.style.display = 'block';
        loadingEl.style.display = 'none';
      }
      
      body.appendChild(meta);
      body.appendChild(loadingEl);
      body.appendChild(textEl);
      body.appendChild(errEl);
      
      sheet.appendChild(header);
      sheet.appendChild(body);
      wrap.appendChild(sheet);
      
      // Simple close function
      function close() {
        try {
          document.documentElement.style.overflow = prevOverflow || "";
          wrap.remove();
          console.log('Explain popup closed');
        } catch (e) {
          console.error('Error closing explain popup:', e);
        }
      }

      // Event listeners
      closeBtn.onclick = close;
      wrap.onclick = (e) => { if (e.target === wrap) close(); };
      document.addEventListener('keydown', function onEscape(e) {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', onEscape);
        }
      });

      // Add to DOM and show
      document.body.appendChild(wrap);
      
      // Simple fade in
      wrap.style.opacity = '0';
      requestAnimationFrame(() => {
        wrap.style.transition = 'opacity 0.2s ease';
        wrap.style.opacity = '1';
      });
      
      console.log('Explain popup created successfully');

      return {
        setData({ risk, score, text }) {
          try {
            chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
            const newScore = (MG.pct && typeof MG.pct === 'function') ? MG.pct(Number(score) || 0) : Math.round((Number(score) || 0) * 100);
            chipScore.textContent = `Score: ${newScore}%`;
            textEl.textContent = text || "";
            loadingEl.style.display = 'none';
            textEl.style.display = 'block';
            errEl.style.display = 'none';
          } catch (e) {
            console.error('Error setting popup data:', e);
          }
        },
        setError(msg) {
          try {
            loadingEl.style.display = 'none';
            textEl.style.display = 'none';
            errEl.textContent = msg || "Failed to generate explanation.";
            errEl.style.display = 'block';
          } catch (e) {
            console.error('Error setting popup error:', e);
          }
        },
        close
      };
    } catch (error) {
      console.error('Fatal error creating explain popup:', error);
      alert('Unable to open explanation popup. Please try again.');
      return { setData: () => {}, setError: () => {}, close: () => {} };
    }
  };

  MG.explainCurrentHighlight = async function explainCurrentHighlight() {
    const endpoint = MG?.API?.NLP_GENERATIVE_EXPLANATION;
    if (!endpoint || typeof endpoint !== "string") { alert("Generative explanation API not configured."); return; }

    const el = MG.goToHighlight(0) || (function(){ const list = MG.findHighlights(); return list.length ? list[0] : null; })();
    if (!el) { alert("No risky element to explain."); return; }

    const text = (function extractReadableTextPublic(n){ return extractReadableText(n).trim(); })(el);
    if (!text) { alert("Couldn't extract text from this element."); return; }

    const popup = MG.openExplainPopup({ loading: true, risk: MG.state?.lastRiskJson?.risk || "—", score: MG.state?.lastRiskJson?.score || 0 });

    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) { popup.setError(j?.detail || "Server error."); return; }
      popup.setData({ risk: j?.risk || "—", score: Number(j?.score || 0), text: String(j?.explanation || "").trim() || "No explanation returned." });
    } catch { popup.setError("Network error. Please try again."); }
  };
})();

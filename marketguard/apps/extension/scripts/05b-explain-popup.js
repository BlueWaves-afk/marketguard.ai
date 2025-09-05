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
    injectExplainStyles();
    const prefs = MG.getPrefs?.() || MG.getPrefs();
    const isLight = prefs.theme === "light";

    try { document.querySelectorAll(".mg-explain-overlay").forEach(n => n.remove()); } catch {}
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const wrap = document.createElement("div");
    wrap.className = "mg-explain-overlay";
    const sheet = document.createElement("div");
    sheet.className = "mg-explain-sheet" + (isLight ? " mg-light" : "");
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Risk Explanation");

    const header = document.createElement("div");
    header.className = "mg-explain-header";

    const logoBox = document.createElement("div");
    logoBox.className = "mg-explain-logo";
    const logoUrl = getLogoUrl();
    logoBox.innerHTML = logoUrl
      ? `<img src="${logoUrl}" alt="${MG.BRAND_NAME || "MarketGuard"}" style="width:28px;height:28px;border-radius:8px;" />`
      : `<div style="width:22px;height:22px;border-radius:6px;background:#999;opacity:.5;"></div>`;

    const ttl = document.createElement("div");
    ttl.className = "mg-explain-title"; ttl.textContent = "Risk Explanation";

    const closeBtn = document.createElement("button");
    closeBtn.className = "mg-explain-close"; closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close"); closeBtn.textContent = "×";

    header.appendChild(logoBox); header.appendChild(ttl); header.appendChild(closeBtn);

    const body = document.createElement("div"); body.className = "mg-explain-body";

    const meta = document.createElement("div"); meta.className = "mg-explain-meta";
    const chipRisk = document.createElement("span"); chipRisk.className = "mg-chip"; chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
    const chipScore = document.createElement("span"); chipScore.className = "mg-chip"; chipScore.textContent = `Score: ${MG.pct?.(Number(score) || 0)}%`;
    meta.appendChild(chipRisk); meta.appendChild(chipScore);

    const textEl = document.createElement("div"); textEl.className = "mg-explain-text";
    const loadingEl = document.createElement("div"); loadingEl.className = "mg-explain-loading"; loadingEl.textContent = "Generating explanation…";

    if (loading) textEl.hidden = true; else { loadingEl.hidden = true; textEl.textContent = text; }

    const errEl = document.createElement("div"); errEl.className = "mg-explain-error"; errEl.hidden = true;

    body.appendChild(meta); body.appendChild(loadingEl); body.appendChild(textEl); body.appendChild(errEl);
    sheet.appendChild(header); sheet.appendChild(body); wrap.appendChild(sheet); document.body.appendChild(wrap);

    const easing = "cubic-bezier(.25,.9,.25,1)";
    try {
      wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing, fill: "both", composite: "replace" });
      sheet.animate([{ opacity: 0, transform: "scale(.98) translateY(8px)" }, { opacity: 1, transform: "scale(1) translateY(0)" }],
                    { duration: 180, easing, fill: "both", composite: "replace" });
    } catch {}

    const focusableSel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(sheet.querySelectorAll(focusableSel)).filter(el => !el.hasAttribute('disabled'));
    let firstFocus = document.activeElement;

    const trap = (e) => {
      if (e.key !== "Tab") return;
      const list = focusables(); if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
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
      try {
        const fadeOut = wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing, fill: "both", composite: "replace" });
        const sheetOut = sheet.animate([{ opacity: 1, transform: "scale(1) translateY(0)" }, { opacity: 0, transform: "scale(.985) translateY(8px)" }],
                                       { duration: 160, easing, fill: "forwards", composite: "replace" });
        await Promise.allSettled([fadeOut.finished, sheetOut.finished]);
      } catch {}
      try { document.body.removeChild(wrap); } catch {}
      cleanup();
      if (firstFocus && typeof firstFocus.focus === "function") firstFocus.focus();
    }

    function onBackdrop(e) { if (e.target === wrap) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }

    closeBtn.addEventListener("click", close);
    wrap.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", trap);
    closeBtn.focus();

    return {
      setData({ risk, score, text }) {
        chipRisk.textContent = `Risk: ${String(risk).toUpperCase()}`;
        chipScore.textContent = `Score: ${MG.pct?.(Number(score) || 0)}%`;
        textEl.textContent = text || "";
        loadingEl.hidden = true; textEl.hidden = false; errEl.hidden = true;
      },
      setError(msg) {
        loadingEl.hidden = true; textEl.hidden = true; errEl.textContent = msg || "Failed to generate explanation."; errEl.hidden = false;
      },
      close
    };
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

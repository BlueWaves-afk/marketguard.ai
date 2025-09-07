// scripts/06-main.js
// Full-page structured scan on load and every 15s.
// Sends per-element texts to NLP; stores high-risk element locations + stable data-mg-id anchors.
(() => {
  const MG = (window.MG = window.MG || {});
  const { PREFS } = (MG.KEYS = MG.KEYS || { PREFS: "marketGuardPrefs" });

  // ---------------- Defaults & Prefs ----------------
  const FALLBACK_DEFAULTS = {
    threshold: 0.5,
    theme: "dark",
    defaultMode: "compact",
    pauseScanning: false,
  };

  function getDefaults() {
    return { ...(MG.DEFAULT_PREFS || FALLBACK_DEFAULTS) };
  }
  function ensurePrefs() {
    if (!MG.state) MG.state = {};
    if (!MG.state.prefs || typeof MG.state.prefs !== "object") {
      MG.state.prefs = getDefaults();
    }
    return MG.state.prefs;
  }
  function getPrefs() { return ensurePrefs(); }

  // ---------------- Limits (sane perf caps) ----------------
  const HEARTBEAT_MS = 3000;
  const PER_EL_CHAR_LIMIT = 800;
  const TOTAL_CHAR_BUDGET = 12000;
  const MAX_ITEMS = 500;

  // ---------------- State ----------------
  MG.state = MG.state || {};
  MG.state.isScanning = false;
  MG.state.lastRiskJson = MG.state.lastRiskJson || null;
  MG.state.highRiskElements = [];     // [{id, mgid, score, risk, locator:{cssPath,rect}, textSample}]
  MG.state.mgAnchorPrefix = "mg-anchor-";

  // ---------------- Auto-show logic ----------------
  MG.updateAutoShow = function updateAutoShow(json) {
    try {
      const prefs = getPrefs();
      const overlayClosed = !!MG.state.overlayClosed;
      const forceShowOverlay = !!MG.state.forceShowOverlay;

      const score = Number(json?.score ?? 0);
      const threshold = Number(prefs?.threshold ?? FALLBACK_DEFAULTS.threshold);
      const defaultMode = String(prefs?.defaultMode ?? FALLBACK_DEFAULTS.defaultMode);

      const allow = score >= threshold || forceShowOverlay || (defaultMode === "expanded" && !overlayClosed);

      if (allow && !overlayClosed) MG.updateOverlay?.(json || { risk: "—", score: 0 });
      else MG.removeOverlayIfAny?.();
    } catch { MG.removeOverlayIfAny?.(); }
  };

  // ---------------- Helpers ----------------
  function isVisible(el) {
    try {
      if (!(el instanceof Element)) return true;
      if (el.hidden) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch { return true; }
  }

  function textFromEditable(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return String(el.value || "");
    if (el.tagName === "INPUT") return String(el.value || "");
    if (el.hasAttribute && el.hasAttribute("contenteditable")) {
      return String(el.innerText || el.textContent || "");
    }
    return "";
  }

  function getLocator(el) {
    try {
      const parts = [];
      let n = el;
      while (n && n.nodeType === 1 && parts.length < 6) {
        let seg = n.nodeName.toLowerCase();
        if (n.id) seg += "#" + n.id;
        else {
          const cls = (n.className && typeof n.className === "string")
            ? n.className.trim().split(/\s+/).slice(0,2).join(".")
            : "";
          if (cls) seg += "." + cls;
        }
        parts.unshift(seg);
        n = n.parentElement;
      }
      const cssPath = parts.join(" > ");
      const r = el.getBoundingClientRect();
      return { cssPath, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    } catch {
      return { cssPath: "", rect: { x:0, y:0, w:0, h:0 } };
    }
  }

  // Collect a reasonable set of text-bearing elements (including editables).
  function collectElementsForScan() {
    const selector = [
      "p","div","span","li","a","td","th",
      "h1","h2","h3","h4","h5","h6","label","blockquote","figcaption",
      "button","summary","dd","dt",
      "input","textarea","[contenteditable]"
    ].join(",");

    const nodes = Array.from(document.querySelectorAll(selector));
    const items = [];
    let totalChars = 0;
    let idCounter = 0;

    for (const el of nodes) {
      if (!isVisible(el)) continue;

      let text = "";
      let type = el.tagName.toLowerCase();

      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.hasAttribute("contenteditable")) {
        text = textFromEditable(el);
        const hint = (el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim();
        if (hint) text = (text ? (text + "\n") : "") + hint;
      } else {
        text = String(el.innerText || el.textContent || "");
      }

      text = text.trim();
      if (!text) continue;

      let chunk = text.slice(0, PER_EL_CHAR_LIMIT);
      if (totalChars + chunk.length > TOTAL_CHAR_BUDGET) {
        const remaining = Math.max(0, TOTAL_CHAR_BUDGET - totalChars);
        if (remaining <= 0) break;
        chunk = chunk.slice(0, remaining);
      }

      items.push({
        id: idCounter++,
        el,
        text: chunk,
        meta: {
          type,
          locator: getLocator(el),
          url: location.href
        }
      });

      totalChars += chunk.length;
      if (items.length >= MAX_ITEMS || totalChars >= TOTAL_CHAR_BUDGET) break;
    }

    // Page-level aggregate at the end
    const pageText = (document.body?.innerText || "").trim().slice(0, Math.max(2000, PER_EL_CHAR_LIMIT));
    if (pageText) {
      items.push({
        id: idCounter++,
        el: document.body,
        text: pageText,
        meta: { type: "page", locator: { cssPath: "body", rect: { x:0,y:0,w:window.innerWidth,h:window.innerHeight } }, url: location.href }
      });
    }

    return items;
  }

  // Remove previous anchors we created
  function clearOldAnchors() {
    try {
      const sel = `[data-mg-id^="${MG.state.mgAnchorPrefix}"]`;
      document.querySelectorAll(sel).forEach((el) => el.removeAttribute("data-mg-id"));
    } catch {}
  }

  // ---------------- Main scan (every 15s + on-load) ----------------
  MG.runScan = async function runScan() {
    const prefs = getPrefs();

    await MG.ensureFab?.();

    if (prefs.pauseScanning) {
      MG.setFabScore?.(NaN, "PAUSED");
      if (MG.state?.forceShowOverlay) {
        const j = MG.state.lastRiskJson || { risk: "—", score: 0, lang: "EN" };
        MG.updateOverlay?.(j);
      }
      return;
    }

    if (MG.state.isScanning) return;
    MG.state.isScanning = true;

    try {
      // Build structured items (per element text + locator)
      const items = collectElementsForScan();

      const endpointBatch = MG?.API?.NLP_BATCH;
      const endpointSingle = MG?.API?.NLP;

      let results = null;

      if (endpointBatch && typeof endpointBatch === "string") {
        const r = await fetch(endpointBatch, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lang: "en",
            items: items.map(({ id, text, meta }) => ({ id, text, metadata: meta }))
          }),
        });
        const json = await r.json();
        results = Array.isArray(json?.results) ? json.results : [];
      } else if (endpointSingle && typeof endpointSingle === "string") {
        const r = await fetch(endpointSingle, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lang: "en",
            items: items.map(({ id, text, meta }) => ({ id, text, metadata: meta }))
          }),
        });
        const json = await r.json();
        results = Array.isArray(json?.results) ? json.results : [];
      }

      if (results) {
        // New pass → clear old anchors first
        clearOldAnchors();

        const byId = new Map(results.map(r => [r.id, r]));
        const threshold = Number(prefs?.threshold ?? FALLBACK_DEFAULTS.threshold);
        const risky = [];

        let best = { score: 0, risk: "", id: null, json: null };

        for (const item of items) {
          const res = byId.get(item.id);
          if (!res) continue;
          const score = Number(res.score || 0);

          // Assign a stable data-mg-id when risky
          if (score >= threshold && item.el && item.el.setAttribute) {
            const mgid = `${MG.state.mgAnchorPrefix}${Date.now()}-${item.id}`;
            try { item.el.setAttribute("data-mg-id", mgid); } catch {}
            risky.push({
              id: item.id,
              mgid,
              score,
              risk: String(res.risk || ""),
              locator: item.meta.locator,
              textSample: item.text.slice(0, 200)
            });
          }

          if (score > best.score) best = { score, risk: String(res.risk || ""), id: item.id, json: res };
        }

        MG.state.highRiskElements = risky;
        MG.state.lastRiskJson = best.json || { score: best.score, risk: best.risk };

        MG.setFabScore?.(best.score, String(best.risk || ""));
        await MG.pushHistory?.(best.score);

        const tip = MG.qs?.(".marketguard-tooltip");
        if (tip) MG.drawSparklineInto?.(MG.qs("#mg-sparkline", tip));

        MG.updateAutoShow(MG.state.lastRiskJson);
        // Let overlay refresh its summary if mounted
        MG.updateRiskSummary?.();
      }
    } catch {
      // ignore network/parse errors
    } finally {
      MG.state.isScanning = false;
    }
  };

  // ---------------- Heartbeat scheduler ----------------
  let heartbeatTimer = null;
  function startHeartbeat() {
    clearTimeout(heartbeatTimer);
    const tick = async () => {
      try { await MG.runScan(); } finally {
        heartbeatTimer = setTimeout(tick, HEARTBEAT_MS);
      }
    };
    heartbeatTimer = setTimeout(tick, HEARTBEAT_MS);
  }

  // ---------------- Init ----------------
  (async function init() {
    ensurePrefs();

    try {
      const saved = await MG.loadSync?.(PREFS, null);
      MG.state.prefs = { ...getDefaults(), ...(saved || {}) };
    } catch { MG.state.prefs = { ...getDefaults() }; }

    MG.initSelectionGuards?.();

    if ((MG.state.prefs.defaultMode || "compact") === "expanded") {
      MG.state.overlayClosed = false;
      MG.updateOverlay?.({ risk: "—", score: 0, lang: "EN" });
    }

    await MG.ensureFab?.();

    await MG.runScan();
    startHeartbeat();

    try {
      chrome.runtime?.onMessage.addListener((msg) => {
        if (msg?.type === "MARKETGUARD_FORCE_SHOW") {
          MG.state.forceShowOverlay = true;
          MG.state.overlayClosed = false;
          if (MG.state.lastRiskJson) MG.updateOverlay?.(MG.state.lastRiskJson);
          else MG.runScan();
        }
      });
    } catch {}

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[PREFS]) {
          MG.state.prefs = { ...getDefaults(), ...(changes[PREFS].newValue || {}) };
          const tip = MG.qs?.(".marketguard-tooltip");
          if (tip) MG.applyPrefsToOverlay?.(tip);
          if (MG.state.lastRiskJson) MG.updateAutoShow(MG.state.lastRiskJson);
          MG.updateRiskSummary?.();
        }
      });
    } catch {}

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) MG.runScan();
    });
  })();
})();

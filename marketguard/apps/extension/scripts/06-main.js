// Orchestrates scan, thresholded auto-show, observers, messaging, live settings
(() => {
  const MG = window.MG;
  const { PREFS } = MG.KEYS;

  MG.updateAutoShow = function updateAutoShow(json) {
    const { prefs, overlayClosed, forceShowOverlay } = MG.state;
    const score = Number(json.score || 0);
    const allow = (score >= prefs.threshold) || forceShowOverlay || (prefs.defaultMode === "expanded" && !overlayClosed);
    if (allow && !overlayClosed) MG.updateOverlay(json);
    else MG.removeOverlayIfAny();
  };

  MG.runScan = async function runScan() {
    if (MG.state.isScanning) return;
    MG.state.isScanning = true;

    await MG.ensureFab();

    // decorate text
    const nodes = MG.collectTextNodes(document.body);
    nodes.forEach(n => MG.highlightMatches(n, MG.UPI_REGEX, "upi"));
    const phrase = MG.getPhraseRegex();
    nodes.forEach(n => MG.highlightMatches(n, phrase, "risk"));

    // NLP
    try {
      const sample = (document.body.innerText || "").slice(0, 4000);
      const r = await fetch(MG.API.NLP, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "en", text: sample, metadata: { source: "webpage", url: location.href } })
      });
      const json = await r.json();
      MG.state.lastRiskJson = json;

      MG.setFabScore(Number(json.score||0), String(json.risk||""));
      await MG.pushHistory(Number(json.score||0));
      const tip = MG.qs(".marketguard-tooltip");
      if (tip) MG.drawSparklineInto(MG.qs("#mg-sparkline", tip));

      MG.updateAutoShow(json);
    } catch {} finally {
      MG.state.isScanning = false;
    }
  };

  function startObserver() {
    const observer = new MutationObserver(() => {
      const focused = document.activeElement;
      const delay = MG.isEditable(focused) ? 900 : 300; // debounce more while typing
      if (MG.state.isScanning) return;
      clearTimeout(observer._t);
      observer._t = setTimeout(MG.runScan, delay);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  (async function init() {
    // load prefs
    const saved = await MG.loadSync(PREFS, null);
    if (saved && typeof saved === "object") MG.state.prefs = { ...MG.DEFAULT_PREFS, ...saved };

    // optional pre-open
    if (MG.state.prefs.defaultMode === "expanded") {
      MG.state.overlayClosed = false;
      MG.updateOverlay({ risk: "—", score: 0, lang: "EN" });
    }

    await MG.runScan();
    startObserver();

    // toolbar force-show
    try {
      chrome.runtime?.onMessage.addListener((msg) => {
        if (msg && msg.type === "MARKETGUARD_FORCE_SHOW") {
          MG.state.forceShowOverlay = true;
          MG.state.overlayClosed = false;
          if (MG.state.lastRiskJson) MG.updateOverlay(MG.state.lastRiskJson);
          else MG.runScan();
        }
      });
    } catch {}

    // live settings across tabs
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[PREFS]) {
          MG.state.prefs = { ...MG.DEFAULT_PREFS, ...(changes[PREFS].newValue || {}) };
          const tip = MG.qs(".marketguard-tooltip");
          if (tip) MG.applyPrefsToOverlay(tip);
          if (MG.state.lastRiskJson) MG.updateAutoShow(MG.state.lastRiskJson);
        }
      });
    } catch {}
  })();
})();

// scripts/06-main.js
// Orchestrates scan, thresholded auto-show, observers, messaging, live settings
(() => {
  const MG = (window.MG = window.MG || {});
  const { PREFS } = (MG.KEYS = MG.KEYS || { PREFS: "marketGuardPrefs" });

  // Always-available defaults even if 00-constants.js didn’t load
  const FALLBACK_DEFAULTS = {
    threshold: 0.5,
    theme: "dark",
    defaultMode: "compact",
    pauseScanning: false,
  };

  function getDefaults() {
    return { ...(MG.DEFAULT_PREFS || FALLBACK_DEFAULTS) };
  }

  // Ensure prefs object always exists
  function ensurePrefs() {
    if (!MG.state) MG.state = {};
    if (!MG.state.prefs || typeof MG.state.prefs !== "object") {
      MG.state.prefs = getDefaults();
    }
    return MG.state.prefs;
  }

  function getPrefs() {
    return ensurePrefs();
  }

  // ---------- Auto-show logic (bullet-proof)
  MG.updateAutoShow = function updateAutoShow(json) {
    try {
      const prefs = getPrefs(); // never undefined
      const overlayClosed = !!MG.state.overlayClosed;
      const forceShowOverlay = !!MG.state.forceShowOverlay;

      const score = Number(json?.score ?? 0);
      const threshold = Number(prefs?.threshold ?? FALLBACK_DEFAULTS.threshold);
      const defaultMode = String(prefs?.defaultMode ?? FALLBACK_DEFAULTS.defaultMode);

      const allow =
        score >= threshold ||
        forceShowOverlay ||
        (defaultMode === "expanded" && !overlayClosed);

      if (allow && !overlayClosed) MG.updateOverlay?.(json || { risk: "—", score: 0 });
      else MG.removeOverlayIfAny?.();
    } catch {
      // Never crash on timing issues
      MG.removeOverlayIfAny?.();
    }
  };

  // ---------- Main scan
  MG.runScan = async function runScan() {
    const prefs = getPrefs();

    // Always ensure the FAB exists so users can unpause later
    await MG.ensureFab?.();

    // If paused, reflect in FAB and (if forced) open overlay shell
    if (prefs.pauseScanning) {
    MG.setFabScore?.(NaN, "PAUSED");

    if (MG.state?.forceShowOverlay) {
        const j = MG.state.lastRiskJson || { risk: "—", score: 0, lang: "EN" };
        MG.updateOverlay?.(j);
    }
    return;
    }

    // Selection / concurrent guards
    if (MG.isSelectionLocked?.() || MG.hasActiveSelection?.()) return;
    if (MG.state.isScanning) return;
    MG.state.isScanning = true;

    // Decorate text
    const nodes = MG.collectTextNodes?.(document.body) || [];
    nodes.forEach((n) => MG.highlightMatches?.(n, MG.UPI_REGEX, "upi"));
    const phrase = MG.getPhraseRegex?.();
    nodes.forEach((n) => MG.highlightMatches?.(n, phrase, "risk"));

    // NLP call
    try {
      const sample = (document.body?.innerText || "").slice(0, 4000);
      const endpoint = MG?.API?.NLP;
      if (endpoint && typeof endpoint === "string") {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: "en", text: sample, metadata: { source: "webpage", url: location.href } }),
        });
        const json = await r.json();
        MG.state.lastRiskJson = json;

        MG.setFabScore?.(Number(json.score || 0), String(json.risk || ""));
        await MG.pushHistory?.(Number(json.score || 0));

        const tip = MG.qs?.(".marketguard-tooltip");
        if (tip) MG.drawSparklineInto?.(MG.qs("#mg-sparkline", tip));

        MG.updateAutoShow(json);
      }
    } catch {
      // ignore network/parse failures
    } finally {
      MG.state.isScanning = false;
    }
  };

  // ---------- DOM observer (debounced, respects pause/selection)
  function startObserver() {
    // body guard (rare)
    if (!document || !document.body) {
      setTimeout(startObserver, 200);
      return;
    }
    const observer = new MutationObserver(() => {
      const prefs = getPrefs();
      if (prefs.pauseScanning) return; // keep FAB shown by init/runScan; we just skip scans

      if (MG.isSelectionLocked?.() || MG.hasActiveSelection?.()) {
        clearTimeout(observer._t);
        observer._t = setTimeout(MG.runScan, 1200);
        return;
      }
      const focused = document.activeElement;
      const delay = MG.isEditable?.(focused) ? 900 : 300; // more debounce while typing
      if (MG.state.isScanning) return;
      clearTimeout(observer._t);
      observer._t = setTimeout(MG.runScan, delay);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- Init
  (async function init() {
    // seed prefs first so they're always present
    ensurePrefs();

    // Load saved prefs (merge with defaults)
    try {
      const saved = await MG.loadSync?.(PREFS, null);
      MG.state.prefs = { ...getDefaults(), ...(saved || {}) };
    } catch {
      MG.state.prefs = { ...getDefaults() };
    }

    // Selection guards (prevents losing selection while scanning)
    MG.initSelectionGuards?.();

    // Optional pre-open
    if ((MG.state.prefs.defaultMode || "compact") === "expanded") {
      MG.state.overlayClosed = false;
      MG.updateOverlay?.({ risk: "—", score: 0, lang: "EN" });
    }

    // Ensure FAB exists even if paused on load
    await MG.ensureFab?.();

    await MG.runScan();
    startObserver();

    // Toolbar force-show
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

    // Live settings across tabs
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[PREFS]) {
          MG.state.prefs = { ...getDefaults(), ...(changes[PREFS].newValue || {}) };
          const tip = MG.qs?.(".marketguard-tooltip");
          if (tip) MG.applyPrefsToOverlay?.(tip);
          if (MG.state.lastRiskJson) MG.updateAutoShow(MG.state.lastRiskJson);
        }
      });
    } catch {}
  })();
})();

// scripts/04-fab.js (dynamic logo + no black fallback dot)
(() => {
  const MG = (window.MG = window.MG || {});
  MG.qs = MG.qs || ((sel, root = document) => root.querySelector(sel));

  MG.KEYS = MG.KEYS || {};
  const POS_FAB = MG.KEYS.POS_FAB || "marketGuardFabPos";
  const ONBOARD = MG.KEYS.ONBOARD || "marketGuardOnboarded";

  MG.loadLocal = MG.loadLocal || (async (_k, defv) => defv);
  MG.saveLocal = MG.saveLocal || (async (_k, _v) => {});
  MG.makeDraggable = MG.makeDraggable || (() => {});
  MG.pct = MG.pct || ((x) => Math.round((Number(x) || 0) * 100));
  MG.CUTS = MG.CUTS || { LOW: 0.34, HIGH: 0.67 };
  MG.getPrefs = MG.getPrefs || (() => (MG.state && MG.state.prefs) || { pauseScanning: false });

  function ensureState() {
    if (!MG.state) MG.state = {};
    return MG.state;
  }

  function resolveAsset(path) {
    try {
      const u = chrome?.runtime?.getURL?.(path);
      return typeof u === "string" && u.length ? u : path;
    } catch {
      return path;
    }
  }

  function getLogoUrl() {
    if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length) return MG.LOGO_URL;
    return resolveAsset("assets/logo.png");
  }

  function computeLogoSrc({ score, riskText, pausedExplicit }) {
    const prefs = MG.getPrefs?.() || ensureState().prefs || {};
    const paused = pausedExplicit || !!prefs.pauseScanning || String(riskText || "").toUpperCase() === "PAUSED";

    if (paused) {
      return resolveAsset("assets/logo-paused.png");
    }

    const isHigh =
      (!isNaN(score) && Number(score) >= (MG.CUTS?.HIGH ?? 0.67)) ||
      String(riskText || "").toUpperCase() === "HIGH";

    if (isHigh) {
      return resolveAsset("assets/logo-high-risk.png");
    }

    return getLogoUrl();
  }

  MG.updateFabLogo = function updateFabLogo() {
    const st = ensureState();
    const fab = MG.qs(".marketguard-fab");
    if (!fab) return;

    const img = MG.qs(".mg-logo img", fab);
    if (!img) return;

    const score = st.lastRiskJson?.score;
    const riskText = st.lastRiskJson?.risk;
    const prefs = MG.getPrefs?.() || st.prefs || {};
    const pausedExplicit = !!prefs.pauseScanning;

    img.src = computeLogoSrc({ score, riskText, pausedExplicit });
  };

  MG.ensureFab = async function ensureFab() {
    if (!document?.body) return;
    let fab = MG.qs(".marketguard-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.className = "marketguard-fab mg-fab-low mg-fab-with-logo";
    fab.setAttribute("role", "button");
    fab.setAttribute("aria-label", "Open MarketGuard overlay");

    const st = ensureState();
    const initialScore = st.lastRiskJson?.score;
    const initialRisk = st.lastRiskJson?.risk;
    const prefs = MG.getPrefs?.() || st.prefs || {};
    const initialPaused = !!prefs.pauseScanning;

    const initialLogoSrc = computeLogoSrc({
      score: initialScore,
      riskText: initialRisk,
      pausedExplicit: initialPaused,
    });

    fab.innerHTML = `
      <div class="mg-fab-inner">
        <div class="mg-logo">
          <img alt="MarketGuard" src="${initialLogoSrc}" />
        </div>
        <div class="mg-text">
          <div class="mg-perc">--%</div>
          <div class="mg-label">MarketGuard</div>
          <div class="mg-badge mg-badge--paused" ${initialPaused ? "" : "hidden"}>Paused</div>
        </div>
      </div>
    `;
    document.body.appendChild(fab);

    // Hide/show image fallback dynamically
    const img = MG.qs(".mg-logo img", fab);
    if (img) {
      img.onerror = () => { img.src = resolveAsset("assets/logo-fallback.png"); };
    }

    try {
      const pos = await MG.loadLocal(POS_FAB, null);
      if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
        fab.style.left = pos.left + "px";
        fab.style.top = pos.top + "px";
        fab.style.right = "auto";
        fab.style.bottom = "auto";
      }
    } catch {}

    try { MG.makeDraggable(fab, fab, POS_FAB); } catch {}

    fab.addEventListener("click", () => {
      const st = ensureState();
      st.forceShowOverlay = true;
      st.overlayClosed = false;

      const prefs = (MG.getPrefs?.() || st.prefs || {});
      const paused = !!prefs.pauseScanning;

      if (paused) {
        if (st.lastRiskJson) {
          MG.updateOverlay?.(st.lastRiskJson, { fromFabClick: true });
        } else {
          (MG.updateOverlay?.({ risk: "—", score: 0, lang: "EN" }, { fromFabClick: true }) || MG.mountOverlayShell?.({ fromFabClick: true }));
        }
        return;
      }

      if (st.lastRiskJson) {
        MG.updateOverlay?.(st.lastRiskJson, { fromFabClick: true });
      } else {
        MG.runScan?.();
      }
    });

    try {
      const onboarded = await MG.loadLocal(ONBOARD, false);
      if (!onboarded) {
        const tip = document.createElement("div");
        tip.className = "mg-tip";
        const r = fab.getBoundingClientRect();
        tip.style.left = (r.left - 8) + "px";
        tip.style.top  = (r.top - 60) + "px";
        tip.innerHTML = `Click to open MarketGuard overlay.<br/>Drag to reposition.<br/><button>Got it</button>`;
        document.body.appendChild(tip);
        tip.querySelector("button").onclick = async () => {
          tip.remove();
          try { await MG.saveLocal(ONBOARD, true); } catch {}
        };
      }
    } catch {}

    return fab;
  };

  MG.setFabScore = function setFabScore(score, riskText) {
    const fab = MG.qs(".marketguard-fab");
    if (!fab) return;

    const pct = MG.pct(score);
    const per = MG.qs(".mg-perc", fab);
    if (per) {
      const txt = isNaN(score) ? "--%" : `${pct}%`;
      per.textContent = txt;
      per.classList.toggle("long-text", txt.length > 4);
    }

    const paused = String(riskText || "").toUpperCase() === "PAUSED" ||
                   !!(MG.getPrefs?.().pauseScanning);
    fab.classList.remove("mg-fab-low", "mg-fab-med", "mg-fab-high", "mg-fab-paused");
    if (paused) {
      fab.classList.add("mg-fab-paused");
    } else {
      const { LOW, HIGH } = MG.CUTS;
      const v = Number(score) || 0;
      fab.classList.add(v >= HIGH ? "mg-fab-high" : v >= LOW ? "mg-fab-med" : "mg-fab-low");
    }

    const badge = MG.qs(".mg-badge--paused", fab);
    if (badge) badge.hidden = !paused;

    const img = MG.qs(".mg-logo img", fab);
    if (img) {
      img.src = computeLogoSrc({ score, riskText, pausedExplicit: paused });
    }

    const label = `MarketGuard risk ${isNaN(score) ? "--" : pct}%` + (riskText ? ` (${riskText})` : "");
    fab.title = label;
    fab.setAttribute("aria-label", label);

    if (String(riskText || "").toUpperCase() === "HIGH") {
      fab.style.boxShadow = "0 10px 28px rgba(255,64,64,.35), inset 0 0 0 1px rgba(255,255,255,.06)";
    } else {
      fab.style.boxShadow = "0 10px 24px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.06)";
    }
  };

  MG.refreshFabFromState = function refreshFabFromState() {
    const st = ensureState();
    MG.setFabScore(st.lastRiskJson?.score, st.lastRiskJson?.risk);
  };
})();

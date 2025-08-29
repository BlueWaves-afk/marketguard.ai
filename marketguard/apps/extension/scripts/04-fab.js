// scripts/04-fab.js (with "Paused" badge)
(() => {
  const MG = (window.MG = window.MG || {});
  MG.qs = MG.qs || ((sel, root = document) => root.querySelector(sel));

  // Safe KEYS destructure
  MG.KEYS = MG.KEYS || {};
  const POS_FAB = MG.KEYS.POS_FAB || "marketGuardFabPos";
  const ONBOARD = MG.KEYS.ONBOARD || "marketGuardOnboarded";

  // No-op fallbacks so load order never crashes
  MG.loadLocal = MG.loadLocal || (async (_k, defv) => defv);
  MG.saveLocal = MG.saveLocal || (async (_k, _v) => {});
  MG.makeDraggable = MG.makeDraggable || (() => {});
  MG.pct = MG.pct || ((x) => Math.round((Number(x) || 0) * 100));
  MG.CUTS = MG.CUTS || { LOW: 0.34, HIGH: 0.67 };

  function ensureState() {
    if (!MG.state) MG.state = {};
    return MG.state;
  }

  function getLogoUrl() {
    if (typeof MG.LOGO_URL === "string" && MG.LOGO_URL.length) return MG.LOGO_URL;
    try { return chrome?.runtime?.getURL?.("assets/logo.png") || ""; } catch { return ""; }
  }

  MG.ensureFab = async function ensureFab() {
    if (!document?.body) return; // body guard
    let fab = MG.qs(".marketguard-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.className = "marketguard-fab mg-fab-low mg-fab-with-logo";
    fab.setAttribute("role", "button");
    fab.setAttribute("aria-label", "Open MarketGuard overlay");

    const logoUrl = getLogoUrl();
    fab.innerHTML = `
      <div class="mg-fab-inner">
        <div class="mg-logo" ${logoUrl ? "" : 'data-empty="1"'} >
          ${logoUrl ? `<img alt="MarketGuard" src="${logoUrl}" />` : `
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="5"></circle>
              <path d="M3.5 20c0-4.2 3.8-7.5 8.5-7.5S20.5 15.8 20.5 20"></path>
            </svg>
          `}
        </div>
        <div class="mg-text">
          <div class="mg-perc">--%</div>
          <div class="mg-label">MarketGuard</div>
          <div class="mg-badge mg-badge--paused" hidden>Paused</div>
        </div>
      </div>
    `;
    document.body.appendChild(fab);

    // Restore position (best-effort)
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

    // Click to force-show overlay (works even when paused or no data yet)
    fab.addEventListener("click", () => {
    const st = ensureState();
    st.forceShowOverlay = true;
    st.overlayClosed = false;

    const prefs = (MG.getPrefs?.() || st.prefs || {});
    const paused = !!prefs.pauseScanning;

    if (paused) {
        // Open the overlay immediately (placeholder if no last result)
        if (st.lastRiskJson) {
        MG.updateOverlay?.(st.lastRiskJson);
        } else {
        (MG.updateOverlay?.({ risk: "—", score: 0, lang: "EN" }) || MG.mountOverlayShell?.());
        }
        return;
    }

    // Not paused: show existing or trigger a scan
    if (st.lastRiskJson) {
        MG.updateOverlay?.(st.lastRiskJson);
    } else {
        MG.runScan?.();
    }
    });

    // One-time onboarding tip (best-effort)
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

    // Buckets (skip when paused to keep styling subtle)
    const paused = String(riskText || "").toUpperCase() === "PAUSED";
    fab.classList.remove("mg-fab-low", "mg-fab-med", "mg-fab-high", "mg-fab-paused");
    if (paused) {
      fab.classList.add("mg-fab-paused");
    } else {
      const { LOW, HIGH } = MG.CUTS;
      const v = Number(score) || 0;
      fab.classList.add(v >= HIGH ? "mg-fab-high" : v >= LOW ? "mg-fab-med" : "mg-fab-low");
    }

    // Toggle tiny "Paused" badge
    const badge = MG.qs(".mg-badge--paused", fab);
    if (badge) badge.hidden = !paused;

    const label = `MarketGuard risk ${isNaN(score) ? "--" : pct}%` + (riskText ? ` (${riskText})` : "");
    fab.title = label;
    fab.setAttribute("aria-label", label);

    if ((riskText || "").toUpperCase() === "HIGH") {
      fab.style.boxShadow = "0 10px 28px rgba(255,64,64,.35), inset 0 0 0 1px rgba(255,255,255,.06)";
    } else {
      fab.style.boxShadow = "0 10px 24px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.06)";
    }
  };
})();

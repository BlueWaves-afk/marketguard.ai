// Compact floating badge (draggable) + onboarding
(() => {
  const MG = window.MG;
  const { POS_FAB, ONBOARD } = MG.KEYS;

  MG.ensureFab = async function ensureFab() {
    let fab = MG.qs(".marketguard-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.className = "marketguard-fab mg-fab-low";
    fab.innerHTML = `<div class="mg-perc">--%</div><div class="mg-label">MarketGuard</div>`;
    document.body.appendChild(fab);

    const pos = await MG.loadLocal(POS_FAB, null);
    if (pos && typeof pos.left==="number" && typeof pos.top==="number") {
      fab.style.left = pos.left + "px"; fab.style.top = pos.top + "px";
      fab.style.right = "auto"; fab.style.bottom = "auto";
    }
    MG.makeDraggable(fab, fab, POS_FAB);

    fab.addEventListener("click", () => {
      MG.state.forceShowOverlay = true;
      MG.state.overlayClosed = false;
      if (MG.state.lastRiskJson) MG.updateOverlay(MG.state.lastRiskJson);
      else MG.runScan();
    });

    const onboarded = await MG.loadLocal(ONBOARD, false);
    if (!onboarded) {
      const tip = document.createElement("div");
      tip.className = "mg-tip";
      const r = fab.getBoundingClientRect();
      tip.style.left = (r.left-8)+"px";
      tip.style.top  = (r.top-60)+"px";
      tip.innerHTML = `Click to open MarketGuard overlay.<br/>Drag to reposition.<br/><button>Got it</button>`;
      document.body.appendChild(tip);
      tip.querySelector("button").onclick = async () => { tip.remove(); await MG.saveLocal(ONBOARD, true); };
    }
    return fab;
  };

  MG.setFabScore = function setFabScore(score, riskText) {
    const fab = MG.qs(".marketguard-fab"); if (!fab) return;
    const per = MG.qs(".mg-perc", fab); if (per) per.textContent = isNaN(score) ? "--%" : `${MG.pct(score)}%`;
    fab.classList.remove("mg-fab-low","mg-fab-med","mg-fab-high");
    const { LOW, HIGH } = MG.CUTS;
    const bucket = score >= HIGH ? "high" : score >= LOW ? "med" : "low";
    fab.classList.add(`mg-fab-${bucket}`);
    if ((riskText||"").toUpperCase() === "HIGH")
      fab.style.boxShadow = "0 10px 28px rgba(255,64,64,.35), inset 0 0 0 1px rgba(255,255,255,.06)";
    else
      fab.style.boxShadow = "0 10px 24px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.06)";
  };
})();

// Global constants & defaults
(() => {
  const MG = (window.MG = window.MG || {});

  MG.API = {
    NLP:   "http://localhost:8002/api/nlp/v1/score",
    CHECK: "http://localhost:8003/api/check/v1/upi-verify",
    REG:   "http://localhost:8001/api/registry/v1/verify"
  };

  MG.DEFAULT_PREFS = {
    threshold: 0.50,
    defaultMode: "compact",           // "compact" | "expanded"
    theme: "glass-dark"               // "glass-dark" | "glass-light"
  };

  MG.CUTS = { LOW: 0.33, HIGH: 0.66 };

  MG.RISK_TERMS = [
    "guaranteed returns", "assured returns", "multibagger",
    "insider access", "FPI access", "DM me",
    "limited window", "send UPI", "double your money"
  ];
  MG.UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  MG.KEYS = {
    POS_OVERLAY: "marketGuardV2Pos::" + location.origin,
    POS_FAB:     "marketGuardFabPos::" + location.origin,
    HISTORY:     "mgHistory::" + location.origin,
    ONBOARD:     "mgOnboarded::v1",
    PREFS:       "mgPrefs::v1"
  };

  // app state (shared)
  MG.state = {
    prefs: { ...MG.DEFAULT_PREFS },
    isScanning: false,
    overlayClosed: false,
    forceShowOverlay: false,
    lastRiskJson: null,
    highlightIndex: -1
  };
})();

// scripts/00-constants.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---- API endpoints
  MG.API = {
    NLP: "http://localhost:8002/api/nlp/v1/score",
    NLP_BATCH: "http://localhost:8002/api/nlp/v1/batch-score", // added if you want batching
    NLP_GENERATIVE_EXPLANATION: "http://localhost:8002/api/nlp/v1/generative-explanation", // NEW
    CHECK_UPI: "http://localhost:8003/api/check/v1/upi-verify",
    REGISTRY: "http://localhost:8001/api/registry/v1/verify",
  };

  // ---- Storage keys
  MG.KEYS = {
    PREFS: "marketGuardPrefs",
    POS_FAB: "marketGuardFabPos",
    POS_OVERLAY: "marketGuardOverlayPos",
    ONBOARD: "marketGuardOnboard",
    HIST: "marketGuardSiteHistory",
  };

  // ---- Defaults (PAUSE ADDED HERE)
  MG.DEFAULT_PREFS = {
    threshold: 0.5,       // auto-show overlay at/above this NLP score
    theme: "dark",        // "dark" | "light"
    defaultMode: "compact",
    pauseScanning: false, // <— NEW
  };

  // ---- Buckets / cuts
  MG.CUTS = { LOW: 0.2, HIGH: 0.5 };

  // ---- Risk terms + helpers
  MG.RISK_TERMS = [
    "guaranteed returns", "assured returns", "multibagger",
    "insider access", "FPI access", "DM me",
    "limited window", "send UPI", "double your money",
  ];

  MG.getPhraseRegex = () => {
    if (MG._phraseRegex) return MG._phraseRegex;
    MG._phraseRegex = new RegExp(
      "\\b(" + MG.RISK_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
      "ig"
    );
    return MG._phraseRegex;
  };

  // ---- UPI
  MG.UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  // ---- Small helpers used everywhere
  MG.pct = (x) => Math.round((Number(x) || 0) * 100);
})();

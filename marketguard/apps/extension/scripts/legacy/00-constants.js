// scripts/00-constants.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---- Feature toggles
  MG.FEATURES = {
    MEDIA_SCAN_ENABLED: true, // toggle Media Risk card & scanning UI
  };

  // ---- API endpoints
  MG.API = {
    // NLP / text risk analysis
    NLP: "http://localhost:8002/api/nlp/v1/score",
    NLP_BATCH: "http://localhost:8002/api/nlp/v1/batch-score",
    NLP_GENERATIVE_EXPLANATION: "http://localhost:8002/api/nlp/v1/generative-explanation",

    // Advisor / registry checks
    CHECK_UPI: "http://localhost:8001/api/check/v1/upi-verify",
    SEBI_REGISTRY: "http://localhost:8001/api/registry/v1/verify",

    // Media risk / deepfake detection
    DEEPFAKE_IMAGE_DATAURL: "http://localhost:8003/api/detect/image-dataurl", // POST { data_url }
    DEEPFAKE_VIDEO_DATAURL: "http://localhost:8003/api/detect/video-dataurl", // POST { data_url }
    MEDIA_BATCH: "http://localhost:8003/api/detect/batch-media" // optional batch endpoint
  };

  // ---- Storage keys
  MG.KEYS = {
    PREFS: "marketGuardPrefs",
    POS_FAB: "marketGuardFabPos",
    POS_OVERLAY: "marketGuardOverlayPos",
    ONBOARD: "marketGuardOnboard",
    HIST: "marketGuardSiteHistory",
  };

  // ---- Defaults
  MG.DEFAULT_PREFS = {
    threshold: 0.5,       // auto-show overlay at/above this NLP score
    theme: "dark",        // "dark" | "light"
    defaultMode: "compact",
    pauseScanning: false, // allow pausing text scanning
  };

  // ---- Risk score cuts
  MG.CUTS = { LOW: 0.2, HIGH: 0.5 };

  // ---- Risk terms + helpers (text risk detection)
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

  // ---- UPI detection
  MG.UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  // ---- Small helpers
  MG.pct = (x) => Math.round((Number(x) || 0) * 100);
})();

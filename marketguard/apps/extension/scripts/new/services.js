// scripts/new/services.js
(() => {
  const MG = (window.MG = window.MG || {});

  function jsonOrEmpty(res) {
    return res.json().catch(() => ({}));
  }

  MG.services = {
    async nlpBatch(items) {
      const url = MG?.API?.NLP_BATCH || MG?.API?.NLP;
      if (!url) throw new Error("NLP API not configured");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "en", items })
      });
      const j = await jsonOrEmpty(r);
      if (!r.ok) throw new Error(j?.detail || "nlp_error");
      return Array.isArray(j?.results) ? j.results : [];
    },

    async generativeExplanation(payload) {
      const url = MG?.API?.NLP_GENERATIVE_EXPLANATION;
      if (!url) throw new Error("Explanation API not configured");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      const j = await jsonOrEmpty(r);
      if (!r.ok) throw new Error(j?.detail || "explain_error");
      return j;
    },

    async registryVerify(params) {
      const base = MG?.API?.SEBI_REGISTRY;
      if (!base) throw new Error("Registry API not configured");
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") qs.set(k, String(v));
      const r = await fetch(`${base}?${qs.toString()}`, { method: "GET" });
      const j = await jsonOrEmpty(r);
      if (!r.ok) throw new Error(j?.detail || "registry_error");
      return j;
    },

    async detectImageDataUrl(dataUrl) {
      const url = MG?.API?.DEEPFAKE_IMAGE_DATAURL;
      if (!url) throw new Error("Deepfake API not configured");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_url: dataUrl })
      });
      const j = await jsonOrEmpty(r);
      if (!r.ok) throw new Error(j?.detail || "detect_error");
      return j;
    }
  };
})();




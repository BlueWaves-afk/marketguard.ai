// scripts/new/services.js
(() => {
  const MG = (window.MG = window.MG || {});

  // ---------------------------------------------------------------------------
  // API defaults (can be overridden elsewhere before use)
  // ---------------------------------------------------------------------------
  MG.API = MG.API || {};
  MG.API.DEEPFAKE_IMAGE_DATAURL = MG.API.DEEPFAKE_IMAGE_DATAURL || "http://localhost:8003/api/detect/image-dataurl";
  MG.API.DEEPFAKE_VIDEO_DATAURL = MG.API.DEEPFAKE_VIDEO_DATAURL || "http://localhost:8003/api/detect/video-dataurl";
  MG.API.MEDIA_BATCH            = MG.API.MEDIA_BATCH            || "http://localhost:8003/api/detect/batch-media";
  // (You may also have MG.API.NLP, MG.API.NLP_BATCH, MG.API.NLP_GENERATIVE_EXPLANATION, MG.API.SEBI_REGISTRY, etc.)

  // ---------------------------------------------------------------------------
  // Proxy-aware fetch (for HTTPS pages -> http://localhost mixed-content)
  // ---------------------------------------------------------------------------
  function shouldProxy(url) {
    try {
      // Proxy localhost http calls (8001/8002/8003) from content scripts
      const u = String(url || "");
      return (
        /^http:\/\/localhost:(8001|8002|8003)\b/i.test(u) &&
        !!chrome?.runtime?.sendMessage
      );
    } catch {
      return false;
    }
  }

  async function proxyFetch(url, init) {
    const resp = await new Promise((resolve) =>
      chrome.runtime.sendMessage(
        {
          type: "MG_PROXY_FETCH",
          url,
          method: init?.method || "GET",
          headers: init?.headers || {},
          body: init?.body ?? null,
        },
        resolve
      )
    );
    // Build a Response-like object usable with .json()/.text()
    return new Response(resp.bodyText, {
      status: resp.status || 0,
      statusText: resp.statusText || "",
      headers: resp.headers || {},
    });
  }

  async function mgFetch(url, init) {
    if (shouldProxy(url)) return proxyFetch(url, init);
    return fetch(url, init);
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function jsonOrEmpty(res) {
    return res.json().catch(() => ({}));
  }

  // Ensure fetch OK or throw with message
  async function assertOk(resp, fallback = "request_failed") {
    const body = await jsonOrEmpty(resp);
    if (!resp.ok) {
      const msg = body?.detail || body?.error || `${fallback} (${resp.status})`;
      const e = new Error(msg);
      e.status = resp.status;
      e.payload = body;
      throw e;
    }
    return body;
  }

  // Normalize any backend deepfake response into { risk: { level, score }, raw }
  function normalizeDeepfake(obj) {
    const risk = obj?.risk || obj || {};
    const level = String(risk.level ?? risk.label ?? "UNKNOWN").trim().toUpperCase();
    const score = Number.isFinite(Number(risk.score))
      ? Number(risk.score)
      : Number.isFinite(Number(obj?.score))
      ? Number(obj.score)
      : 0;
    return { risk: { level, score }, raw: obj };
  }

  MG.services = {
    // -------------------------------------------------------------------------
    // NLP
    // -------------------------------------------------------------------------
    async nlpBatch(items) {
      const url = MG?.API?.NLP_BATCH || MG?.API?.NLP;
      if (!url) throw new Error("NLP API not configured");
      const r = await mgFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "en", items }),
      });
      const j = await assertOk(r, "nlp_error");
      return Array.isArray(j?.results) ? j.results : [];
    },

    async generativeExplanation(payload) {
      const url = MG?.API?.NLP_GENERATIVE_EXPLANATION;
      if (!url) throw new Error("Explanation API not configured");
      const r = await mgFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      return await assertOk(r, "explain_error");
    },

    async registryVerify(params) {
      const base = MG?.API?.SEBI_REGISTRY;
      if (!base) throw new Error("Registry API not configured");
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) {
        if (v != null && v !== "") qs.set(k, String(v));
      }
      const r = await mgFetch(`${base}?${qs.toString()}`, { method: "GET" });
      return await assertOk(r, "registry_error");
    },

    // -------------------------------------------------------------------------
    // Deepfake / Media Detection
    // -------------------------------------------------------------------------

    /**
     * Detect deepfake for a single image (data URL).
     * Returns: { risk: { level, score }, raw }
     */
    async detectImageDataUrl(dataUrl) {
      const url = MG?.API?.DEEPFAKE_IMAGE_DATAURL;
      if (!url) throw new Error("Deepfake IMAGE API not configured");
      const r = await mgFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_url: dataUrl }),
      });
      const j = await assertOk(r, "detect_image_error");
      return normalizeDeepfake(j);
    },

    /**
     * Detect deepfake for a single video frame (data URL of a frame).
     * Returns: { risk: { level, score }, raw }
     */
    async detectVideoDataUrl(dataUrl) {
      const url = MG?.API?.DEEPFAKE_VIDEO_DATAURL;
      if (!url) throw new Error("Deepfake VIDEO API not configured");
      const r = await mgFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_url: dataUrl }),
      });
      const j = await assertOk(r, "detect_video_error");
      return normalizeDeepfake(j);
    },

    /**
     * Batch detect deepfakes. Accepts an array of items:
     *   [{ kind: "image"|"video", data_url: "data:image/png;base64,..."}]
     * Returns: Array of { risk: { level, score }, raw } aligned to inputs.
     */
    async detectMediaBatch(items) {
      const url = MG?.API?.MEDIA_BATCH;
      if (!url) throw new Error("Deepfake BATCH API not configured");
      if (!Array.isArray(items) || !items.length) return [];

      const payload = {
        media: items.map((m) => ({
          kind: m.kind || "image",
          data_url: m.data_url || m.dataUrl || m.data || "",
        })),
      };

      const r = await mgFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const arr = await assertOk(r, "detect_batch_error");

      if (!Array.isArray(arr)) return [normalizeDeepfake(arr)];
      return arr.map((x) => normalizeDeepfake(x));
    },
  };
})();
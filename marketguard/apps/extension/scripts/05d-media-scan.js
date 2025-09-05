// scripts/05d-media-scan.js
// Media scanning: capture, crop, detect, enumerate, drawer slide (X)

(() => {
  const MG = (window.MG = window.MG || {});
  if (MG.FEATURES?.MEDIA_SCAN_ENABLED) MG.injectMediaStyles?.();

  // background-assisted viewport capture (returns dataURL or null)
  MG.captureViewport = async function captureViewport() {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return null;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        const r = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "MG_CAPTURE_VIEWPORT" }, (resp) => resolve(resp));
        });
        if (r && typeof r.dataUrl === "string") return r.dataUrl;
      }
    } catch {}
    if (window.html2canvas) {
      const cv = await window.html2canvas(document.body, { logging: false, useCORS: true, scale: window.devicePixelRatio || 1 });
      return cv.toDataURL("image/png");
    }
    return null;
  };

  // crop element from a full viewport screenshot dataURL
  MG.cropFromScreenshot = async function cropFromScreenshot(viewDataUrl, el) {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return null;
    try {
      const img = new Image(); img.src = viewDataUrl; await img.decode?.();
      const r = el.getBoundingClientRect();
      const scaleX = img.naturalWidth / Math.max(1, window.innerWidth);
      const scaleY = img.naturalHeight / Math.max(1, window.innerHeight);
      const sx = Math.max(0, Math.floor(r.left * scaleX));
      const sy = Math.max(0, Math.floor(r.top * scaleY));
      const sw = Math.max(1, Math.floor(r.width * scaleX));
      const sh = Math.max(1, Math.floor(r.height * scaleY));
      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvas.toDataURL("image/png");
    } catch { return null; }
  };

  MG.captureElement = async function captureElement(el) {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return null;
    if (el instanceof HTMLImageElement) {
      try {
        const c = document.createElement("canvas");
        const w = el.naturalWidth || el.width || 0;
        const h = el.naturalHeight || el.height || 0;
        if (!w || !h) throw new Error("empty image");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(el, 0, 0);
        return c.toDataURL("image/png");
      } catch {}
    } else if (el instanceof HTMLVideoElement) {
      try {
        if (!el.videoWidth || !el.videoHeight) throw new Error("no frame");
        const c = document.createElement("canvas");
        c.width = el.videoWidth; c.height = el.videoHeight;
        c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
        return c.toDataURL("image/png");
      } catch {}
    }
    const shot = await MG.captureViewport();
    if (!shot) return null;
    return await MG.cropFromScreenshot(shot, el);
  };

  MG.detectDataUrl = async function detectDataUrl(dataUrl) {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) throw new Error("Media scan disabled");
    const endpoint = MG?.API?.DEEPFAKE_IMAGE_DATAURL; // should be /api/detect/image-dataurl
    if (!endpoint) throw new Error("Deepfake API not configured");
    const r = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_url: dataUrl })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail || "Detection failed");
    return j; // {risk:{level,score}, width,height,sha256,...}
  };

  MG.enumerateMedia = function enumerateMedia() {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return [];
    return Array.from(document.querySelectorAll("img, video"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 32 && r.height >= 32 && r.bottom > 0 && r.right > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
      });
  };

  // horizontal slide open/close for drawer
  MG.slideOpenX = async function(el, dur = 320, targetW = 320) {
    if (!el) return;
    try { el._mgWAnim?.cancel(); } catch {}
    el.hidden = false;
    el.style.overflow = "clip";
    el.style.willChange = "width";
    el.style.width = "0px";

    const easing = "cubic-bezier(.25,.9,.25,1)";
    const w = el.animate(
      [{ width: "0px" }, { width: targetW + "px" }],
      { duration: dur, easing, fill: "both", composite: "replace" }
    );
    el._mgWAnim = w;
    await Promise.allSettled([w.finished]);

    el.style.width = targetW + "px";
    el.style.overflow = "";
    el.style.willChange = "";
    el._mgWAnim = null;

    // Re-position now that the width changed
    MG.positionMediaDrawer?.();
  };

  MG.slideCloseX = async function(el, dur = 280) {
    if (!el) return;
    try { el._mgWAnim?.cancel(); } catch {}
    const startW = el.getBoundingClientRect().width || 320;
    el.style.overflow = "clip";
    el.style.willChange = "width";
    const easing = "cubic-bezier(.25,.9,.25,1)";
    const w = el.animate(
      [{ width: startW + "px" }, { width: "0px" }],
      { duration: dur, easing, fill: "both", composite: "replace" }
    );
    el._mgWAnim = w;
    await Promise.allSettled([w.finished]);

    el.hidden = true;
    el.style.width = "0px";
    el.style.overflow = "";
    el.style.willChange = "";
    el._mgWAnim = null;
  };
})();

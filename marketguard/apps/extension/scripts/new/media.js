// scripts/new/media.js
(() => {
  const MG = (window.MG = window.MG || {});

  MG.captureViewport = async function captureViewport() {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return null;
    try {
      if (chrome?.runtime?.sendMessage) {
        const r = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'MG_CAPTURE_VIEWPORT' }, (resp) => resolve(resp)));
        if (r && typeof r.dataUrl === 'string') return r.dataUrl;
      }
    } catch {}
    if (window.html2canvas) {
      const cv = await window.html2canvas(document.body, { logging: false, useCORS: true, scale: window.devicePixelRatio || 1 });
      return cv.toDataURL('image/png');
    }
    return null;
  };

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
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return c.toDataURL('image/png');
    } catch { return null; }
  };

  MG.captureElement = async function captureElement(el) {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return null;
    if (el instanceof HTMLImageElement) {
      try {
        const c = document.createElement('canvas');
        const w = el.naturalWidth || el.width || 0; const h = el.naturalHeight || el.height || 0;
        if (!w || !h) throw new Error('empty image');
        c.width = w; c.height = h; c.getContext('2d').drawImage(el, 0, 0);
        return c.toDataURL('image/png');
      } catch {}
    } else if (el instanceof HTMLVideoElement) {
      try {
        if (!el.videoWidth || !el.videoHeight) throw new Error('no frame');
        const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight;
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      } catch {}
    }
    const shot = await MG.captureViewport();
    if (!shot) return null;
    return await MG.cropFromScreenshot(shot, el);
  };

  MG.enumerateMedia = function enumerateMedia() {
    if (!MG.FEATURES?.MEDIA_SCAN_ENABLED) return [];
    return Array.from(document.querySelectorAll('img, video')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 32 && r.height >= 32 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight;
    });
  };

  MG.detectDataUrl = async function detectDataUrl(dataUrl) {
    return MG.services.detectImageDataUrl(dataUrl);
  };
})();



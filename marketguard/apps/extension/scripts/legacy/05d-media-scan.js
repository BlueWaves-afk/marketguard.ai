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

  // iOS-style media popup
  MG.injectMediaPopupStyles = function() {
    if (document.getElementById("mg-media-popup-style")) return;
    const st = document.createElement("style");
    st.id = "mg-media-popup-style";
    st.textContent = `
      @keyframes mgMediaPopupFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes mgMediaSheetIn { 
        from { opacity: 0; transform: scale(.96) translateY(12px); } 
        to { opacity: 1; transform: scale(1) translateY(0); } 
      }
      .mg-media-popup-overlay {
        position: fixed; inset: 0; z-index: 2147483647; 
        display: grid; place-items: center;
        padding: env(safe-area-inset-top, 20px) 20px env(safe-area-inset-bottom, 20px);
        background: rgba(0,0,0,.4);
        -webkit-backdrop-filter: blur(20px) saturate(1.8); 
        backdrop-filter: blur(20px) saturate(1.8); 
        animation: mgMediaPopupFade .2s ease;
      }
      .mg-media-popup-sheet {
        width: min(440px, 90vw); 
        max-height: min(80vh, 600px); 
        overflow: hidden; 
        border-radius: 24px;
        position: relative; 
        box-shadow: 0 24px 60px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.1) inset;
        background: rgba(28,28,30,.95);
        color: #ffffff; 
        display: flex; 
        flex-direction: column;
        -webkit-backdrop-filter: blur(40px) saturate(1.2);
        backdrop-filter: blur(40px) saturate(1.2); 
        background-clip: padding-box; 
        animation: mgMediaSheetIn .25s cubic-bezier(.34,1.56,.64,1);
        border: 0.5px solid rgba(255,255,255,.15);
      }
      .mg-media-popup-sheet.mg-light {
        background: rgba(255,255,255,.95);
        color: #000000;
        border-color: rgba(0,0,0,.1);
        box-shadow: 0 24px 60px rgba(0,0,0,.15), 0 1px 0 rgba(255,255,255,.6) inset;
      }
      .mg-media-popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 16px;
        border-bottom: 0.5px solid rgba(255,255,255,.08);
      }
      .mg-media-popup-sheet.mg-light .mg-media-popup-header {
        border-bottom-color: rgba(0,0,0,.08);
      }
      .mg-media-popup-title {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.2px;
        margin: 0;
      }
      .mg-media-popup-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 16px;
        font-size: 18px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        user-select: none;
        background: rgba(120,120,128,.16);
        color: rgba(255,255,255,.9);
        border: none;
        transition: all .15s ease;
      }
      .mg-media-popup-sheet.mg-light .mg-media-popup-close {
        background: rgba(120,120,128,.12);
        color: rgba(0,0,0,.8);
      }
      .mg-media-popup-close:hover {
        background: rgba(120,120,128,.24);
        transform: scale(1.05);
      }
      .mg-media-popup-close:active {
        transform: scale(0.95);
      }
      .mg-media-popup-body {
        padding: 0 24px 24px;
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .mg-media-popup-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }
      .mg-media-popup-empty-icon {
        width: 64px;
        height: 64px;
        border-radius: 32px;
        background: rgba(52,199,89,.15);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
        font-size: 28px;
      }
      .mg-media-popup-sheet.mg-light .mg-media-popup-empty-icon {
        background: rgba(52,199,89,.1);
      }
      .mg-media-popup-empty-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 8px;
        color: rgba(52,199,89,1);
      }
      .mg-media-popup-empty-subtitle {
        font-size: 15px;
        margin: 0;
        opacity: .7;
        line-height: 1.4;
      }
      .mg-media-popup-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        margin-top: 16px;
      }
      .mg-media-popup-item {
        position: relative;
        border-radius: 16px;
        overflow: hidden;
        background: rgba(28,28,30,.6);
        border: 0.5px solid rgba(255,255,255,.1);
      }
      .mg-media-popup-sheet.mg-light .mg-media-popup-item {
        background: rgba(255,255,255,.8);
        border-color: rgba(0,0,0,.08);
      }
      .mg-media-popup-thumb {
        display: block;
        width: 100%;
        height: auto;
        max-height: 240px;
        object-fit: cover;
      }
      .mg-media-popup-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 6px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        color: #ffffff;
        backdrop-filter: blur(12px) saturate(1.5);
        border: 0.5px solid rgba(255,255,255,.2);
      }
    `;
    document.head.appendChild(st);
  };

  MG.openMediaPopup = function({ mediaItems = [], summary = {} } = {}) {
    console.log('Opening media popup with', mediaItems?.length || 0, 'items');
    
    try {
      const prefs = (MG.getPrefs && typeof MG.getPrefs === 'function') ? MG.getPrefs() : { theme: 'dark' };
      const isLight = prefs.theme === "light";

      // Remove any existing popup
      const existing = document.querySelectorAll(".mg-media-popup-overlay");
      existing.forEach(el => { try { el.remove(); } catch {} });
      
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";

      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(0,0,0,0.4);
        backdrop-filter: blur(12px);
      `;
      
      const sheet = document.createElement("div");
      sheet.style.cssText = `
        width: min(440px, 90vw); max-height: min(80vh, 600px);
        border-radius: 24px; overflow: hidden;
        background: ${isLight ? 'rgba(255,255,255,0.95)' : 'rgba(28,28,30,0.95)'};
        color: ${isLight ? '#000' : '#fff'};
        box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
      `;

      // Header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 16px; border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
      `;
      
      const title = document.createElement("h2");
      title.textContent = "Media Scan Results";
      title.style.cssText = `margin: 0; font-size: 20px; font-weight: 700;`;
      
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.style.cssText = `
        width: 32px; height: 32px; border-radius: 16px; border: none;
        background: rgba(120,120,128,0.16); color: inherit;
        font-size: 18px; font-weight: 600; cursor: pointer;
      `;
      
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Body
      const body = document.createElement("div");
      body.style.cssText = `padding: 0 24px 24px; overflow-y: auto;`;

      // Check if we have risky media (HIGH or MEDIUM)
      const validItems = Array.isArray(mediaItems) ? mediaItems : [];
      const riskyItems = validItems.filter(item => 
        item && (item.level === 'HIGH' || item.level === 'MEDIUM')
      );
      
      console.log('Processing', validItems.length, 'total items,', riskyItems.length, 'risky items');

      if (riskyItems.length === 0) {
        // Empty state - no risky images
        const emptyState = document.createElement("div");
        emptyState.style.cssText = `
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 20px; text-align: center;
        `;
        
        const icon = document.createElement("div");
        icon.textContent = "✓";
        icon.style.cssText = `
          width: 64px; height: 64px; border-radius: 32px; 
          background: rgba(52,199,89,0.15); color: rgba(52,199,89,1);
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; margin-bottom: 16px;
        `;
        
        const titleEl = document.createElement("h3");
        titleEl.textContent = "No Risky Images Found";
        titleEl.style.cssText = `
          font-size: 18px; font-weight: 600; margin: 0 0 8px;
          color: rgba(52,199,89,1);
        `;
        
        const subtitle = document.createElement("p");
        subtitle.textContent = "All scanned media appears to be safe. No suspicious content detected.";
        subtitle.style.cssText = `
          font-size: 15px; margin: 0; opacity: 0.7; line-height: 1.4;
        `;
        
        emptyState.appendChild(icon);
        emptyState.appendChild(titleEl);
        emptyState.appendChild(subtitle);
        body.appendChild(emptyState);
      } else {
        // Show risky items
        const grid = document.createElement("div");
        grid.style.cssText = `
          display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px;
        `;
        
        riskyItems.slice(0, 10).forEach((item, index) => { // Limit to 10 items to prevent performance issues
          try {
            const itemEl = document.createElement("div");
            itemEl.style.cssText = `
              position: relative; border-radius: 16px; overflow: hidden;
              background: ${isLight ? 'rgba(255,255,255,0.8)' : 'rgba(28,28,30,0.6)'};
              border: 0.5px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'};
            `;
            
            if (item.dataUrl) {
              const img = document.createElement("img");
              img.style.cssText = `
                display: block; width: 100%; height: auto; max-height: 240px; object-fit: cover;
              `;
              img.src = item.dataUrl;
              img.alt = `${item.level || 'UNKNOWN'} risk media`;
              img.onerror = () => {
                img.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.textContent = 'Image failed to load';
                placeholder.style.cssText = `
                  padding: 40px; text-align: center; opacity: 0.6; font-size: 14px;
                `;
                itemEl.insertBefore(placeholder, itemEl.firstChild);
              };
              itemEl.appendChild(img);
            }
            
            const badge = document.createElement("div");
            const riskColor = (MG.riskColor && typeof MG.riskColor === 'function') ? MG.riskColor(item.level) : '#999';
            badge.style.cssText = `
              position: absolute; top: 12px; left: 12px; padding: 6px 12px;
              border-radius: 12px; font-size: 12px; font-weight: 700;
              color: #ffffff; background: ${riskColor};
              backdrop-filter: blur(12px);
            `;
            
            const scoreText = (item.score != null && MG.pct && typeof MG.pct === 'function') ? 
              ` (${MG.pct(item.score)}%)` : '';
            badge.textContent = `${item.level || 'UNKNOWN'}${scoreText}`;
            
            itemEl.appendChild(badge);
            grid.appendChild(itemEl);
          } catch (error) {
            console.warn(`Failed to render media item ${index}:`, error);
          }
        });
        
        body.appendChild(grid);
      }

      sheet.appendChild(header);
      sheet.appendChild(body);
      overlay.appendChild(sheet);
      
      // Simple close function
      function close() {
        try {
          document.documentElement.style.overflow = prevOverflow || "";
          overlay.remove();
          console.log('Media popup closed');
        } catch (e) {
          console.error('Error closing media popup:', e);
        }
      }

      // Event listeners
      closeBtn.onclick = close;
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      document.addEventListener('keydown', function onEscape(e) {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', onEscape);
        }
      });

      // Add to DOM and show
      document.body.appendChild(overlay);
      
      // Simple fade in
      overlay.style.opacity = '0';
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.2s ease';
        overlay.style.opacity = '1';
      });
      
      console.log('Media popup created successfully');
      return { close };
      
    } catch (error) {
      console.error('Fatal error in MG.openMediaPopup:', error);
      
      // Restore document overflow in case of error
      try {
        document.documentElement.style.overflow = prevOverflow || '';
      } catch {}
      
      // Show user-friendly error
      alert('Unable to display media scan results. Please try again.');
      return { close: () => {} };
    }
  };
})();

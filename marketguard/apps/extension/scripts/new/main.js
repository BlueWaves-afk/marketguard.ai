// scripts/new/main.js
(() => {
  const MG = (window.MG = window.MG || {});

  const HEARTBEAT_MS = 3000;
  const PER_EL_CHAR_LIMIT = 800;
  const TOTAL_CHAR_BUDGET = 12000;
  const MAX_ITEMS = 500;

  function ensurePrefs() {
    if (!MG.state) MG.state = {};
    if (!MG.state.prefs || typeof MG.state.prefs !== 'object') MG.state.prefs = { ...(MG.DEFAULT_PREFS || { threshold: 0.6, theme: 'dark', defaultMode: 'compact', pauseScanning: false }) };
    return MG.state.prefs;
  }

  function isVisible(el) {
    try {
      if (!(el instanceof Element)) return true;
      if (el.hidden) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch { return true; }
  }

  function textFromEditable(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return String(el.value || '');
    if (el.tagName === 'INPUT') return String(el.value || '');
    if (el.hasAttribute && el.hasAttribute('contenteditable')) return String(el.innerText || el.textContent || '');
    return '';
  }

  function getLocator(el) {
    try {
      const parts = []; let n = el;
      while (n && n.nodeType === 1 && parts.length < 6) {
        let seg = n.nodeName.toLowerCase();
        if (n.id) seg += '#' + n.id; else {
          const cls = (n.className && typeof n.className === 'string') ? n.className.trim().split(/\s+/).slice(0,2).join('.') : '';
          if (cls) seg += '.' + cls;
        }
        parts.unshift(seg); n = n.parentElement;
      }
      const cssPath = parts.join(' > ');
      const r = el.getBoundingClientRect();
      return { cssPath, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    } catch { return { cssPath: '', rect: { x:0, y:0, w:0, h:0 } }; }
  }

  function collectElementsForScan() {
    const selector = [
      'p','div','span','li','a','td','th',
      'h1','h2','h3','h4','h5','h6','label','blockquote','figcaption',
      'button','summary','dd','dt',
      'input','textarea','[contenteditable]'
    ].join(',');

    const nodes = Array.from(document.querySelectorAll(selector));
    const items = [];
    let totalChars = 0; let idCounter = 0;
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      let text = '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')) {
        text = textFromEditable(el);
        const hint = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim();
        if (hint) text = (text ? (text + '\n') : '') + hint;
      } else {
        text = String(el.innerText || el.textContent || '');
      }
      text = text.trim(); if (!text) continue;
      let chunk = text.slice(0, PER_EL_CHAR_LIMIT);
      if (totalChars + chunk.length > TOTAL_CHAR_BUDGET) {
        const remaining = Math.max(0, TOTAL_CHAR_BUDGET - totalChars);
        if (remaining <= 0) break; chunk = chunk.slice(0, remaining);
      }
      items.push({ id: idCounter++, text: chunk, metadata: { type: el.tagName.toLowerCase(), locator: getLocator(el), url: location.href } });
      totalChars += chunk.length; if (items.length >= MAX_ITEMS || totalChars >= TOTAL_CHAR_BUDGET) break;
    }
    const pageText = (document.body?.innerText || '').trim().slice(0, Math.max(2000, PER_EL_CHAR_LIMIT));
    if (pageText) items.push({ id: idCounter++, text: pageText, metadata: { type: 'page', locator: { cssPath: 'body', rect: { x:0,y:0,w:innerWidth,h:innerHeight } }, url: location.href } });
    return items;
  }

  MG.runScan = async function runScan() {
    ensurePrefs();
    await MG.ensureFab?.();
    if (MG.state?.prefs?.pauseScanning) { MG.setFabScore?.(NaN, 'PAUSED'); return; }
    if (MG.state?.isScanning) return;
    MG.state.isScanning = true;
    try {
      const items = collectElementsForScan();
      const results = await MG.services.nlpBatch(items);
      const byId = new Map(results.map(r => [r.id, r]));
      const threshold = Number(MG.state.prefs?.threshold ?? 0.6);
      let best = { score: 0, risk: '', id: null, json: null };
      for (const it of items) {
        const res = byId.get(it.id); if (!res) continue;
        const score = Number(res.score || 0);
        if (score > best.score) best = { score, risk: String(res.risk || ''), id: it.id, json: res };
      }
      MG.state.lastRiskJson = best.json || { score: best.score, risk: best.risk };
      MG.setFabScore?.(best.score, String(best.risk || ''));

      const allow = best.score >= threshold || MG.state.forceShowOverlay;
      if (allow && !MG.state.overlayClosed) MG.updateOverlay?.(MG.state.lastRiskJson, { fromFabClick: !!MG.state.forceShowOverlay });
      else MG.removeOverlayIfAny?.();
      MG.state.forceShowOverlay = false;
    } catch { /* ignore */ }
    finally { MG.state.isScanning = false; }
  };

  function startHeartbeat() {
    let timer = null;
    const tick = async () => { try { await MG.runScan(); } finally { timer = setTimeout(tick, HEARTBEAT_MS); } };
    timer = setTimeout(tick, HEARTBEAT_MS);
  }

  (async function init() {
    ensurePrefs();
    MG.initSelectionGuards?.();
    await MG.ensureFab?.();
    await MG.runScan();
    startHeartbeat();
    try {
      chrome.runtime?.onMessage.addListener((msg) => {
        if (msg?.type === 'MARKETGUARD_FORCE_SHOW') {
          MG.state.forceShowOverlay = true; MG.state.overlayClosed = false;
          if (MG.state.lastRiskJson) MG.updateOverlay?.(MG.state.lastRiskJson, { fromFabClick: true }); else MG.runScan();
        }
      });
    } catch {}
    document.addEventListener('visibilitychange', () => { if (!document.hidden) MG.runScan(); });
  })();
})();



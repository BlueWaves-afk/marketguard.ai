// scripts/new/risk-memory.js
(() => {
  const MG = (window.MG = window.MG || {});

  // --- helpers ---------------------------------------------------------------
  const MEM_KEY = "mg:riskyMemory:v1";

  function ensureState() { if (!MG.state) MG.state = {}; return MG.state; }
  function asMapLike(resultsById) {
    return resultsById && typeof resultsById.get === "function"
      ? resultsById
      : { get: (k) => (resultsById ? resultsById[k] : undefined) };
  }
  // tiny fast hash for a stable id (no crypto dependency)
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i=0; i<s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  // Build a deterministic anchor id from DOM context + item id/text
  function makeAnchorId(base) { return `mg-anchor-${base}`; }

  function getDomPath(el) {
    // CSS-ish path for recovery; shallow to keep string small
    const parts = [];
    let cur = el;
    for (let depth = 0; cur && depth < 5; depth++) {
      let seg = cur.tagName ? cur.tagName.toLowerCase() : "node";
      if (cur.id) { seg += `#${cur.id}`; parts.unshift(seg); break; }
      const cls = (cur.className || "").toString().trim().split(/\s+/).slice(0,2).filter(Boolean);
      if (cls.length) seg += "." + cls.join(".");
      const p = cur.parentElement;
      if (p) {
        const sibs = Array.from(p.children).filter(x => x.tagName === cur.tagName);
        if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur)+1})`;
      }
      parts.unshift(seg);
      cur = p;
    }
    return parts.join(">");
  }

  // Persist / load (prefers chrome.storage.session, falls back to local / memory)
  async function saveRiskMemory(mem) {
    try {
      if (chrome?.storage?.session) {
        await chrome.storage.session.set({ [MEM_KEY]: mem });
      } else if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [MEM_KEY]: mem });
      } else {
        ensureState().__memCache = mem;
      }
    } catch {}
  }
  async function loadRiskMemory() {
    try {
      if (chrome?.storage?.session) {
        const o = await chrome.storage.session.get(MEM_KEY);
        return o?.[MEM_KEY] || [];
      }
      if (chrome?.storage?.local) {
        const o = await chrome.storage.local.get(MEM_KEY);
        return o?.[MEM_KEY] || [];
      }
      return ensureState().__memCache || [];
    } catch { return []; }
  }

  // --- API -------------------------------------------------------------------

  MG.clearRiskMemory = async function clearRiskMemory() {
    const st = ensureState();
    st.riskyMemory = [];
    st.hlIndex = -1;
    try {
      document.querySelectorAll('[data-mg-id^="mg-anchor-"]').forEach(el => {
        try { el.removeAttribute('data-mg-id'); el.classList.remove('mg-hl-focus'); } catch {}
      });
    } catch {}
    await saveRiskMemory([]);
  };

  /**
   * Build/refresh memory from a scan.
   * @param resultsById Map|Object of {id -> {score,risk,text,...}}
   * @param items Array of {id, text, __el, metadata:{locator,url,...}}
   * @param threshold number (0..1 or 0..100) – both supported
   */
  MG.buildRiskMemory = async function buildRiskMemory(resultsById, items, threshold) {
    const st = ensureState();
    const map = asMapLike(resultsById);

    // Accept 0..100 UI thresholds; normalize to 0..1
    const thr = threshold > 1 ? threshold / 100 : threshold;

    // Start from any existing memory, update / add without losing stable ids
    const existing = Array.isArray(st.riskyMemory) ? st.riskyMemory : await loadRiskMemory();
    const byId = new Map(existing.map(e => [e.id, e]));

    const out = [];

    for (const it of (items || [])) {
      const res = map.get(it.id);
      if (!res) continue;
      const score = Number(res.score || 0);
      const normScore = score > 1 ? score / 100 : score;
      if (normScore < thr) continue;

      // Prefer to keep a previous mgid if we have one
      let mgid = byId.get(it.id)?.mgid;

      // If element is present, ensure it has a data-mg-id (reuse or stamp deterministically)
      if (it.__el && it.__el.setAttribute) {
        if (!mgid) {
          const base = hashStr(`${it.id}::${(it.metadata?.locator)||getDomPath(it.__el)}::${(it.text||'').slice(0,64)}`);
          mgid = makeAnchorId(base);
        }
        try { it.__el.setAttribute('data-mg-id', mgid); } catch {}
      }

      const memItem = {
        id: it.id,
        mgid,
        score: normScore,
        risk: String(res.risk || ''),
        locator: it.metadata?.locator || getDomPath(it.__el || document.body),
        url: it.metadata?.url || location.href,
        text: (res.text || res.snippet || res.cleaned_text || it.text || '').slice(0, 5000),
        rawItemText: (it.text || '').slice(0, 5000),
        ts: Date.now(),
      };
      out.push(memItem);
    }

    // Sort by DOM order if possible (using stamped anchors), else by score desc
    const orderByDom = (a,b) => {
      try {
        const ea = a.mgid ? document.querySelector(`[data-mg-id="${CSS.escape(a.mgid)}"]`) : null;
        const eb = b.mgid ? document.querySelector(`[data-mg-id="${CSS.escape(b.mgid)}"]`) : null;
        if (ea && eb) return (ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      } catch {}
      return (b.score - a.score);
    };
    out.sort(orderByDom);

    st.riskyMemory = out;
    st.hlIndex = out.length ? 0 : -1;

    // Persist for later reference in the same tab/session (or across if local used)
    await saveRiskMemory(out);

    // Update on-screen summary if the overlay is open
    MG.updateHlSummary?.();
  };

  MG.findHighlights = function findHighlights() {
    try {
      return Array.from(document.querySelectorAll('[data-mg-id^="mg-anchor-"]'));
    } catch { return []; }
  };

  MG.goToHighlight = function goToHighlight(step = 0) {
    const st = ensureState();
    const mem = st.riskyMemory || [];
    if (!mem.length) return;

    if (typeof st.hlIndex !== 'number') st.hlIndex = 0;
    if (step) st.hlIndex = (st.hlIndex + step + mem.length) % mem.length;

    const cur = mem[st.hlIndex];
    let el = null;
    if (cur?.mgid) {
      try { el = document.querySelector(`[data-mg-id="${CSS.escape(cur.mgid)}"]`); } catch {}
    }
    // Fallback: try locator if element lost its data attribute
    if (!el && cur?.locator) {
      try { el = document.querySelector(cur.locator.split(">")[0] || "body"); } catch {}
    }
    if (!el) return;

    try {
      // clear previous highlight
      document.querySelectorAll(".mg-hl-focus").forEach(e => e.classList.remove("mg-hl-focus"));
      el.classList.add("mg-hl-focus");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus?.({ preventScroll: true });
    } catch {}
  };

  MG.updateHlSummary = function updateHlSummary() {
    try {
      const st = ensureState();
      const n = Array.isArray(st.riskyMemory) ? st.riskyMemory.length : 0;
      const el = document.querySelector('[data-mg-hl-summary]');
      if (el) el.textContent = n ? `${n} risky area${n>1?'s':''}` : 'No risky elements';
    } catch {}
  };

  // Optional: expose a loader for other panels/popups
  MG.getRiskMemory = async function getRiskMemory() {
    const st = ensureState();
    if (Array.isArray(st.riskyMemory) && st.riskyMemory.length) return st.riskyMemory;
    const mem = await loadRiskMemory();
    st.riskyMemory = mem;
    return mem;
  };
})();
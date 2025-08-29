// MarketGuard Content Script (modern card • draggable • close • fade + pulse on HIGH)

(function () {
  const NLP_API   = "http://localhost:8002/api/nlp/v1/score";
  const CHECK_API = "http://localhost:8003/api/check/v1/upi-verify";
  const REG_API   = "http://localhost:8001/api/registry/v1/verify";

  const RISK_TERMS = [
    "guaranteed returns", "assured returns", "multibagger",
    "insider access", "FPI access", "DM me",
    "limited window", "send UPI", "double your money",
  ];

  const UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  // ---------- Styles (fade in/out + pulse on HIGH)
  const STYLE = `
    .marketguard-badge{
      display:inline-block;padding:2px 6px;margin-left:6px;
      font:12px/1.2 Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      border-radius:6px;background:#ffe7c2;color:#7a4f00;border:1px solid #f0c36d;
    }
    .marketguard-risk{background:#ffe5e5;color:#a80000;border-color:#ff8a8a}
    mark.marketguard{background:#fff6a5}

    .marketguard-tooltip{
      position:fixed; bottom:24px; right:24px; z-index:2147483647;
      width:min(560px, 38vw); min-width:360px;
      display:flex; flex-direction:column; gap:14px;
      border-radius:20px;
      background: radial-gradient(120% 120% at 90% -10%, rgba(55,148,255,.18) 0%, rgba(255,255,255,.05) 45%, rgba(0,0,0,.35) 100%), rgba(14,20,34,.84);
      backdrop-filter: saturate(140%) blur(8px);
      box-shadow: 0 18px 44px rgba(0,0,0,.30), inset 0 0 0 1px rgba(255,255,255,.06);
      color:#eaf2ff; padding:16px 18px;
      font: 14px/1.45 Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      user-select: none;

      /* animation baseline */
      opacity: 0;
      transform: translateY(8px) scale(.98);
      transition: opacity .18s ease, transform .2s ease, box-shadow .2s ease;
    }
    .marketguard-tooltip.marketguard-in {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .marketguard-tooltip.marketguard-out {
      opacity: 0 !important;
      transform: translateY(8px) scale(.98) !important;
    }

    /* Drop-shadow pulse for HIGH risk */
    @keyframes mgPulse {
      0% {
        box-shadow: 0 18px 44px rgba(255, 64, 64, 0.22), inset 0 0 0 1px rgba(255,255,255,.06);
      }
      50% {
        box-shadow: 0 22px 60px rgba(255, 64, 64, 0.42), 0 0 24px rgba(255, 64, 64, 0.35), inset 0 0 0 1px rgba(255,255,255,.06);
      }
      100% {
        box-shadow: 0 18px 44px rgba(255, 64, 64, 0.22), inset 0 0 0 1px rgba(255,255,255,.06);
      }
    }
    .marketguard-tooltip.marketguard-pulse {
      animation: mgPulse 1.8s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .marketguard-tooltip { transition: none !important; animation: none !important; }
    }

    .ss-header{ display:flex; align-items:center; gap:12px; cursor:grab; }
    .ss-header:active{ cursor:grabbing; }
    .ss-avatar{
      flex:0 0 44px; height:44px; width:44px; border-radius:12px; overflow:hidden;
      display:grid; place-items:center;
      background: linear-gradient(135deg, #2a3348, #111827);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }
    .ss-title{
      font-weight:800; font-size:18px; letter-spacing:.2px; color:#c7d3ff; margin:0; flex:1 1 auto;
    }
    .ss-close{
      flex:0 0 auto; width:28px; height:28px; border-radius:8px; display:grid; place-items:center;
      background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
      color:#eaf2ff; font-weight:700; cursor:pointer;
      transition: background .12s ease, border-color .12s ease, transform .06s ease;
    }
    .ss-close:hover{ background: rgba(255,255,255,.12); border-color:rgba(255,255,255,.22); }
    .ss-close:active{ transform: translateY(1px); }

    .ss-body{ display:flex; flex-direction:column; gap:6px; }
    .ss-risk{
      font-size:17px; font-weight:800; margin:0;
      background: linear-gradient(90deg, #12ffb0, #79ffa0 60%, #a7ff6f);
      -webkit-background-clip:text; background-clip:text; color:transparent;
    }
    .ss-sub{ margin:0; opacity:.8; font-size:13px; line-height:1.45; }

    .ss-divider{ height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.09), transparent); }
    .ss-actions{ display:flex; justify-content:flex-end; align-items:center; gap:12px; }

    .ss-btn{
      appearance:none; border:1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.07); color:#eaf2ff;
      padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer;
      transition: transform .06s ease, background .12s ease, border-color .12s ease;
      white-space:nowrap; font-size:14px;
    }
    .ss-btn:hover{ background: rgba(255,255,255,.12); border-color:rgba(255,255,255,.22); }
    .ss-btn:active{ transform: translateY(1px); }
    .ss-btn--danger{ color:#ff7979; background: rgba(255,107,107,.12); border-color:rgba(255,107,107,.38); }
  `;
  document.documentElement.appendChild(Object.assign(document.createElement("style"), {textContent: STYLE}));

  // ---------- Guards & helpers
  let isScanning = false;
  let overlayClosed = false;

  function isOurElement(el) {
    return el?.classList && Array.from(el.classList).some(c => c.startsWith("marketguard") || c.startsWith("ss-"));
  }
  function safeReplace(node, frag) {
    try {
      if (!node || !frag?.childNodes.length) return;
      const p = node.parentNode;
      if (p && document.contains(p)) p.replaceChild(frag, node);
    } catch {}
  }

  // ---------- Highlighting
  function highlightMatches(node, regex, mode) {
    if (node?.nodeType !== Node.TEXT_NODE) return;
    if (isOurElement(node.parentElement)) return;
    const text = node.nodeValue;
    if (!text) return;

    const frag = document.createDocumentFragment();
    let lastIndex = 0, match; regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement("mark");
      mark.className = "marketguard";
      mark.textContent = match[0];
      frag.appendChild(mark);

      if (mode === "upi") {
        const btn = document.createElement("span");
        btn.className = "marketguard-badge";
        btn.textContent = "Verify UPI";
        btn.style.cursor = "pointer";
        const matchedText = match[0];
        btn.addEventListener("click", async () => {
          btn.textContent = "Verifying...";
          try {
            const res = await fetch(CHECK_API, {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ upi: matchedText })
            });
            const json = await res.json();
            btn.textContent = json.display || (json.verified ? "Verified" : "Not Found");
            btn.classList.toggle("marketguard-risk", !json.verified);
          } catch {
            btn.textContent = "Error";
          }
        });
        frag.appendChild(btn);
      }

      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    safeReplace(node, frag);
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (!n.nodeValue.trim()
                        || isOurElement(n.parentElement)
                        || ["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT"].includes(n.parentElement?.tagName))
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT
    });
    const out = []; let curr; while ((curr = walker.nextNode())) out.push(curr);
    return out;
  }

  // ---------- Positioning (persist per origin)
  const POS_KEY = "marketGuardV2Pos::" + location.origin;
  const savePos = (left, top) => { try { localStorage.setItem(POS_KEY, JSON.stringify({left, top})); } catch {} };
  const loadPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY)) || null; } catch { return null; } };

  function makeDraggable(tip, handle) {
    let startX, startY, startLeft, startTop, dragging = false;
    function onDown(e) {
      const evt = e.touches ? e.touches[0] : e;
      dragging = true;
      startX = evt.clientX; startY = evt.clientY;
      const rect = tip.getBoundingClientRect();
      tip.style.left = rect.left + "px";
      tip.style.top  = rect.top  + "px";
      tip.style.right = "auto";
      tip.style.bottom = "auto";
      startLeft = rect.left; startTop = rect.top;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, {passive:false});
      window.addEventListener("touchend", onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      const evt = e.touches ? e.touches[0] : e;
      if (e.touches) e.preventDefault();
      let left = startLeft + (evt.clientX - startX);
      let top  = startTop  + (evt.clientY - startY);
      const m = 20, vw = innerWidth, vh = innerHeight, w = tip.offsetWidth, h = tip.offsetHeight;
      left = Math.max(m, Math.min(vw - w - m, left));
      top  = Math.max(m, Math.min(vh - h - m, top));
      tip.style.left = left + "px";
      tip.style.top  = top  + "px";
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      const rect = tip.getBoundingClientRect();
      savePos(rect.left, rect.top);
    }
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, {passive:true});
  }

  // ---------- Card (create-or-update with fade + conditional pulse)
  function upsertTooltip(json) {
    if (overlayClosed) return;

    let tip = document.querySelector(".marketguard-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "marketguard-tooltip";

      // restore position if any
      const pos = loadPos();
      if (pos) {
        tip.style.left = pos.left + "px";
        tip.style.top  = pos.top  + "px";
        tip.style.right = "auto";
        tip.style.bottom = "auto";
      }

      // Header
      const header = document.createElement("div");
      header.className = "ss-header";

      const avatar = document.createElement("div");
      avatar.className = "ss-avatar";
      avatar.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" fill="#9fb4ff"/>
          <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#7fa0ff" opacity=".65"/>
        </svg>`;
      header.appendChild(avatar);

      const title = document.createElement("h3");
      title.className = "ss-title";
      title.textContent = "MarketGuard Advisor Check";
      header.appendChild(title);

      const close = document.createElement("div");
      close.className = "ss-close";
      close.title = "Close";
      close.textContent = "×";
      close.onclick = () => {
        tip.classList.add("marketguard-out");      // fade out
        overlayClosed = true;
        setTimeout(() => tip.remove(), 220);       // remove after transition
      };
      header.appendChild(close);

      tip.appendChild(header);

      // Body
      const body = document.createElement("div");
      body.className = "ss-body";
      body.innerHTML = `
        <p class="ss-risk" data-ss-risk></p>
        <p class="ss-sub">Suspicious language flagged on this page.</p>
      `;
      tip.appendChild(body);

      // Divider + Actions
      const divider = document.createElement("div");
      divider.className = "ss-divider";
      tip.appendChild(divider);

      const actions = document.createElement("div");
      actions.className = "ss-actions";

      const highlights = document.createElement("button");
      highlights.className = "ss-btn ss-btn--danger";
      highlights.textContent = "View Highlights";
      highlights.onclick = () =>
        alert("High-risk cues: " + (json.highlights || []).map(h => h.span).join(", "));
      actions.appendChild(highlights);

      const verify = document.createElement("button");
      verify.className = "ss-btn";
      verify.textContent = "Verify Advisor (use selected text)";
      verify.onclick = async () => {
        const q = (getSelection()?.toString() || "").trim();
        if (!q) return alert("Select a name/handle first.");
        try {
          const res = await fetch(`${REG_API}?nameOrHandle=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (data.matches?.length) {
            const m = data.matches[0];
            alert(`Top match: ${m.name} • ${m.type} • ${m.status}\n${m.link || ""}`);
          } else {
            alert("No registry match found");
          }
        } catch {
          alert("Verify error");
        }
      };
      actions.appendChild(verify);

      tip.appendChild(actions);
      document.body.appendChild(tip);

      // make draggable
      makeDraggable(tip, header);

      // trigger fade-in on next frame
      requestAnimationFrame(() => tip.classList.add("marketguard-in"));
    }

    // Update risk text + pulse state in place
    const riskEl = tip.querySelector("[data-ss-risk]");
    if (riskEl) {
      riskEl.textContent = `MarketGuard Risk: ${json.risk} (${Math.round((json.score || 0) * 100)}%)`;
    }
    const isHigh = String(json.risk || "").toUpperCase() === "HIGH";
    tip.classList.toggle("marketguard-pulse", isHigh);
  }

  // ---------- Main scan (guarded & idempotent)
  function runScan() {
    if (isScanning || overlayClosed) return;
    isScanning = true;

    const nodes = collectTextNodes(document.body);
    nodes.forEach(n => highlightMatches(n, UPI_REGEX, "upi"));

    const phraseRegex = new RegExp(
      "\\b(" + RISK_TERMS.map(t => t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|") + ")\\b", "ig"
    );
    nodes.forEach(n => highlightMatches(n, phraseRegex, "risk"));

    const sample = (document.body.innerText || "").slice(0, 4000);
    fetch(NLP_API, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ lang: "en", text: sample, metadata: { source: "webpage", url: location.href } }),
    })
      .then(r => r.json())
      .then(json => upsertTooltip(json))
      .catch(() => { /* ignore */ })
      .finally(() => { isScanning = false; });
  }

  // ---------- Kick off + observe (simple debounce)
  runScan();
  const observer = new MutationObserver(() => {
    if (isScanning || overlayClosed) return;
    clearTimeout(observer._t);
    observer._t = setTimeout(runScan, 300);
  });
  observer.observe(document.body, { childList:true, subtree:true });
})();
// scripts/05c-registry-verify+upi.js
// Registry helpers + UPI scan/badging

(() => {
  const MG = (window.MG = window.MG || {});

  const RE_SEBI_REG = /\bIN[AHZP]\d{8}\b/i;
  const RE_PAN      = /\b[A-Z]{5}\d{4}[A-Z]\b/i;
  const RE_UPI      = MG.UPI_REGEX || /\b[a-z0-9._-]+@[a-z]{2,}\b/i;

  MG.classifyQuery = function classifyQuery(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (RE_SEBI_REG.test(t)) return { kind: "reg_no", value: t.toUpperCase() };
    if (RE_PAN.test(t))      return { kind: "pan",    value: t.toUpperCase() };
    if (RE_UPI.test(t))      return { kind: "upi",    value: t.toLowerCase() };
    return { kind: "name", value: t };
  };

  MG.registryVerify = async function registryVerify(params) {
    const base = MG?.API?.SEBI_REGISTRY;
    if (!base) throw new Error("SEBI registry API not configured");
    const qs = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    const url = `${base}?${qs.toString()}`;
    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail || "Registry service error");
    return j;
  };

  MG.summarizeMatches = function summarizeMatches(json) {
    const n = Number(json?.count || json?.matches?.length || 0);
    if (!n) return "No match";
    const first = (json.matches && json.matches[0]) || {};
    const who = first?.full_name || first?.username || first?.upi_id || first?.sebi_reg_no || "match";
    const typ = first?.intermediary_type ? ` • ${first.intermediary_type}` : "";
    const risk = first?.risk?.level ? ` • ${first.risk.level}` : "";
    return `${n} match${n>1?"es":""}: ${who}${typ}${risk}`;
  };

  // ---------- UPI inline chips ----------
  function textNodesUnder(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName?.toLowerCase();
        if (["script", "style", "noscript", "code"].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (p.closest?.("[contenteditable], [aria-hidden='true'], .mg-upi-wrap")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const list = []; let n; while ((n = walker.nextNode())) list.push(n);
    return list;
  }
  function makeUpiChip(upi) {
    const wrap = document.createElement("span"); wrap.className = "mg-upi-wrap";
    const chip = document.createElement("button"); chip.type = "button"; chip.className = "mg-upi-chip"; chip.textContent = "Verify UPI";
    chip.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      chip.disabled = true; const old = chip.textContent; chip.textContent = "…";
      try { const json = await MG.registryVerify({ upi: upi.toLowerCase() }); chip.textContent = MG.summarizeMatches(json); }
      catch { chip.textContent = "Error"; }
      finally { setTimeout(() => { chip.textContent = old; chip.disabled = false; }, 1600); }
    });
    wrap.appendChild(chip); return wrap;
  }
  function decorateUPIsInNode(textNode) {
    const text = textNode.nodeValue; if (!RE_UPI.test(text)) return;
    const frag = document.createDocumentFragment(); let lastIndex = 0;
    text.replace(new RegExp(RE_UPI, "gi"), (match, _h, idx) => {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
      const upiSpan = document.createElement("span"); upiSpan.className = "mg-upi-wrap";
      const upiText = document.createElement("span"); upiText.className = "mg-upi-badge"; upiText.textContent = match;
      upiSpan.appendChild(upiText); upiSpan.appendChild(makeUpiChip(match)); frag.appendChild(upiSpan);
      lastIndex = idx + match.length; return match;
    });
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  MG.scanAndBadgeUPIs = function (root = document.body) {
    MG.injectUpiChipStyles();
    const nodes = textNodesUnder(root);
    for (const n of nodes) decorateUPIsInNode(n);
  };
})();

// SEBI-Shield Starter Content Script (safe version)
// - Fixes: null parent replaceChild on dynamic pages
// - Captures match value for UPI click handler

(function () {
  const NLP_API = "http://localhost:8002/api/nlp/v1/score";
  const CHECK_API = "http://localhost:8003/api/check/v1/upi-verify";
  const REG_API = "http://localhost:8001/api/registry/v1/verify";

  const RISK_TERMS = [
    "guaranteed returns",
    "assured returns",
    "multibagger",
    "insider access",
    "FPI access",
    "DM me",
    "limited window",
    "send UPI",
    "double your money",
  ];

  const UPI_REGEX = /\b[A-Za-z0-9_.-]{2,}@[A-Za-z]{2,}\b/g;

  const STYLE = `
    .sebi-shield-badge { 
      display:inline-block; padding:2px 6px; margin-left:6px;
      font: 12px/1.2 sans-serif; border-radius: 4px; background:#ffedcc; color:#8a5500; 
      border:1px solid #f0c36d;
    }
    .sebi-shield-risk { background: #ffe5e5; color:#a80000; border-color:#ff8a8a; }
    .sebi-shield-tooltip {
      position:fixed; bottom:16px; right:16px; z-index:2147483647;
      background:white; padding:10px 12px; border:1px solid #ddd; border-radius:6px; box-shadow:0 2px 10px rgba(0,0,0,0.1);
      font: 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
    .sebi-shield-tooltip button { margin-left:8px; }
    mark.sebi-shield { background: #fff6a5; }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLE;
  document.documentElement.appendChild(styleEl);

  // Safe replace helper
  function safeReplace(node, frag) {
    try {
      if (!node || !frag || !frag.childNodes.length) return;
      const p = node.parentNode;
      if (!p || !document.contains(p)) return; // parent vanished
      p.replaceChild(frag, node);
    } catch (e) {
      // swallow; page mutated while we worked
      // console.debug("safeReplace skipped:", e);
    }
  }

  // Wrap matches in <mark> and attach badges/actions
  function highlightMatches(node, regex, className) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.nodeValue;
    if (!text) return;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement("mark");
      mark.className = "sebi-shield";
      mark.textContent = match[0];
      frag.appendChild(mark);

      if (className === "upi") {
        const b = document.createElement("span");
        b.className = "sebi-shield-badge";
        b.textContent = "Verify UPI";
        b.style.cursor = "pointer";
        const matchedText = match[0]; // capture now!

        b.addEventListener("click", async () => {
          b.textContent = "Verifying...";
          try {
            const res = await fetch(CHECK_API, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upi: matchedText }),
            });
            const json = await res.json();
            b.textContent =
              json.display || (json.verified ? "Verified" : "Not Found");
            b.classList.toggle("sebi-shield-risk", !json.verified);
          } catch (e) {
            console.error("UPI verify error:", e);
            b.textContent = "Error";
            b.title = (e && e.message) || "Request failed";
          }
        });
        frag.appendChild(b);
      }

      lastIndex = regex.lastIndex;
    }

    const after = text.slice(lastIndex);
    if (after) frag.appendChild(document.createTextNode(after));
    safeReplace(node, frag);
  }

  // Walk visible-ish text nodes
  function collectTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          if (!n.nodeValue || !n.nodeValue.trim())
            return NodeFilter.FILTER_REJECT;
          const p = n.parentElement;
          if (
            p &&
            ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(
              p.tagName
            )
          )
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );
    const out = [];
    let curr;
    while ((curr = walker.nextNode())) out.push(curr);
    return out;
  }

  function runScan() {
    const nodes = collectTextNodes(document.body);

    // 1) UPI highlights + inline verify
    nodes.forEach((n) => highlightMatches(n, UPI_REGEX, "upi"));

    // 2) Risk phrase highlights
    const phraseRegex = new RegExp(
      "\\b(" +
        RISK_TERMS.map((t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|") +
        ")\\b",
      "ig"
    );
    nodes.forEach((n) => highlightMatches(n, phraseRegex, "risk"));

    // 3) NLP page risk (best-effort; safe fail)
    const sample = (document.body.innerText || "").slice(0, 4000);
    fetch(NLP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: "en",
        text: sample,
        metadata: { source: "webpage", url: location.href },
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        const tip = document.createElement("div");
        tip.className = "sebi-shield-tooltip";
        tip.textContent = `SEBI-Shield Risk: ${json.risk} (${Math.round(
          (json.score || 0) * 100
        )}%)`;

        if (json.risk === "HIGH") {
          const badge = document.createElement("span");
          badge.className = "sebi-shield-badge sebi-shield-risk";
          badge.textContent = "View Highlights";
          badge.style.cursor = "pointer";
          badge.onclick = () =>
            alert(
              "High-risk cues: " +
                (json.highlights || []).map((h) => h.span).join(", ")
            );
          tip.appendChild(badge);
        }

        const btn = document.createElement("button");
        btn.textContent = "Verify Advisor (use selected text)";
        btn.onclick = async () => {
          const q = (window.getSelection()?.toString() || "").trim();
          if (!q) return alert("Select a name/handle first.");
          try {
            const res = await fetch(
              `${REG_API}?nameOrHandle=${encodeURIComponent(q)}`
            );
            const data = await res.json();
            if (data.matches && data.matches.length) {
              const m = data.matches[0];
              alert(
                `Top match: ${m.name} • ${m.type} • ${m.status}\n${m.link || ""}`
              );
            } else {
              alert("No registry match found");
            }
          } catch (e) {
            console.error("Advisor verify error:", e);
            alert("Verify error");
          }
        };
        tip.appendChild(btn);

        document.body.appendChild(tip);
      })
      .catch(() => {
        // quietly ignore network failures
      });
  }

  // Initial scan
  runScan();

  // Debounced rescans for dynamic pages
  let rescanTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(runScan, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

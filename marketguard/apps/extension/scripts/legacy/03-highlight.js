// Highlight UPI & risk phrases (skip editable areas)
(() => {
  const MG = window.MG;
  const { UPI_REGEX, RISK_TERMS } = MG;

  MG.highlightMatches = function highlightMatches(node, regex, mode) {
    if (node?.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || MG.isOurElement(parent) || MG.isEditable(parent)) return;

    const text = node.nodeValue || "";
    if (!text.trim()) return;

    const frag = document.createDocumentFragment();
    let lastIndex = 0, match; regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement("mark");
      mark.className = "marketguard";
      mark.textContent = match[0];
      if (mode === "risk") mark.dataset.mgFlag = "1";
      if (mode === "upi")  mark.dataset.mgUpi  = "1";
      frag.appendChild(mark);

      if (mode === "upi") {
        const btn = document.createElement("span");
        btn.className = "marketguard-badge-inline";
        btn.textContent = "Verify UPI";
        const matched = match[0];
        btn.addEventListener("click", async () => {
          btn.textContent = "Verifying...";
          try {
            const r = await fetch(MG.API.CHECK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upi: matched })
            });
            const j = await r.json();
            btn.textContent = j.display || (j.verified ? "Verified" : "Not Found");
            btn.classList.toggle("marketguard-risk", !j.verified);
          } catch { btn.textContent = "Error"; }
        });
        frag.appendChild(btn);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    MG.safeReplace(node, frag);
  };

  MG.collectTextNodes = function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!n.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (MG.isOurElement(p)) return NodeFilter.FILTER_REJECT;
        if (["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (MG.isEditable(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const out = []; let cur; while ((cur = walker.nextNode())) out.push(cur);
    return out;
  };

  MG.getPhraseRegex = () =>
    new RegExp("\\b(" + RISK_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "ig");
})();

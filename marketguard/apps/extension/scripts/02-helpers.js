// scripts/02-helpers.js
(() => {
  const MG = window.MG;

  // Query helpers
  MG.qs  = (s, r = document) => r.querySelector(s);
  MG.qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // DOM ownership
  MG.isOurElement = (el) =>
    el?.classList && [...el.classList].some(c => c.startsWith("marketguard") || c.startsWith("ss-"));

  // Editable detector
  MG.isEditable = (el) => {
    while (el && el.nodeType === 1) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  };

  // Safe replace (guards against detached parents)
  MG.safeReplace = (node, frag) => {
    try {
      if (!node || !frag?.childNodes.length) return;
      const p = node.parentNode;
      if (p && document.contains(p)) p.replaceChild(frag, node);
    } catch {}
  };

  // Drag helper with position persistence (chrome.storage.local)
  MG.makeDraggable = (box, handle, posKey) => {
    let sx, sy, sl, st, dragging = false;
    function onDown(e) {
      const evt = e.touches ? e.touches[0] : e;
      dragging = true;
      sx = evt.clientX; sy = evt.clientY;
      const r = box.getBoundingClientRect();
      box.style.left = r.left + "px";
      box.style.top  = r.top  + "px";
      box.style.right = "auto"; box.style.bottom = "auto";
      sl = r.left; st = r.top;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      const evt = e.touches ? e.touches[0] : e;
      if (e.touches) e.preventDefault();
      const left = sl + (evt.clientX - sx);
      const top  = st + (evt.clientY - sy);
      const m = 10, w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = Math.max(m, Math.min(innerWidth  - w - m, left)) + "px";
      box.style.top  = Math.max(m, Math.min(innerHeight - h - m, top )) + "px";
    }
    async function onUp() {
      if (!dragging) return; dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      try {
        const r = box.getBoundingClientRect();
        await chrome.storage.local.set({ [posKey]: { left: r.left, top: r.top } });
      } catch {}
    }
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: true });
  };

  // ---------- Selection guards (prevents selection from being lost) ----------
  MG.state = MG.state || {};
  MG.state.selectionLockedUntil = 0;
  MG.nowTs = () => Date.now();

  MG.selectionRoot = () => {
    const sel = document.getSelection();
    const n = sel?.anchorNode || sel?.focusNode;
    if (!n) return null;
    return n.nodeType === 3 ? n.parentElement : n;
  };

  MG.hasActiveSelection = () => {
    const sel = document.getSelection?.();
    if (!sel || sel.isCollapsed) return false;
    const root = MG.selectionRoot();
    if (!root) return false;
    if (MG.isOurElement(root) || root.closest?.(".marketguard-tooltip, .marketguard-fab")) return false;
    return true;
  };

  MG.isSelectionLocked = () => MG.state.selectionLockedUntil > MG.nowTs();

  MG.initSelectionGuards = () => {
    const lock = (ms = 1500) => { MG.state.selectionLockedUntil = MG.nowTs() + ms; };
    document.addEventListener("selectionchange", () => { if (MG.hasActiveSelection()) lock(1800); });
    document.addEventListener("pointerdown", (e) => {
      if (MG.isOurElement(e.target) || e.target.closest?.(".marketguard-tooltip, .marketguard-fab")) return;
      lock(1200);
    }, true);
    document.addEventListener("pointerup", () => { if (MG.hasActiveSelection()) lock(1800); }, true);
  };
})();

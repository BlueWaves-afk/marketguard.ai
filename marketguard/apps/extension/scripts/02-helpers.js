// DOM/utils, drag helper, safe replace, editable checks
(() => {
  const MG = window.MG;

  MG.qs  = (s, r=document) => r.querySelector(s);
  MG.qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  MG.pct = (x) => Math.round((Number(x)||0) * 100);
  MG.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  MG.nowTs = () => Date.now();

  MG.isOurElement = (el) =>
    el?.classList && [...el.classList].some(c => c.startsWith("marketguard") || c.startsWith("ss-"));

  MG.isEditable = (el) => {
    while (el && el.nodeType === 1) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  };

  MG.safeReplace = (node, frag) => {
    try {
      if (!node || !frag?.childNodes.length) return;
      const p = node.parentNode;
      if (p && document.contains(p)) p.replaceChild(frag, node);
    } catch {}
  };

  MG.makeDraggable = (box, handle, posKey) => {
    let startX, startY, startLeft, startTop, dragging = false;
    function onDown(e) {
      const evt = e.touches ? e.touches[0] : e;
      dragging = true; startX = evt.clientX; startY = evt.clientY;
      const r = box.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.top = r.top + "px";
      box.style.right = "auto"; box.style.bottom = "auto";
      startLeft = r.left; startTop = r.top;
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
      const m=10, vw=innerWidth, vh=innerHeight, w=box.offsetWidth, h=box.offsetHeight;
      box.style.left = MG.clamp(left, m, vw - w - m) + "px";
      box.style.top  = MG.clamp(top , m, vh - h - m) + "px";
    }
    async function onUp() {
      if (!dragging) return; dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      const r = box.getBoundingClientRect();
      await MG.saveLocal(posKey, { left: r.left, top: r.top });
    }
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: true });
  };
})();

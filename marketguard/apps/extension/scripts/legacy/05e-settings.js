// scripts/05e-settings.js
// Settings panel builder + vertical slide animations

(() => {
  const MG = (window.MG = window.MG || {});

  async function settleLayout() { try { await document.fonts?.ready; } catch {} await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  function getInner(el) { return MG.qs(".mg-settings__inner", el) || el; }

  MG.slideOpen = async function slideOpen(el, dur = 320) {
    if (!el) return;
    try { el._mgHeightAnim?.cancel(); el._mgInnerAnim?.cancel(); } catch {}
    const inner = getInner(el);
    el.hidden = false;
    el.style.contain = "layout paint size"; el.style.overflow = "clip"; el.style.willChange = "height";
    inner.style.willChange = "opacity, transform"; inner.style.opacity = "0"; inner.style.transform = "translateY(8px)";
    el.style.height = "auto"; await settleLayout(); const targetH = el.scrollHeight; el.style.height = "0px";
    const easing = "cubic-bezier(.25,.9,.25,1)";
    const heightAnim = el.animate([{ height: "0px" }, { height: targetH + "px" }], { duration: dur, easing, fill: "both", composite: "replace" });
    const innerAnim = inner.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
                                    { duration: dur * 0.9, easing, fill: "both", composite: "replace" });
    el._mgHeightAnim = heightAnim; el._mgInnerAnim = innerAnim;
    await Promise.allSettled([heightAnim.finished, innerAnim.finished]);
    el.style.height = ""; el.style.contain = ""; el.style.overflow = ""; el.style.willChange = ""; inner.style.willChange = ""; inner.style.opacity = ""; inner.style.transform = "";
    el._mgHeightAnim = el._mgInnerAnim = null;
  };

  MG.slideClose = async function slideClose(el, dur = 280) {
    if (!el) return;
    try { el._mgHeightAnim?.cancel(); el._mgInnerAnim?.cancel(); } catch {}
    const inner = getInner(el);
    el.style.contain = "layout paint size"; el.style.overflow = "clip"; el.style.willChange = "height"; inner.style.willChange = "opacity, transform";
    el.style.height = "auto"; await settleLayout(); const startH = el.scrollHeight;
    el.style.height = startH + "px"; inner.style.opacity = "1"; inner.style.transform = "translateY(0)";
    const easing = "cubic-bezier(.25,.9,.25,1)";
    const heightAnim = el.animate([{ height: startH + "px" }, { height: "0px" }], { duration: dur, easing, fill: "both", composite: "replace" });
    const innerAnim = inner.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(8px)" }],
                                    { duration: dur * 0.9, easing, fill: "both", composite: "replace" });
    el._mgHeightAnim = heightAnim; el._mgInnerAnim = innerAnim;
    await Promise.allSettled([heightAnim.finished, innerAnim.finished]);
    el.hidden = true; el.style.height = ""; el.style.contain = ""; el.style.overflow = ""; el.style.willChange = ""; inner.style.willChange = ""; inner.style.opacity = ""; inner.style.transform = "";
    el._mgHeightAnim = el._mgInnerAnim = null;
  };

  // ---------- settings panel ----------
  MG.buildSettingsPanel = (container) => {
    if (!container) return;
    const prefs = MG.getPrefs?.() || MG.getPrefs();

    container.innerHTML = "";

    // Pause scanning
    const rowPause = document.createElement("div");
    rowPause.className = "row";
    rowPause.innerHTML = `
      <label class="mg-field">
        <span class="mg-field-label">Pause scanning</span>
        <span class="mg-switch">
          <input type="checkbox" role="switch" aria-label="Pause scanning" data-mg-pause />
          <span class="mg-switch-track"><span class="mg-switch-thumb"></span></span>
        </span>
      </label>`;
    container.appendChild(rowPause);

    const elPause = MG.qs('[data-mg-pause]', rowPause);
    elPause.checked = !!prefs.pauseScanning;
    elPause.onchange = async () => {
      prefs.pauseScanning = elPause.checked;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}
      if (prefs.pauseScanning) {
        MG.removeOverlayIfAny?.();
        await MG.ensureFab?.();
        MG.setFabScore?.(NaN, "PAUSED");
      } else {
        MG.runScan?.();
      }
    };

    // Auto threshold
    const rowTh = document.createElement("div");
    rowTh.className = "row";
    rowTh.innerHTML = `
      <div class="mg-field">
        <span class="mg-field-label">Auto threshold</span>
        <div class="mg-range-wrap">
          <input class="mg-range" type="range" min="0" max="100" step="5" data-mg-th />
          <output class="mg-range-bubble" data-mg-th-val></output>
        </div>
      </div>`;
    container.appendChild(rowTh);

    const th = MG.qs("[data-mg-th]", rowTh);
    const thVal = MG.qs("[data-mg-th-val]", rowTh);
    const setRangeUI = () => { thVal.value = `${th.value}%`; thVal.textContent = `${th.value}%`; th.style.setProperty("--val", th.value); };
    th.value = MG.pct(prefs.threshold); setRangeUI();
    th.oninput = setRangeUI;
    th.onchange = async () => {
      prefs.threshold = Number(th.value) / 100;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}
      const tip = MG.qs(".marketguard-tooltip"); if (tip) MG.applyPrefsToOverlay(tip);
      if (MG.state?.lastRiskJson) MG.updateAutoShow?.(MG.state.lastRiskJson);
    };

    // Theme
    const rowTheme = document.createElement("div");
    rowTheme.className = "row";
    rowTheme.innerHTML = `
      <div class="mg-field">
        <span class="mg-field-label">Theme</span>
        <div class="mg-select">
          <select data-mg-theme aria-label="Theme">
            <option value="dark">glass-dark</option>
            <option value="light">glass-light</option>
          </select>
          <span class="mg-select-caret" aria-hidden="true"></span>
        </div>
      </div>`;
    container.appendChild(rowTheme);

    const themeSel = MG.qs("[data-mg-theme]", rowTheme);
    themeSel.value = prefs.theme;
    themeSel.onchange = async () => {
      prefs.theme = themeSel.value;
      try { await MG.saveSync(MG.KEYS.PREFS, prefs); } catch {}
      MG.applyPrefsToOverlay(MG.qs(".marketguard-tooltip"));
    };
  };
})();

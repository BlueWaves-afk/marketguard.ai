// scripts/new/settings.js
(() => {
  const MG = (window.MG = window.MG || {});

  function ensurePrefs() {
    if (!MG.state) MG.state = {};
    if (!MG.state.prefs || typeof MG.state.prefs !== 'object') MG.state.prefs = { ...(MG.DEFAULT_PREFS || { threshold: 0.6, theme: 'dark', defaultMode: 'compact', pauseScanning: false }) };
    return MG.state.prefs;
  }

  MG.loadPrefsFromStorage = async function loadPrefsFromStorage() {
    try {
      const stored = await MG.loadSync?.(MG.KEYS?.PREFS, null);
      const prefs = ensurePrefs();
      if (stored && typeof stored === 'object') Object.assign(prefs, stored);
      return prefs;
    } catch {
      return ensurePrefs();
    }
  };

  MG.savePrefsToStorage = async function savePrefsToStorage() {
    try { await MG.saveSync?.(MG.KEYS?.PREFS, ensurePrefs()); } catch {}
  };

  MG.applyPrefsToOverlay = function applyPrefsToOverlay(tip) {
    try {
      const prefs = ensurePrefs();
      const root = tip || document.querySelector('.marketguard-tooltip');
      if (!root) return;
      // Theme
      root.classList.toggle('mg-theme-light', prefs.theme === 'light');
      // Chips
      const chipThresh = root.querySelector('[data-chip-threshold]');
      const chipMode = root.querySelector('[data-chip-mode]');
      if (chipThresh) chipThresh.textContent = `Auto threshold: ${Math.round((Number(prefs.threshold || 0.6)) * 100)}%`;
      if (chipMode) chipMode.textContent = `Mode: ${String(prefs.defaultMode || 'compact')}`;
    } catch {}
  };

  MG.refreshFabFromState = function refreshFabFromState() {
    try {
      const fab = document.querySelector('.marketguard-fab');
      if (!fab) return;
      const paused = !!(MG.state?.prefs?.pauseScanning);
      const badge = fab.querySelector('.mg-badge--paused');
      if (badge) badge.hidden = !paused;
      const s = MG.state?.lastRiskJson?.score;
      const r = paused ? 'PAUSED' : MG.state?.lastRiskJson?.risk;
      MG.setFabScore?.(paused ? NaN : s, r);
    } catch {}
  };

  function buildRangeField(prefs) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-field';
    wrap.innerHTML = `
      <div class="mg-field-label">Auto threshold</div>
      <div class="mg-range-wrap">
        <input type="range" min="0.30" max="0.90" step="0.01" class="mg-range" value="${String(Number(prefs.threshold || 0.6).toFixed(2))}" />
        <div class="mg-range-bubble" data-range-bubble>${Math.round((Number(prefs.threshold || 0.6)) * 100)}%</div>
      </div>
    `;
    const range = wrap.querySelector('.mg-range');
    const bubble = wrap.querySelector('[data-range-bubble]');
    const setVal = (v) => { range.style.setProperty('--val', Math.round(v * 100)); bubble.textContent = `${Math.round(v * 100)}%`; };
    setVal(Number(range.value));
    range.addEventListener('input', () => setVal(Number(range.value)));
    range.addEventListener('change', async () => {
      ensurePrefs().threshold = Math.min(0.9, Math.max(0.3, Number(range.value)));
      await MG.savePrefsToStorage?.();
      MG.applyPrefsToOverlay?.();
      // trigger re-evaluation next heartbeat
    });
    return wrap;
  }

  function buildPauseField(prefs) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-field';
    const checked = prefs.pauseScanning ? 'checked' : '';
    wrap.innerHTML = `
      <div class="mg-field-label">Pause scanning</div>
      <label class="mg-switch">
        <input type="checkbox" ${checked} />
        <span class="mg-switch-track"><span class="mg-switch-thumb"></span></span>
      </label>
    `;
    const input = wrap.querySelector('input[type="checkbox"]');
    input.addEventListener('change', async () => {
      ensurePrefs().pauseScanning = !!input.checked;
      await MG.savePrefsToStorage?.();
      MG.refreshFabFromState?.();
      MG.applyPrefsToOverlay?.();
    });
    return wrap;
  }

  function buildThemeField(prefs) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-field';
    const theme = String(prefs.theme || 'dark');
    wrap.innerHTML = `
      <div class="mg-field-label">Theme</div>
      <div class="mg-select">
        <select>
          <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
        </select>
        <div class="mg-select-caret"></div>
      </div>
    `;
    const sel = wrap.querySelector('select');
    sel.addEventListener('change', async () => {
      ensurePrefs().theme = sel.value === 'light' ? 'light' : 'dark';
      await MG.savePrefsToStorage?.();
      MG.applyPrefsToOverlay?.();
    });
    return wrap;
  }

  function buildAnimationField(prefs) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-field';
    const anim = String(prefs.animation || 'genie');
    wrap.innerHTML = `
      <div class="mg-field-label">Animation</div>
      <div class="mg-select">
        <select>
          <option value="genie" ${anim === 'genie' ? 'selected' : ''}>Genie style</option>
          <option value="none" ${anim === 'none' ? 'selected' : ''}>No animation</option>
        </select>
        <div class="mg-select-caret"></div>
      </div>
    `;
    const sel = wrap.querySelector('select');
    sel.addEventListener('change', async () => {
      ensurePrefs().animation = sel.value === 'none' ? 'none' : 'genie';
      await MG.savePrefsToStorage?.();
    });
    return wrap;
  }

  function buildActionsRow() {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginTop = '8px';
    row.innerHTML = `
      <button class="ss-btn" data-mg-rescan>Re-scan now</button>
      <button class="ss-btn" data-mg-reset>Reset defaults</button>
    `;
    row.querySelector('[data-mg-rescan]')?.addEventListener('click', () => MG.runScan?.());
    row.querySelector('[data-mg-reset]')?.addEventListener('click', async () => {
      const prefs = ensurePrefs();
      Object.assign(prefs, MG.DEFAULT_PREFS || {});
      await MG.savePrefsToStorage?.();
      MG.applyPrefsToOverlay?.();
      MG.refreshFabFromState?.();
      // Rebuild panel UI to reflect defaults
      const panel = document.querySelector('.mg-settings__inner');
      if (panel) { panel.innerHTML = ''; MG.buildSettingsPanel?.(panel); }
    });
    return row;
  }

  MG.buildSettingsPanel = async function buildSettingsPanel(container) {
    try {
      if (!container) return;
      if (container.childElementCount > 0) { MG.applyPrefsToOverlay?.(); return; }
      const prefs = await MG.loadPrefsFromStorage?.();

      container.appendChild(buildRangeField(prefs));
      container.appendChild(buildPauseField(prefs));
      container.appendChild(buildThemeField(prefs));
      container.appendChild(buildAnimationField(prefs));
      container.appendChild(buildActionsRow());

      MG.applyPrefsToOverlay?.();
    } catch {}
  };

  // Load prefs ASAP on script load so other modules see them
  (async function initSettings() { try { await MG.loadPrefsFromStorage?.(); MG.refreshFabFromState?.(); } catch {} })();
})();




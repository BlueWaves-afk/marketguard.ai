// chrome.storage helpers
(() => {
  const MG = window.MG;

  MG.loadSync = (key, fallback) => new Promise(res => {
    try { chrome.storage.sync.get([key], o => res(o && o[key] != null ? o[key] : fallback)); }
    catch { res(fallback); }
  });

  MG.saveSync = (key, val) => new Promise(res => {
    try { chrome.storage.sync.set({ [key]: val }, res); } catch { res(); }
  });

  MG.loadLocal = (key, fallback) => new Promise(res => {
    try { chrome.storage.local.get([key], o => res(o && o[key] != null ? o[key] : fallback)); }
    catch { res(fallback); }
  });

  MG.saveLocal = (key, val) => new Promise(res => {
    try { chrome.storage.local.set({ [key]: val }, res); } catch { res(); }
  });
})();

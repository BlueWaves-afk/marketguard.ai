// background.js (MV3 service worker)
// Minimal fetch proxy so content scripts on HTTPS pages can call http://localhost:8003
// Usage from CS: chrome.runtime.sendMessage({ type: 'MG_PROXY_FETCH', url, method, headers, body })

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "MG_PROXY_FETCH") return;

  (async () => {
    try {
      const r = await fetch(msg.url, {
        method: msg.method || "GET",
        headers: msg.headers || {},
        body: msg.body ?? undefined,
        // keep credentials default (omit) since you're hitting localhost APIs
      });

      // Read as text so we can always send it back over postMessage
      const bodyText = await r.text();

      sendResponse({
        ok: r.ok,
        status: r.status,
        statusText: r.statusText,
        headers: Object.fromEntries(r.headers.entries()),
        bodyText
      });
    } catch (e) {
      sendResponse({
        ok: false,
        status: 0,
        statusText: e?.message || "proxy_fetch_error",
        headers: {},
        bodyText: ""
      });
    }
  })();

  // return true keeps the message channel open for the async sendResponse
  return true;
});
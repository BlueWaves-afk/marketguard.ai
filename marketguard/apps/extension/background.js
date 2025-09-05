// background.js (MV3 service worker)

// On toolbar icon click: ask the content script to force-show overlay
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "MARKETGUARD_FORCE_SHOW" });
  } catch (e) {
    // If content script isn't injected, you can optionally inject it programmatically:
    // await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    // await chrome.tabs.sendMessage(tab.id, { type: "MARKETGUARD_FORCE_SHOW" });
    console.debug("MARKETGUARD_FORCE_SHOW: content script not available", e);
  }
});

// ---- Viewport capture helper (PNG data URL) ----
async function captureViewportForTabId(tabId) {
  // Find the window for this tab; capture requires a windowId
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;

  // Capture the visible tab of that window
  // NOTE: Requires "tabs" permission (and "activeTab" for user gesture contexts).
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: "png", // lossless; can switch to "jpeg" with quality if desired
    quality: 92
  });

  return dataUrl; // data:image/png;base64,...
}

// Optional simple lock to avoid rapid repeated captures
let captureLock = false;
async function safeCapture(tabId) {
  if (captureLock) throw new Error("capture_in_progress");
  captureLock = true;
  try {
    return await captureViewportForTabId(tabId);
  } finally {
    // small cooldown to avoid spamming
    setTimeout(() => { captureLock = false; }, 200);
  }
}

// ---- Runtime message router ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Normalize type
    const type = msg?.type;

    // 1) Overlay poke (from popup or elsewhere)
    if (type === "MARKETGUARD_FORCE_SHOW") {
      const tabId = sender?.tab?.id ?? msg?.tabId;
      if (!tabId) return sendResponse({ ok: false, error: "no_tab" });
      try {
        await chrome.tabs.sendMessage(tabId, { type: "MARKETGUARD_FORCE_SHOW" });
        return sendResponse({ ok: true });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e || "failed") });
      }
    }

    // 2) Health check
    if (type === "MARKETGUARD_PING") {
      return sendResponse({ ok: true, pong: Date.now() });
    }

    // 3) Viewport screenshot request (used by overlay.js MG_CAPTURE_VIEWPORT)
    if (type === "MG_CAPTURE_VIEWPORT") {
      try {
        const tabId = sender?.tab?.id ?? msg?.tabId;
        if (!tabId) return sendResponse({ ok: false, error: "no_tab" });

        const dataUrl = await safeCapture(tabId);
        return sendResponse({ ok: true, dataUrl });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e || "capture_failed") });
      }
    }

    // Unknown messages: no-op
    return sendResponse({ ok: false, error: "unknown_message_type" });
  })();

  // Tell Chrome we'll reply asynchronously
  return true;
});

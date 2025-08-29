// background.js (service worker) — force overlay on icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "MARKETGUARD_FORCE_SHOW" });
  } catch (e) {
    // If content script isn't injected (inactive matches), try programmatic injection (optional)
    // await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    // await chrome.tabs.sendMessage(tab.id, { type: "MARKETGUARD_FORCE_SHOW" });
  }
});

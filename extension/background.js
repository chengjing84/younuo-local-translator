const DEFAULTS = {
  hostUrl: "http://127.0.0.1:8765", token: "", qwenModel: "qwen2.5:3b",
  sourceLanguage: "auto", targetLanguage: "zh", displayMode: "translation",
  glossary: { fixed: [], protected: [] }, setupComplete: false, settingsVersion: 4,
  translationSessions: {}, autoTranslateDomains: {}, translationStatuses: {}
};

function hostname(url) { try { return new URL(url).hostname; } catch { return ""; } }

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.local.get(DEFAULTS);
  if ((stored.settingsVersion || 0) < 4) {
    stored.sourceLanguage = "auto"; stored.targetLanguage = "zh"; stored.settingsVersion = 4;
  }
  await chrome.storage.local.set(stored);
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
});

async function hostRequest(path, options = {}) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.token) throw new Error("请先完成首次运行设置");
  const response = await fetch(`${settings.hostUrl}${path}`, {
    ...options, headers: { "Content-Type": "application/json", "X-Page-Translator-Token": settings.token, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `本机服务返回 ${response.status}`);
  return data;
}

async function setStatus(tabId, status, count = 0) {
  const { translationStatuses } = await chrome.storage.local.get({ translationStatuses: {} });
  translationStatuses[String(tabId)] = { status, count, updatedAt: Date.now() };
  await chrome.storage.local.set({ translationStatuses });
  chrome.runtime.sendMessage({ type: "TAB_TRANSLATION_STATUS", tabId, status, count }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_TAB_TRANSLATION_SESSION") {
    chrome.storage.local.get({ translationSessions: {}, autoTranslateDomains: {} }).then(async data => {
      data.translationSessions[String(message.tabId)] = message.session;
      if (message.hostname) data.autoTranslateDomains[message.hostname] = message.session;
      await chrome.storage.local.set(data); await setStatus(message.tabId, "working", 0); sendResponse({ ok: true });
    }); return true;
  }
  if (message.type === "CLEAR_TAB_TRANSLATION_SESSION") {
    chrome.storage.local.get({ translationSessions: {}, autoTranslateDomains: {} }).then(async data => {
      delete data.translationSessions[String(message.tabId)]; if (message.hostname) delete data.autoTranslateDomains[message.hostname];
      await chrome.storage.local.set(data); await setStatus(message.tabId, "idle", 0); sendResponse({ ok: true });
    }); return true;
  }
  if (message.type === "GET_TAB_TRANSLATION_SESSION") {
    const tabId = sender.tab?.id; const domain = hostname(sender.tab?.url || "");
    chrome.storage.local.get({ translationSessions: {}, autoTranslateDomains: {} }).then(data => sendResponse({ ok: true, session: tabId == null ? null : data.translationSessions[String(tabId)] || data.autoTranslateDomains[domain] || null })); return true;
  }
  if (message.type === "UPDATE_TRANSLATION_STATUS" && sender.tab?.id != null) { setStatus(sender.tab.id, message.status, message.count || 0).then(() => sendResponse({ ok: true })); return true; }
  if (message.type === "GET_TRANSLATION_STATUS") { chrome.storage.local.get({ translationStatuses: {} }).then(({ translationStatuses }) => sendResponse({ ok: true, data: translationStatuses[String(message.tabId)] || { status: "idle", count: 0 } })); return true; }
  if (message.type === "HOST_REQUEST") { hostRequest(message.path, message.options).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message })); return true; }
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.local.get({ translationSessions: {}, translationStatuses: {} }).then(async data => {
    delete data.translationSessions[String(tabId)]; delete data.translationStatuses[String(tabId)]; await chrome.storage.local.set(data);
  });
});

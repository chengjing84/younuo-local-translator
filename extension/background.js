const DEFAULTS = {
  hostUrl: "http://127.0.0.1:8765",
  token: "",
  qwenModel: "qwen2.5:3b",
  sourceLanguage: "auto",
  targetLanguage: "zh",
  glossary: { fixed: [], protected: [] },
  setupComplete: false,
  settingsVersion: 3
};

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.local.get(DEFAULTS);
  if ((stored.settingsVersion || 0) < 3) {
    stored.sourceLanguage = "auto";
    stored.targetLanguage = "zh";
    stored.settingsVersion = 3;
  }
  await chrome.storage.local.set(stored);
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
  }
});

async function hostRequest(path, options = {}) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.token) throw new Error("请先完成首次运行设置");
  const response = await fetch(`${settings.hostUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Page-Translator-Token": settings.token,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `本机服务返回 ${response.status}`);
  return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_TAB_TRANSLATION_SESSION") {
    chrome.storage.local.get({ translationSessions: {} }).then(({ translationSessions }) => {
      translationSessions[String(message.tabId)] = message.session;
      return chrome.storage.local.set({ translationSessions });
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "CLEAR_TAB_TRANSLATION_SESSION") {
    chrome.storage.local.get({ translationSessions: {} }).then(({ translationSessions }) => {
      delete translationSessions[String(message.tabId)];
      return chrome.storage.local.set({ translationSessions });
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "GET_TAB_TRANSLATION_SESSION") {
    const tabId = sender.tab?.id;
    chrome.storage.local.get({ translationSessions: {} }).then(({ translationSessions }) => {
      sendResponse({ ok: true, session: tabId == null ? null : translationSessions[String(tabId)] || null });
    });
    return true;
  }
  if (message.type === "HOST_REQUEST") {
    hostRequest(message.path, message.options)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.local.get({ translationSessions: {} }).then(({ translationSessions }) => {
    if (!(String(tabId) in translationSessions)) return;
    delete translationSessions[String(tabId)];
    return chrome.storage.local.set({ translationSessions });
  });
});

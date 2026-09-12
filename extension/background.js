/* Site preferences persist; tab status and requests are ephemeral. */
const DEFAULTS = {
  hostUrl: "http://127.0.0.1:8765",
  token: "",
  qwenModel: "qwen3.5:4b",
  provider: "ollama",
  apiUrl: "",
  apiKey: "",
  sourceLanguage: "auto",
  targetLanguage: "zh",
  displayMode: "translation",
  glossary: { fixed: [], protected: [] },
  setupComplete: false,
  settingsVersion: 5,
  autoTranslateOrigins: {},
};
const requests = new Map();
let writes = Promise.resolve();
function serialize(fn) {
  const job = writes.then(fn);
  writes = job.catch(() => {});
  return job;
}
function origin(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : "";
  } catch {
    return "";
  }
}
function requestKey(sender, id) {
  return `${sender.tab?.id ?? "ui"}:${sender.documentId || sender.frameId || 0}:${id}`;
}
function setTranslationBadge(tabId, status) {
  const working = status === "working";
  const updates = [
    chrome.action.setBadgeText({ tabId, text: working ? "•••" : "" }),
  ];
  if (working) {
    updates.push(
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#2f6b57" }),
    );
    if (chrome.action.setBadgeTextColor)
      updates.push(
        chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" }),
      );
  }
  Promise.all(updates).catch(() => {});
}
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const raw = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...raw, settingsVersion: 5 });
  await chrome.storage.local.remove([
    "translationSessions",
    "autoTranslateDomains",
    "translationStatuses",
  ]);
  if (reason === "install")
    await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
});
async function hostRequest(
  path,
  options = {},
  sender = {},
  id = crypto.randomUUID(),
) {
  if (!["/health", "/translate"].includes(path))
    throw new Error("不支持的接口");
  const settings = await chrome.storage.local.get(DEFAULTS);
  const host = new URL(settings.hostUrl);
  if (
    host.protocol !== "http:" ||
    host.hostname !== "127.0.0.1" ||
    host.username ||
    host.password ||
    host.pathname !== "/" ||
    host.search ||
    host.hash
  )
    throw new Error("服务地址必须是 http://127.0.0.1:端口");
  if (!settings.token) throw new Error("请先连接本机服务");
  const controller = new AbortController(),
    key = requestKey(sender, id);
  requests.set(key, { controller, tabId: sender.tab?.id });
  const timer = setTimeout(
    () => controller.abort(),
    path === "/health" ? 5000 : 25000,
  );
  try {
    const response = await fetch(settings.hostUrl + path, {
      method: path === "/health" ? "GET" : "POST",
      body:
        path === "/translate"
          ? JSON.stringify({
              ...JSON.parse(options.body),
              provider: settings.provider,
              external:
                settings.provider === "openai"
                  ? { url: settings.apiUrl, key: settings.apiKey }
                  : undefined,
            })
          : undefined,
      headers: {
        "Content-Type": "application/json",
        "X-Page-Translator-Token": settings.token,
      },
      signal: controller.signal,
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || `本机服务返回 ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("请求已取消或超时，请重试或切换模型");
    if (error instanceof TypeError)
      throw new Error("无法连接本机服务，请运行 start-host.cmd");
    throw error;
  } finally {
    clearTimeout(timer);
    requests.delete(key);
  }
}
async function getTab(tabId) {
  const tab = await chrome.tabs.get(tabId),
    site = origin(tab.url);
  if (!site) throw new Error("请在普通 HTTP / HTTPS 网页中使用");
  return { tab, site };
}
async function handle(message, sender) {
  if (message.type === "HOST_REQUEST")
    return {
      ok: true,
      data: await hostRequest(
        message.path,
        message.options,
        sender,
        message.requestId,
      ),
    };
  if (message.type === "CANCEL_HOST_REQUEST") {
    requests.get(requestKey(sender, message.requestId))?.controller.abort();
    return { ok: true };
  }
  if (message.type === "GET_TAB_TRANSLATION_SESSION") {
    if (sender.tab?.id == null) return { ok: true, session: null };
    const { site } = await getTab(sender.tab.id),
      { autoTranslateOrigins } = await chrome.storage.local.get(DEFAULTS);
    return {
      ok: true,
      session:
        origin(sender.url) === site ? autoTranslateOrigins[site] || null : null,
    };
  }
  if (message.type === "UPDATE_TRANSLATION_STATUS" && sender.tab?.id != null) {
    if (sender.frameId !== 0) return { ok: true };
    return serialize(async () => {
      const { site } = await getTab(sender.tab.id);
      if (origin(sender.url) !== site) return { ok: true };
      const { autoTranslateOrigins } = await chrome.storage.local.get(DEFAULTS);
      if (
        message.sessionId &&
        autoTranslateOrigins[site]?.id !== message.sessionId
      )
        return { ok: true };
      const data = {
        status: message.status,
        count: message.count || 0,
        error: message.error || "",
        origin: site,
        sessionId: message.sessionId,
      };
      setTranslationBadge(sender.tab.id, message.status);
      await chrome.storage.session.set({ [`status:${sender.tab.id}`]: data });
      chrome.runtime
        .sendMessage({
          type: "TAB_TRANSLATION_STATUS",
          tabId: sender.tab.id,
          ...data,
        })
        .catch(() => {});
      return { ok: true };
    });
  }
  if (!sender.url?.startsWith(chrome.runtime.getURL("")))
    throw new Error("不支持的消息来源");
  if (message.type === "CLEAR_SAVED_ORIGIN")
    return serialize(async () => {
      const { autoTranslateOrigins } = await chrome.storage.local.get(DEFAULTS);
      delete autoTranslateOrigins[message.origin];
      await chrome.storage.local.set({ autoTranslateOrigins });
      return { ok: true };
    });
  if (
    ["SET_TAB_TRANSLATION_SESSION", "CLEAR_TAB_TRANSLATION_SESSION"].includes(
      message.type,
    )
  )
    return serialize(async () => {
      const { site } = await getTab(message.tabId),
        settings = await chrome.storage.local.get(DEFAULTS);
      if (message.type === "CLEAR_TAB_TRANSLATION_SESSION")
        delete settings.autoTranslateOrigins[site];
      else {
        const s = message.session;
        if (
          !["auto", "en", "zh", "ja", "ko"].includes(s.source) ||
          !["en", "zh", "ja", "ko"].includes(s.target)
        )
          throw new Error("语言设置无效");
        if (
          typeof s.model !== "string" ||
          !/^[\w][\w./:-]{0,99}$/.test(s.model)
        )
          throw new Error("模型设置无效");
        if (!["ollama", "openai"].includes(s.provider || "ollama"))
          throw new Error("接入方式无效");
        settings.autoTranslateOrigins[site] = {
          ...s,
          origin: site,
          id: crypto.randomUUID(),
        };
      }
      await chrome.storage.local.set({
        autoTranslateOrigins: settings.autoTranslateOrigins,
      });
      if (message.type === "CLEAR_TAB_TRANSLATION_SESSION")
        setTranslationBadge(message.tabId, "idle");
      return { ok: true, session: settings.autoTranslateOrigins[site] || null };
    });
  if (message.type === "GET_TRANSLATION_STATUS") {
    const { site } = await getTab(message.tabId),
      { autoTranslateOrigins } = await chrome.storage.local.get(DEFAULTS),
      session = autoTranslateOrigins[site] || null,
      key = `status:${message.tabId}`;
    const stored = (await chrome.storage.session.get(key))[key];
    return {
      ok: true,
      session,
      data:
        stored?.origin === site && stored?.sessionId === session?.id
          ? stored
          : { status: session ? "ready" : "idle", count: 0 },
    };
  }
  throw new Error("不支持的消息");
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender)
    .then(reply)
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
function clearTab(tabId) {
  for (const request of requests.values())
    if (request.tabId === tabId) request.controller.abort();
  chrome.storage.session.remove(`status:${tabId}`).catch(() => {});
  setTranslationBadge(tabId, "idle");
}
chrome.tabs.onRemoved.addListener(clearTab);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") clearTab(tabId);
});

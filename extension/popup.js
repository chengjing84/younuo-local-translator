const $ = (s) => document.querySelector(s);
let tabId = null,
  enabled = false;
const defaults = {
  sourceLanguage: "auto",
  targetLanguage: "zh",
  qwenModel: "qwen3.5:4b",
  provider: "ollama",
  displayMode: "translation",
  setupComplete: false,
};
function status(text, kind = "") {
  $("#status").className = `status ${kind}`;
  $("#statusText").textContent = text;
}
function mode(value) {
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === value);
    b.setAttribute("aria-pressed", String(b.dataset.mode === value));
  });
}
function activity(data) {
  const labels = {
    working: `正在翻译 · 已处理 ${data.count || 0} 处`,
    complete: `已处理 ${data.count || 0} 处 · 自动跟随页面`,
    ready: "已开启 · 滚动时继续翻译",
    idle: "点击开始，翻译当前网站",
    error: data.error || "翻译中断，点击重试",
  };
  status(
    labels[data.status] || labels.ready,
    data.status === "error"
      ? "error"
      : data.status === "working"
        ? "busy"
        : enabled
          ? "success"
          : "",
  );
  $("#translateLabel").textContent =
    data.status === "error" ? "重试翻译" : enabled ? "重新翻译" : "开始翻译";
  $("#siteState").textContent = enabled ? "自动翻译已开启" : "仅在你开启后翻译";
}
async function message(data) {
  const r = await chrome.runtime.sendMessage(data);
  if (!r?.ok) throw new Error(r?.error || "扩展未响应");
  return r;
}
async function ensureContent() {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}
async function begin(display) {
  $("#translatePage").disabled = true;
  try {
    const s = await chrome.storage.local.get(defaults);
    if (!s.setupComplete) {
      await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
      window.close();
      return;
    }
    if (!tabId) throw new Error("请切换到普通网页");
    await ensureContent();
    const displayMode =
      display || (s.displayMode === "bilingual" ? "bilingual" : "translation");
    await chrome.storage.local.set({ displayMode });
    await message({
      type: "SET_TAB_TRANSLATION_SESSION",
      tabId,
      session: {
        source: $("#sourceLanguage").value,
        target: $("#targetLanguage").value,
        model: s.qwenModel,
        provider: s.provider,
      },
    });
    enabled = true;
    mode(displayMode);
    activity({ status: "working", count: 0 });
  } catch (e) {
    status(e.message, "error");
  } finally {
    $("#translatePage").disabled = false;
  }
}
$("#translatePage").onclick = () => begin();
$("#openOptions").onclick = () => chrome.runtime.openOptionsPage();
$("#connection").onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
for (const button of document.querySelectorAll("[data-mode]"))
  button.onclick = async () => {
    try {
      const value = button.dataset.mode;
      if (value === "original") {
        await message({ type: "CLEAR_TAB_TRANSLATION_SESSION", tabId });
        enabled = false;
        mode("original");
        activity({ status: "idle" });
      } else if (!enabled) await begin(value);
      else {
        await chrome.storage.local.set({ displayMode: value });
        mode(value);
      }
    } catch (e) {
      status(e.message, "error");
    }
  };
for (const id of ["sourceLanguage", "targetLanguage"])
  $("#" + id).onchange = async () => {
    const source = $("#sourceLanguage").value;
    if (source !== "auto" && source === $("#targetLanguage").value)
      $("#targetLanguage").value = source === "zh" ? "en" : "zh";
    await chrome.storage.local.set({
      sourceLanguage: source,
      targetLanguage: $("#targetLanguage").value,
    });
    if (enabled) await begin();
  };
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === "TAB_TRANSLATION_STATUS" && m.tabId === tabId) activity(m);
});
(async () => {
  const s = await chrome.storage.local.get(defaults);
  $("#sourceLanguage").value = s.sourceLanguage;
  $("#targetLanguage").value = s.targetLanguage;
  $("#modelCaption").textContent =
    s.provider === "openai"
      ? `外部 API · ${s.qwenModel}`
      : {
          "qwen3.5:4b": "Qwen3.5 4B · 日常推荐",
          "qwen3.5:9b": "Qwen3.5 9B · 质量悠闲",
          "qwen2.5:3b": "Qwen2.5 3B · 极致速度",
        }[s.qwenModel] || `自定义 Ollama · ${s.qwenModel}`;
  $("#connection").textContent = s.setupComplete ? "连接设置" : "连接本机服务";
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !/^https?:\/\//.test(tab.url || ""))
      throw new Error("请在普通网页使用，浏览器内部页无法翻译");
    tabId = tab.id;
    $("#siteName").textContent = new URL(tab.url).hostname;
    $("#siteName").title = tab.url;
    const r = await message({ type: "GET_TRANSLATION_STATUS", tabId });
    enabled = Boolean(r.session);
    if (r.session) {
      $("#sourceLanguage").value = r.session.source;
      $("#targetLanguage").value = r.session.target;
    }
    mode(enabled ? s.displayMode : "original");
    activity(r.data);
  } catch (e) {
    $("#siteName").textContent = "当前页面不可翻译";
    status(e.message, "error");
    $("#translatePage").disabled = true;
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => (b.disabled = true));
  }
})();

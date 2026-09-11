const DEFAULTS = {
  qwenModel: "qwen2.5:3b",
  sourceLanguage: "auto",
  targetLanguage: "zh",
  displayMode: "translation",
  setupComplete: false
};

const $ = selector => document.querySelector(selector);
const status = $("#status");
const translateButton = $("#translatePage");
const translateLabel = translateButton.querySelector("strong");
const popupShell = $(".popup-shell");
let openedTabId = null;

function setStatus(text, kind = "") {
  status.className = `status ${kind}`;
  status.children[1].textContent = text;
}

function setTranslating(active) {
  translateButton.disabled = active;
  translateButton.classList.toggle("is-translating", active);
  translateLabel.textContent = active ? "正在开启…" : "开始自动翻译";
}

function setActivity(activity, count = 0) {
  popupShell.classList.toggle("is-working", activity === "working");
  if (activity === "working") setStatus(count ? `翻译中，已处理 ${count} 处…` : "翻译中，正在处理页面…", "busy");
  if (activity === "complete") setStatus(count ? `已完成 ${count} 处，继续监听页面变化` : "已就绪，继续监听页面变化", "success");
  if (activity === "idle") setStatus("未开启自动翻译", "");
  if (activity === "error") setStatus("翻译中断，请重试", "error");
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("无法获取当前标签页");
  if (!/^https?:\/\//i.test(tab.url || "")) {
    throw new Error("Edge 内部页面无法翻译，请切换到普通网页");
  }
  return tab;
}

async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function tellPage(message) {
  const tab = await currentTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!String(error?.message || error).includes("Receiving end does not exist")) throw error;
    await injectContentScript(tab.id);
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function translate() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.setupComplete) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    window.close();
    return;
  }
  setTranslating(true);
  setStatus("翻译中，请稍候…", "busy");
  try {
    const tab = await currentTab();
    openedTabId = tab.id;
    const session = {
      source: settings.sourceLanguage,
      target: settings.targetLanguage,
      model: settings.qwenModel
    };
    await chrome.runtime.sendMessage({
      type: "SET_TAB_TRANSLATION_SESSION",
      tabId: tab.id,
      hostname: new URL(tab.url).hostname,
      session
    });
    const response = await tellPage({
      type: "START_TRANSLATION",
      ...session
    });
    if (!response?.ok) throw new Error(response?.error || "页面没有响应");
    setActivity("complete", response.count);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setTranslating(false);
  }
}

async function init() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  $("#sourceLanguage").value = settings.sourceLanguage;
  $("#targetLanguage").value = settings.targetLanguage;
  $("#modelCaption").textContent =
    `${settings.qwenModel.replace("qwen", "Qwen")} · 跟随页面滚动`;
  const activeId = settings.displayMode === "bilingual" ? "showBilingual" : settings.displayMode === "original" ? "showOriginal" : "showTranslation";
  document.querySelectorAll(".segmented button").forEach(button => button.classList.toggle("active", button.id === activeId));
  try {
    const tab = await currentTab();
    openedTabId = tab.id;
    const response = await chrome.runtime.sendMessage({ type: "GET_TRANSLATION_STATUS", tabId: tab.id });
    if (response?.ok) setActivity(response.data.status, response.data.count);
  } catch { /* protected Edge pages do not expose a translation state */ }
}

translateButton.addEventListener("click", translate);
$("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("#showOriginal").addEventListener("click", async () => {
  try {
    const tab = await currentTab();
    await chrome.runtime.sendMessage({ type: "CLEAR_TAB_TRANSLATION_SESSION", tabId: tab.id, hostname: new URL(tab.url).hostname });
    await tellPage({ type: "SHOW_ORIGINAL" });
    await chrome.storage.local.set({ displayMode: "original" });
    setActivity("idle");
  }
  catch (error) { setStatus(error.message, "error"); }
});
$("#showTranslation").addEventListener("click", async () => {
  try { await chrome.storage.local.set({ displayMode: "translation" }); await tellPage({ type: "SHOW_TRANSLATION" }); }
  catch (error) { setStatus(error.message, "error"); }
});
$("#showBilingual").addEventListener("click", async () => {
  try { await chrome.storage.local.set({ displayMode: "bilingual" }); await tellPage({ type: "SHOW_BILINGUAL" }); }
  catch (error) { setStatus(error.message, "error"); }
});

for (const id of ["sourceLanguage", "targetLanguage"]) {
  $(`#${id}`).addEventListener("change", async () => {
    const source = $("#sourceLanguage").value;
    let target = $("#targetLanguage").value;
    if (source !== "auto" && source === target) {
      target = source === "zh" ? "en" : "zh";
      $("#targetLanguage").value = target;
    }
    await chrome.storage.local.set({ sourceLanguage: source, targetLanguage: target });
  });
}

document.querySelectorAll(".segmented button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
  });
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "TAB_TRANSLATION_STATUS" && message.tabId === openedTabId) setActivity(message.status, message.count);
});

init();

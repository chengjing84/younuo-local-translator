const DEFAULTS = {
  qwenModel: "qwen2.5:3b",
  sourceLanguage: "auto",
  targetLanguage: "zh",
  setupComplete: false
};

const $ = selector => document.querySelector(selector);
const status = $("#status");
const translateButton = $("#translatePage");
const translateLabel = translateButton.querySelector("strong");

function setStatus(text, kind = "") {
  status.className = `status ${kind}`;
  status.children[1].textContent = text;
}

function setTranslating(active) {
  translateButton.disabled = active;
  translateButton.classList.toggle("is-translating", active);
  translateLabel.textContent = active ? "正在开启…" : "开始自动翻译";
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
    const session = {
      source: settings.sourceLanguage,
      target: settings.targetLanguage,
      model: settings.qwenModel
    };
    await chrome.runtime.sendMessage({
      type: "SET_TAB_TRANSLATION_SESSION",
      tabId: tab.id,
      session
    });
    const response = await tellPage({
      type: "START_TRANSLATION",
      ...session
    });
    if (!response?.ok) throw new Error(response?.error || "页面没有响应");
    setStatus(`自动翻译已开启，首批完成 ${response.count} 处`, "success");
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
}

translateButton.addEventListener("click", translate);
$("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("#showOriginal").addEventListener("click", async () => {
  try {
    const tab = await currentTab();
    await chrome.runtime.sendMessage({ type: "CLEAR_TAB_TRANSLATION_SESSION", tabId: tab.id });
    await tellPage({ type: "SHOW_ORIGINAL" });
    setStatus("已停止自动翻译并显示原文", "success");
  }
  catch (error) { setStatus(error.message, "error"); }
});
$("#showTranslation").addEventListener("click", async () => {
  try { await tellPage({ type: "SHOW_TRANSLATION" }); }
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

init();

const $ = selector => document.querySelector(selector);
let connected = false;

function checkRow(label, detail, state = "") {
  const row = document.createElement("div");
  row.className = `check-row ${state}`;
  row.innerHTML = `<span class="check-mark"></span><strong></strong><span class="check-detail"></span>`;
  row.children[1].textContent = label;
  row.children[2].textContent = detail;
  return row;
}

async function request(path) {
  const hostUrl = $("#hostUrl").value.replace(/\/$/, "");
  const token = $("#token").value.trim();
  const response = await fetch(hostUrl + path, {
    headers: { "X-Page-Translator-Token": token }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function checkHost() {
  const checks = $("#checks");
  checks.replaceChildren(checkRow("本机服务", "正在检查…"));
  try {
    const data = await request("/health");
    connected = true;
    await chrome.storage.local.set({
      hostUrl: $("#hostUrl").value.replace(/\/$/, ""),
      token: $("#token").value.trim()
    });
    checks.replaceChildren(checkRow("本机服务", `版本 ${data.version}`, "ok"));
    checks.append(checkRow(
      "Ollama",
      data.ollamaError || `${data.ollamaModels.length} 个模型`,
      data.ollamaError ? "error" : "ok"
    ));
    for (const model of ["qwen2.5:3b", "qwen3:1.7b"]) {
      const found = data.ollamaModels.some(name => name === model || name.startsWith(`${model}-`));
      checks.append(checkRow(model, found ? "已安装" : "尚未安装", found ? "ok" : "warn"));
    }
    $("#finish").disabled = Boolean(data.ollamaError);
  } catch (error) {
    connected = false;
    checks.replaceChildren(checkRow("本机服务", error.message, "error"));
    $("#finish").disabled = true;
  }
}

$("#checkHost").addEventListener("click", checkHost);
$("#finish").addEventListener("click", async () => {
  if (!connected) return;
  await chrome.storage.local.set({ setupComplete: true });
  window.close();
});
$("#openSettings").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.local.get({
  hostUrl: "http://127.0.0.1:8765",
  token: ""
}).then(settings => {
  $("#hostUrl").value = settings.hostUrl;
  $("#token").value = settings.token;
  if (settings.token) checkHost();
});

const $ = (s) => document.querySelector(s);
let verified = null;
function invalidate() {
  verified = null;
  $("#finish").disabled = true;
}
function row(label, detail, state = "") {
  const el = document.createElement("div");
  el.className = `check-row ${state}`;
  const dot = document.createElement("span"),
    name = document.createElement("strong"),
    value = document.createElement("span");
  dot.className = "check-mark";
  name.textContent = label;
  value.className = "check-detail";
  value.textContent = detail;
  el.append(dot, name, value);
  return el;
}
$("#token").oninput = invalidate;
$("#hostUrl").oninput = invalidate;
$("#checkHost").onclick = async () => {
  invalidate();
  $("#checkHost").disabled = true;
  const token = $("#token").value.trim();
  const hostUrl = $("#hostUrl").value.trim().replace(/\/$/, "");
  $("#checks").replaceChildren(row("本机服务", "正在检查…"));
  try {
    if (token.length < 16)
      throw new Error("请粘贴 host/config.json 中的完整 token");
    const host = new URL(hostUrl);
    if (
      host.protocol !== "http:" ||
      host.hostname !== "127.0.0.1" ||
      host.username ||
      host.password ||
      host.pathname !== "/" ||
      host.search ||
      host.hash
    )
      throw new Error("仅支持 http://127.0.0.1:端口");
    const response = await fetch(hostUrl + "/health", {
      headers: { "X-Page-Translator-Token": token },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "连接失败");
    if (data.protocolVersion !== 1)
      throw new Error("后台版本过旧，请停止旧服务并运行新版 start-host.cmd");
    if (
      token !== $("#token").value.trim() ||
      hostUrl !== $("#hostUrl").value.trim().replace(/\/$/, "")
    )
      return;
    const installed = YounuoSettings.models.filter((m) =>
      data.ollamaModels?.includes(m),
    );
    $("#checks").replaceChildren(
      row("本机服务", `v${data.version}`, "ok"),
      row(
        "Ollama",
        data.ollamaError || "已连接",
        data.ollamaError ? "error" : "ok",
      ),
    );
    const select = $("#qwenModel");
    select.replaceChildren();
    for (const model of installed) {
      const o = document.createElement("option");
      o.value = model;
      o.textContent = YounuoSettings.modelLabel(model);
      select.append(o);
    }
    if (!installed.length) {
      $("#checks").append(
        row("翻译模型", "未找到支持的模型，请先下载", "error"),
      );
      return;
    }
    $("#checks").append(row("翻译模型", `${installed.length} 个可用`, "ok"));
    verified = data.ollamaError ? null : { token, hostUrl };
    $("#finish").disabled = !verified;
  } catch (error) {
    $("#checks").replaceChildren(
      row(
        "连接未完成",
        error.name === "TimeoutError"
          ? "连接超时，请启动本机服务"
          : error.message,
        "error",
      ),
    );
  } finally {
    $("#checkHost").disabled = false;
  }
};
$("#finish").onclick = async () => {
  if (!verified || verified.token !== $("#token").value.trim()) return;
  await chrome.storage.local.set({
    hostUrl: verified.hostUrl,
    token: verified.token,
    qwenModel: $("#qwenModel").value,
    setupComplete: true,
  });
  $("#finish").textContent = "已连接，可以回到网页开始翻译";
  $("#finish").disabled = true;
};
$("#openSettings").onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.local
  .get({ token: "", hostUrl: "http://127.0.0.1:8765" })
  .then((s) => {
    $("#token").value = s.token;
    $("#hostUrl").value = s.hostUrl;
    if (s.token) $("#checkHost").click();
  });

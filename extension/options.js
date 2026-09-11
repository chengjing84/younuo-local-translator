const $ = (s) => document.querySelector(s);
let fixed = [];
function notify(text, error = false) {
  $("#saveStatus").textContent = text;
  $("#saveStatus").classList.toggle("error", error);
}
function renderFixed() {
  const body = $("#fixedRows");
  body.replaceChildren();
  fixed.forEach((item, index) => {
    const row = document.createElement("tr");
    for (const key of ["source", "target"]) {
      const td = document.createElement("td"),
        input = document.createElement("input");
      input.value = item[key];
      input.maxLength = 100;
      input.placeholder = key === "source" ? "workflow" : "工作流";
      input.setAttribute("aria-label", key === "source" ? "原词" : "固定译文");
      input.oninput = () => (fixed[index][key] = input.value);
      td.append(input);
      row.append(td);
    }
    const td = document.createElement("td"),
      button = document.createElement("button");
    button.className = "danger";
    button.textContent = "删除";
    button.onclick = () => {
      fixed.splice(index, 1);
      renderFixed();
    };
    td.append(button);
    row.append(td);
    body.append(row);
  });
  $("#emptyTerms").hidden = fixed.length > 0;
}
async function save() {
  const data = YounuoSettings.validate({
    qwenModel: $("#qwenModel").value,
    glossary: {
      fixed: fixed.filter((x) => x.source.trim() || x.target.trim()),
      protected: $("#protectedTerms")
        .value.split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
    },
  });
  await chrome.storage.local.set(data);
  notify("已保存 · 正在翻译的页面会使用新设置");
  return data;
}
async function init() {
  const s = await chrome.storage.local.get({
    qwenModel: "qwen2.5:3b",
    glossary: { fixed: [], protected: [] },
  });
  $("#qwenModel").value = s.qwenModel;
  fixed = s.glossary.fixed || [];
  $("#protectedTerms").value = (s.glossary.protected || []).join("\n");
  renderFixed();
  await renderSites();
}
async function renderSites() {
  const { autoTranslateOrigins = {} } = await chrome.storage.local.get(
    "autoTranslateOrigins",
  );
  $("#savedSites").replaceChildren();
  for (const site of Object.keys(autoTranslateOrigins)) {
    const row = document.createElement("div");
    row.className = "saved-site";
    const label = document.createElement("span"),
      button = document.createElement("button");
    label.textContent = site;
    button.textContent = "停止并移除";
    button.className = "text-button";
    button.onclick = async () => {
      try {
        const r = await chrome.runtime.sendMessage({
          type: "CLEAR_SAVED_ORIGIN",
          origin: site,
        });
        if (!r.ok) throw new Error(r.error);
        await renderSites();
      } catch (e) {
        notify(e.message, true);
      }
    };
    row.append(label, button);
    $("#savedSites").append(row);
  }
  $("#noSites").hidden = Object.keys(autoTranslateOrigins).length > 0;
}
$("#addFixed").onclick = () => {
  fixed.push({ source: "", target: "" });
  renderFixed();
  $("#fixedRows tr:last-child input")?.focus();
};
$("#save").onclick = () => save().catch((e) => notify(e.message, true));
$("#export").onclick = async () => {
  try {
    const data = await save(),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "younuo-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    notify(e.message, true);
  }
};
$("#import").onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 100000) throw new Error("设置文件不能超过 100 KB");
    const data = YounuoSettings.validate(JSON.parse(await file.text()));
    await chrome.storage.local.set(data);
    await init();
    notify("导入完成 · 连接令牌不会被更改");
  } catch (e) {
    notify("未导入：" + e.message, true);
  } finally {
    event.target.value = "";
  }
};
$("#checkModel").onclick = async () => {
  const b = $("#checkModel");
  b.disabled = true;
  $("#modelHealth").textContent = "正在检查…";
  try {
    const health = await YounuoSettings.request("/health");
    if (health.ollamaError) throw new Error(health.ollamaError);
    $("#modelHealth").textContent = health.ollamaModels.includes(
      $("#qwenModel").value,
    )
      ? "所选模型已安装，可以使用"
      : "所选模型尚未安装，请先运行 ollama pull " + $("#qwenModel").value;
  } catch (e) {
    $("#modelHealth").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoTranslateOrigins) renderSites();
});
init().catch((e) => notify(e.message, true));

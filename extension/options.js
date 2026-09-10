const $ = selector => document.querySelector(selector);
let fixed = [];

function renderFixed() {
  const body = $("#fixedRows");
  body.replaceChildren();
  fixed.forEach((item, index) => {
    const row = document.createElement("tr");
    const sourceCell = document.createElement("td");
    const targetCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const source = document.createElement("input");
    const target = document.createElement("input");
    const remove = document.createElement("button");
    source.value = item.source;
    target.value = item.target;
    source.placeholder = "extension";
    target.placeholder = "扩展";
    remove.className = "danger";
    remove.textContent = "删除";
    source.addEventListener("input", () => fixed[index].source = source.value);
    target.addEventListener("input", () => fixed[index].target = target.value);
    remove.addEventListener("click", () => {
      fixed.splice(index, 1);
      renderFixed();
    });
    sourceCell.append(source);
    targetCell.append(target);
    actionCell.append(remove);
    row.append(sourceCell, targetCell, actionCell);
    body.append(row);
  });
}

async function save() {
  const glossary = {
    fixed: fixed.filter(item => item.source.trim() && item.target.trim()),
    protected: $("#protectedTerms").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  };
  await chrome.storage.local.set({ qwenModel: $("#qwenModel").value, glossary });
  $("#saveStatus").textContent = "已保存到本机。";
}

async function init() {
  const settings = await chrome.storage.local.get({
    qwenModel: "qwen2.5:3b",
    glossary: { fixed: [], protected: [] }
  });
  $("#qwenModel").value = settings.qwenModel;
  fixed = settings.glossary.fixed || [];
  $("#protectedTerms").value = (settings.glossary.protected || []).join("\n");
  renderFixed();
}

$("#addFixed").addEventListener("click", () => {
  fixed.push({ source: "", target: "" });
  renderFixed();
});
$("#save").addEventListener("click", save);
$("#qwenModel").addEventListener("change", save);

$("#export").addEventListener("click", async () => {
  await save();
  const data = await chrome.storage.local.get(["qwenModel", "glossary"]);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "page-translator-settings.json";
  link.click();
  URL.revokeObjectURL(url);
});

$("#import").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.glossary || !Array.isArray(data.glossary.fixed) || !Array.isArray(data.glossary.protected)) {
      throw new Error("文件格式不正确");
    }
    await chrome.storage.local.set({
      qwenModel: data.qwenModel || "qwen2.5:3b",
      glossary: data.glossary
    });
    await init();
    $("#saveStatus").textContent = "导入完成。";
  } catch (error) {
    $("#saveStatus").textContent = `导入失败：${error.message}`;
  }
});

init();

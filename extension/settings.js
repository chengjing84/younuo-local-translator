globalThis.YounuoSettings = {
  models: ["qwen3.5:9b", "qwen2.5:3b", "qwen3:1.7b"],
  modelLabel(model) {
    return (
      {
        "qwen3.5:9b": "Qwen3.5 9B · 推荐",
        "qwen2.5:3b": "Qwen2.5 3B",
        "qwen3:1.7b": "Qwen3 1.7B · 试验",
      }[model] || model
    );
  },
  validate(data) {
    if (!data || !this.models.includes(data.qwenModel))
      throw new Error("请选择支持的 Qwen 模型");
    const g = data.glossary;
    if (
      !g ||
      !Array.isArray(g.fixed) ||
      !Array.isArray(g.protected) ||
      g.fixed.length > 100 ||
      g.protected.length > 100
    )
      throw new Error("固定译法和保护词各限 100 条");
    const term = (v) =>
      typeof v === "string" && v.trim().length > 0 && v.length <= 100;
    if (
      !g.fixed.every((x) => x && term(x.source) && term(x.target)) ||
      !g.protected.every(term)
    )
      throw new Error("术语必须是 1–100 字符的非空文字");
    const fixed = g.fixed.map((x) => ({
      source: x.source.trim(),
      target: x.target.trim(),
    }));
    if (new Set(fixed.map((x) => x.source)).size !== fixed.length)
      throw new Error("同一原词只能设置一种固定译法");
    return {
      qwenModel: data.qwenModel,
      glossary: {
        fixed,
        protected: [...new Set(g.protected.map((x) => x.trim()))],
      },
    };
  },
  async request(path) {
    const r = await chrome.runtime.sendMessage({ type: "HOST_REQUEST", path });
    if (!r?.ok) throw new Error(r?.error || "本机服务未响应");
    return r.data;
  },
};

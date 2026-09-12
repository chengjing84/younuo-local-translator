globalThis.YounuoSettings = {
  models: ["qwen3.5:4b", "qwen2.5:3b", "qwen3.5:9b"],
  modelLabel(model) {
    return (
      {
        "qwen2.5:3b": "Qwen2.5 3B · 极致速度",
        "qwen3.5:4b": "Qwen3.5 4B · 日常推荐",
        "qwen3.5:9b": "Qwen3.5 9B · 质量悠闲",
      }[model] || model
    );
  },
  validate(data, options = {}) {
    if (
      !data ||
      typeof data.qwenModel !== "string" ||
      !/^[\w][\w./:-]{0,99}$/.test(data.qwenModel.trim())
    )
      throw new Error("模型名称格式无效");
    const provider = data.provider === "openai" ? "openai" : "ollama";
    let apiUrl = "",
      apiKey = "";
    if (provider === "openai") {
      apiUrl = String(data.apiUrl || "").trim();
      apiKey = String(data.apiKey || "").trim();
      let url;
      try {
        url = new URL(apiUrl);
      } catch {
        throw new Error("外部 API 地址无效");
      }
      const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
      if (
        (!loopback && url.protocol !== "https:") ||
        (loopback && !["http:", "https:"].includes(url.protocol)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("外部 API 必须使用 HTTPS（本机地址可用 HTTP）");
      if ((!apiKey && !options.allowMissingApiKey) || apiKey.length > 500)
        throw new Error("请填写有效的 API Key");
    }
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
      qwenModel: data.qwenModel.trim(),
      provider,
      apiUrl,
      apiKey,
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

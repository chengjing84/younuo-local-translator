(() => {
  if (window.__younuoTranslatorLoaded) return;
  window.__younuoTranslatorLoaded = true;
  const EXCLUDED =
    'script,style,noscript,code,pre,textarea,input,select,option,svg,canvas,video,audio,[translate="no"],.notranslate,.younuo-toolbar,.younuo-selection-card,.younuo-bilingual-translation';
  const records = new Map(),
    pending = new Map(),
    requests = new Map(),
    cache = new Map();
  let activeSession = null,
    generation = 0,
    busyGeneration = null,
    observer = null;
  let timer = null,
    displayMode = "translation",
    translatedCount = 0,
    toolbar = null,
    card = null,
    selectionVersion = 0,
    syncVersion = 0;
  let glossary = { fixed: [], protected: [] };
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const sessionKey = (s) =>
    JSON.stringify([s.source, s.target, s.model, glossary]);
  const ownUI = (el) =>
    el?.closest(
      ".younuo-toolbar,.younuo-selection-card,.younuo-bilingual-translation",
    );
  function eligible(node, viewportOnly = true) {
    const el = node.parentElement;
    if (
      !el ||
      !node.isConnected ||
      el.isContentEditable ||
      el.closest(EXCLUDED)
    )
      return false;
    const text = normalize(node.nodeValue || "");
    if (text.length < 2 || text.length > 3000 || !/\p{L}/u.test(text))
      return false;
    if (!viewportOnly) return true;
    const rect = el.getBoundingClientRect(),
      style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.top <= innerHeight &&
      rect.right >= 0 &&
      rect.left <= innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0
    );
  }
  function removeBilingual(r) {
    r.bilingualNode?.remove();
    r.bilingualNode = null;
  }
  function recordFor(node) {
    let r = records.get(node);
    if (r && node.nodeValue !== r.expected) {
      removeBilingual(r);
      records.delete(node);
      pending.delete(node);
      r = null;
    }
    if (!r) {
      r = {
        originalText: node.nodeValue,
        normalizedText: normalize(node.nodeValue),
        expected: node.nodeValue,
        translations: new Map(),
        bilingualNode: null,
      };
      records.set(node, r);
    }
    return r;
  }
  function valid(node, r) {
    return (
      node.isConnected &&
      records.get(node) === r &&
      node.nodeValue === r.expected &&
      eligible(node, false)
    );
  }
  function preserveWhitespace(original, text) {
    return (
      (original.match(/^\s*/)?.[0] || "") +
      text.trim() +
      (original.match(/\s*$/)?.[0] || "")
    );
  }
  function renderRecord(node, r, key) {
    if (!valid(node, r)) return;
    removeBilingual(r);
    const text = r.translations.get(key);
    r.expected =
      text && displayMode === "translation"
        ? preserveWhitespace(r.originalText, text)
        : r.originalText;
    if (node.nodeValue !== r.expected) node.nodeValue = r.expected;
    if (text && displayMode === "bilingual") {
      const el = document.createElement("span");
      el.className = "younuo-bilingual-translation";
      el.textContent = text;
      el.lang = activeSession?.target || "";
      node.after(el);
      r.bilingualNode = el;
    }
  }
  function prune() {
    for (const [node, r] of records)
      if (!node.isConnected) {
        removeBilingual(r);
        records.delete(node);
        pending.delete(node);
      }
  }
  function reportActivity(status, error = "") {
    if (window.top !== window) return;
    chrome.runtime
      .sendMessage({
        type: "UPDATE_TRANSLATION_STATUS",
        status,
        error,
        count: translatedCount,
        sessionId: activeSession?.id,
      })
      .catch(() => {});
  }
  function hostRequest(body, kind = "page") {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      requests.set(requestId, { kind, reject });
      chrome.runtime.sendMessage(
        {
          type: "HOST_REQUEST",
          requestId,
          path: "/translate",
          options: { body: JSON.stringify(body) },
        },
        (response) => {
          if (!requests.delete(requestId)) return;
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          if (!response?.ok)
            return reject(new Error(response?.error || "翻译服务未响应"));
          resolve(response.data);
        },
      );
    });
  }
  function cancel(kind) {
    for (const [id, r] of requests)
      if (!kind || r.kind === kind) {
        requests.delete(id);
        r.reject(new Error("已取消"));
        chrome.runtime
          .sendMessage({ type: "CANCEL_HOST_REQUEST", requestId: id })
          .catch(() => {});
      }
  }
  function restore() {
    for (const [node, r] of records) {
      removeBilingual(r);
      if (node.isConnected && node.nodeValue === r.expected) {
        node.nodeValue = r.originalText;
        r.expected = r.originalText;
      } else records.delete(node);
    }
    prune();
  }
  function showOriginals() {
    generation++;
    activeSession = null;
    pending.clear();
    busyGeneration = null;
    clearTimeout(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    cancel("page");
    restore();
    displayMode = "original";
    reportActivity("idle");
  }
  function scan() {
    if (!activeSession || !document.body) return;
    prune();
    const key = sessionKey(activeSession),
      walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!eligible(node)) continue;
      const r = recordFor(node);
      if (r.translations.has(key) || pending.has(node)) continue;
      const cached = cache.get(key + "\n" + r.normalizedText);
      if (cached) {
        r.translations.clear();
        r.translations.set(key, cached);
        renderRecord(node, r, key);
        continue;
      }
      if (pending.size < 200) pending.set(node, r);
    }
    pump();
  }
  async function pump() {
    const epoch = generation;
    if (!activeSession || busyGeneration === epoch) return;
    busyGeneration = epoch;
    const session = { ...activeSession },
      key = sessionKey(session);
    let processed = false;
    try {
      while (activeSession && generation === epoch && pending.size) {
        const batch = [];
        for (const [node, r] of pending) {
          if (!valid(node, r) || !eligible(node) || r.translations.has(key)) {
            pending.delete(node);
            continue;
          }
          batch.push({ node, r });
          if (batch.length === 2) break;
        }
        if (!batch.length) break;
        reportActivity("working");
        const result = await hostRequest({
          mode: "precise",
          source: session.source,
          target: session.target,
          model: session.model,
          glossary,
          texts: batch.map((b) => b.r.normalizedText),
        });
        if (generation !== epoch || !activeSession) return;
        if (
          !Array.isArray(result.translations) ||
          result.translations.length !== batch.length ||
          result.translations.some((t) => typeof t !== "string" || !t.trim())
        )
          throw new Error("译文格式异常，请重试");
        batch.forEach(({ node, r }, i) => {
          if (pending.get(node) === r) pending.delete(node);
          if (!valid(node, r)) return;
          const translation = result.translations[i];
          r.translations.clear();
          r.translations.set(key, translation);
          cache.set(key + "\n" + r.normalizedText, translation);
          if (cache.size > 500) cache.delete(cache.keys().next().value);
          renderRecord(node, r, key);
          translatedCount++;
        });
        processed = true;
      }
      if (generation === epoch) {
        reportActivity("complete");
        if (processed) schedule();
      }
    } catch (error) {
      if (generation === epoch) {
        pending.clear();
        reportActivity("error", error.message);
      }
    } finally {
      if (generation === epoch) busyGeneration = null;
    }
  }
  function schedule() {
    if (timer || !activeSession) return;
    timer = setTimeout(() => {
      timer = null;
      scan();
    }, 220);
  }
  function observe() {
    observer?.disconnect();
    observer = new MutationObserver((changes) => {
      let changed = false;
      for (const m of changes) {
        if (m.type === "characterData") {
          const r = records.get(m.target);
          if (!r || m.target.nodeValue !== r.expected) changed = true;
        } else if (m.type === "attributes") changed = true;
        else if (
          [...m.addedNodes, ...m.removedNodes].some(
            (n) => n.nodeType === 3 || (n.nodeType === 1 && !ownUI(n)),
          )
        )
          changed = true;
      }
      if (changed) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "contenteditable", "translate"],
    });
  }
  async function startTranslation(session) {
    showOriginals();
    const epoch = generation;
    const stored = await chrome.storage.local.get({
      displayMode: "translation",
      glossary: { fixed: [], protected: [] },
      qwenModel: "qwen2.5:3b",
    });
    if (epoch !== generation) return;
    activeSession = { ...session, model: stored.qwenModel };
    glossary = stored.glossary;
    displayMode =
      stored.displayMode === "bilingual" ? "bilingual" : "translation";
    translatedCount = 0;
    const key = sessionKey(activeSession);
    for (const [node, r] of records) renderRecord(node, r, key);
    observe();
    reportActivity("ready");
    scan();
  }
  async function syncSession() {
    const version = ++syncVersion;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_TAB_TRANSLATION_SESSION",
      });
      if (version !== syncVersion) return;
      if (!response?.session) {
        showOriginals();
        return;
      }
      if (activeSession?.id !== response.session.id)
        await startTranslation(response.session);
    } catch {
      showOriginals();
    }
  }
  function setDisplay(mode) {
    displayMode = mode;
    if (!activeSession) return;
    const key = sessionKey(activeSession);
    prune();
    for (const [node, r] of records) renderRecord(node, r, key);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autoTranslateOrigins) syncSession();
    if (changes.displayMode && changes.displayMode.newValue !== "original")
      setDisplay(changes.displayMode.newValue);
    if ((changes.glossary || changes.qwenModel) && activeSession) {
      cache.clear();
      startTranslation({ ...activeSession });
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === "PING") {
      reply({ ok: true });
      return;
    }
    if (message.type === "START_TRANSLATION") {
      startTranslation(message).then(() => reply({ ok: true }));
      return true;
    }
    if (message.type === "SHOW_ORIGINAL") {
      showOriginals();
      reply({ ok: true });
    }
    if (message.type === "SHOW_TRANSLATION") {
      setDisplay("translation");
      reply({ ok: true });
    }
    if (message.type === "SHOW_BILINGUAL") {
      setDisplay("bilingual");
      reply({ ok: true });
    }
  });
  function removeFloating() {
    toolbar?.remove();
    toolbar = null;
  }
  function positionFloating(el, rect) {
    el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, rect.left))}px`;
    el.style.top = `${Math.max(8, rect.top - el.offsetHeight - 8 > 8 ? rect.top - el.offsetHeight - 8 : Math.min(innerHeight - el.offsetHeight - 8, rect.bottom + 8))}px`;
  }
  function showCard(text, rect, title, copyable = false) {
    card?.remove();
    card = document.createElement("section");
    card.className = "younuo-selection-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    const header = document.createElement("header"),
      label = document.createElement("strong"),
      close = document.createElement("button"),
      body = document.createElement("div");
    label.textContent = title;
    close.textContent = "关闭";
    close.onclick = () => {
      selectionVersion++;
      cancel("selection");
      card?.remove();
    };
    body.textContent = text;
    body.setAttribute("aria-live", "polite");
    header.append(label, close);
    card.append(header, body);
    if (copyable) {
      const copy = document.createElement("button");
      copy.textContent = "复制译文";
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "请选中文字复制";
        }
      };
      card.append(copy);
    }
    document.documentElement.append(card);
    positionFloating(card, rect);
  }
  async function translateSelection(text, mode, rect, current = "") {
    cancel("selection");
    const version = ++selectionVersion;
    const stored = await chrome.storage.local.get({
      sourceLanguage: "auto",
      targetLanguage: "zh",
      qwenModel: "qwen2.5:3b",
      glossary: { fixed: [], protected: [] },
    });
    if (version !== selectionVersion) return;
    removeFloating();
    showCard(
      "正在本机处理…",
      rect,
      mode === "polish" ? "润色译文" : "划词翻译",
    );
    try {
      const result = await hostRequest(
        {
          mode,
          source: stored.sourceLanguage,
          target: stored.targetLanguage,
          model: stored.qwenModel,
          glossary: stored.glossary,
          texts: [text],
          currentTranslations: current ? [current] : [],
        },
        "selection",
      );
      if (version === selectionVersion)
        showCard(result.translations[0], rect, "优诺 · 翻译结果", true);
    } catch (error) {
      if (version === selectionVersion)
        showCard(error.message, rect, "暂时无法翻译");
    }
  }
  function selectionToolbar() {
    const selection = getSelection(),
      text = selection?.toString().trim();
    removeFloating();
    if (!text || text.length < 2 || text.length > 3000 || !selection.rangeCount)
      return;
    const range = selection.getRangeAt(0),
      el =
        range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement;
    if (el?.isContentEditable || el?.closest(EXCLUDED)) return;
    const rect = range.getBoundingClientRect(),
      r = records.get(range.startContainer);
    toolbar = document.createElement("div");
    toolbar.className = "younuo-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "划词工具");
    const translate = document.createElement("button");
    translate.textContent = "翻译选中内容";
    translate.onclick = () => translateSelection(text, "precise", rect);
    toolbar.append(translate);
    // Only offer faithful polishing when the entire translated node maps to its original.
    if (
      r &&
      activeSession &&
      displayMode === "translation" &&
      range.startContainer === range.endContainer &&
      normalize(text) === normalize(r.expected) &&
      r.expected !== r.originalText
    ) {
      const polish = document.createElement("button");
      polish.textContent = "润色译文";
      polish.onclick = () =>
        translateSelection(r.normalizedText, "polish", rect, text);
      toolbar.append(polish);
    }
    document.documentElement.append(toolbar);
    positionFloating(toolbar, rect);
  }
  document.addEventListener("mouseup", (e) => {
    if (!ownUI(e.target)) setTimeout(selectionToolbar, 0);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") selectionToolbar();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeFloating();
      card?.remove();
      selectionVersion++;
      cancel("selection");
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (!ownUI(e.target)) removeFloating();
  });
  addEventListener("scroll", schedule, { passive: true, capture: true });
  addEventListener("resize", schedule, { passive: true });
  addEventListener("pagehide", () => {
    showOriginals();
    cancel();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) syncSession();
  });
  syncSession();
})();

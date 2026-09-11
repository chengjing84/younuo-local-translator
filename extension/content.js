(() => {
  if (window.__younuoTranslatorLoaded) return;
  window.__younuoTranslatorLoaded = true;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "SVG", "CANVAS", "VIDEO", "AUDIO"
  ]);
  const records = new Map();
  let activeSession = null;
  let translateQueue = Promise.resolve();
  let observer = null;
  let scrollTimer = null;
  let displayMode = "translation";
  let translatedCount = 0;
  let toolbar = null;
  let card = null;

  function parentElement(node) {
    return node.parentElement || node.parentNode?.parentElement || null;
  }

  function visible(node) {
    const element = parentElement(node);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function eligible(node, viewportOnly) {
    const element = parentElement(node);
    if (!element || !node.nodeValue?.trim()) return false;
    if (SKIP_TAGS.has(element.tagName)) return false;
    if (element.closest("[contenteditable='true'], .younuo-toolbar, .younuo-selection-card, .younuo-bilingual-translation")) return false;
    if (!node.isConnected) return false;
    const text = node.nodeValue.replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 1200) return false;
    if (!/[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return false;
    return !viewportOnly || visible(node);
  }

  function recordFor(node) {
    let record = records.get(node);
    if (record) {
      const current = node.nodeValue;
      const key = activeSession ? sessionKey(activeSession) : "";
      const translated = key ? record.translations.get(key) : "";
      const expected = record.showing === "translation" && translated
        ? preserveWhitespace(record.originalText, translated)
        : record.originalText;
      if (current !== expected) {
        records.delete(node);
        record = null;
      }
    }
    if (!record) {
      record = {
        originalText: node.nodeValue,
        normalizedText: node.nodeValue.replace(/\s+/g, " ").trim(),
        translations: new Map(),
        showing: "original",
        bilingualNode: null
      };
      records.set(node, record);
    }
    return record;
  }

  function collect(viewportOnly) {
    if (!document.body) return [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const blocks = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!eligible(node, viewportOnly)) continue;
      const record = recordFor(node);
      blocks.push({ node, record, text: record.normalizedText });
    }
    return blocks;
  }

  function sessionKey(session) {
    return `${session.source}:${session.target}:${session.model}`;
  }

  function untranslatedVisible() {
    if (!activeSession) return [];
    const key = sessionKey(activeSession);
    return collect(true).filter(block => !block.record.translations.has(key));
  }

  function hostRequest(path, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "HOST_REQUEST",
        path,
        options: { method: "POST", body: JSON.stringify(body) }
      }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || "本机服务请求失败"));
        resolve(response.data);
      });
    });
  }

  function reportActivity(status) {
    chrome.runtime.sendMessage({ type: "UPDATE_TRANSLATION_STATUS", status, count: translatedCount }).catch(() => {});
  }

  async function settings() {
    return chrome.storage.local.get({
      qwenModel: "qwen2.5:3b",
      displayMode: "translation",
      glossary: { fixed: [], protected: [] }
    });
  }

  function preserveWhitespace(original, translated) {
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    return `${leading}${translated.trim()}${trailing}`;
  }

  function removeBilingual(record) {
    record.bilingualNode?.remove();
    record.bilingualNode = null;
  }

  function renderRecord(node, record, key) {
    removeBilingual(record);
    const translation = record.translations.get(key);
    if (!translation || displayMode === "original") {
      node.nodeValue = record.originalText;
      record.showing = "original";
      return;
    }
    if (displayMode === "bilingual") {
      node.nodeValue = record.originalText;
      const bilingual = document.createElement("span");
      bilingual.className = "younuo-bilingual-translation";
      bilingual.textContent = `〔译：${translation}〕`;
      node.after(bilingual);
      record.bilingualNode = bilingual;
      record.showing = "bilingual";
      return;
    }
    node.nodeValue = preserveWhitespace(record.originalText, translation);
    record.showing = "translation";
  }

  function applyTranslation(block, translation, key) {
    block.record.translations.set(key, translation);
    if (!block.node.isConnected) return;
    renderRecord(block.node, block.record, key);
  }

  function showOriginals() {
    activeSession = null;
    observer?.disconnect();
    observer = null;
    clearTimeout(scrollTimer);
    reportActivity("idle");
    displayMode = "original";
    for (const [node, record] of records) {
      if (!node.isConnected) {
        records.delete(node);
      } else {
        removeBilingual(record);
        if (record.showing !== "original") {
          node.nodeValue = record.originalText;
          record.showing = "original";
        }
      }
    }
  }

  function showCurrentTranslations() {
    displayMode = "translation";
    if (!activeSession) return;
    const key = sessionKey(activeSession);
    for (const [node, record] of records) {
      if (!node.isConnected) {
        records.delete(node);
        continue;
      }
      if (record.translations.get(key)) renderRecord(node, record, key);
    }
  }

  function showBilingualTranslations() {
    displayMode = "bilingual";
    if (!activeSession) return;
    const key = sessionKey(activeSession);
    for (const [node, record] of records) {
      if (!node.isConnected) { records.delete(node); continue; }
      if (record.translations.get(key)) renderRecord(node, record, key);
    }
  }

  async function translateBlocks(blocks) {
    if (!activeSession || blocks.length === 0) return 0;
    const session = { ...activeSession };
    const key = sessionKey(session);
    const stored = await settings();
    reportActivity("working");
    let completed = 0;
    for (let index = 0; index < blocks.length; index += 4) {
      if (!activeSession || sessionKey(activeSession) !== key) break;
      const batch = blocks.slice(index, index + 4);
      const result = await hostRequest("/translate", {
        mode: "precise",
        source: session.source,
        target: session.target,
        model: session.model || stored.qwenModel,
        glossary: stored.glossary,
        texts: batch.map(block => block.text)
      });
      result.translations.forEach((translation, offset) => {
        const block = batch[offset];
        if (block?.node.isConnected && translation) {
          applyTranslation(block, translation, key);
          completed++;
          translatedCount++;
        }
      });
    }
    reportActivity("complete");
    return completed;
  }

  function enqueue(blocks) {
    const unique = [...new Map(blocks.map(block => [block.node, block])).values()];
    translateQueue = translateQueue.catch(() => {}).then(() => translateBlocks(unique)).catch(error => {
      reportActivity("error");
      throw error;
    });
    return translateQueue;
  }

  function scheduleVisibleTranslation() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!activeSession) return;
      const blocks = untranslatedVisible();
      if (blocks.length) enqueue(blocks).catch(() => {});
    }, 180);
  }

  function startContinuation() {
    observer?.disconnect();
    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation =>
        mutation.type === "characterData" || mutation.addedNodes.length > 0
      )) scheduleVisibleTranslation();
    });
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  async function startTranslation(message) {
    activeSession = {
      source: message.source,
      target: message.target,
      model: message.model
    };
    const stored = await settings();
    displayMode = stored.displayMode || "translation";
    translatedCount = 0;
    reportActivity("working");
    const count = await enqueue(untranslatedVisible());
    startContinuation();
    reportActivity("complete");
    return count;
  }

  function removeFloating() {
    toolbar?.remove();
    toolbar = null;
  }

  function positionFloating(element, rect) {
    const left = Math.max(8, Math.min(innerWidth - element.offsetWidth - 8, rect.left));
    const preferredTop = rect.top - element.offsetHeight - 8;
    const top = preferredTop > 8 ? preferredTop : Math.min(innerHeight - element.offsetHeight - 8, rect.bottom + 8);
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(8, top)}px`;
  }

  async function translateSelection(text, mode, rect, currentTranslation = "") {
    const stored = await chrome.storage.local.get({
      sourceLanguage: "auto",
      targetLanguage: "zh",
      qwenModel: "qwen2.5:3b",
      glossary: { fixed: [], protected: [] }
    });
    showCard("正在处理…", rect, mode === "polish" ? "润色翻译" : "高精度翻译");
    try {
      const result = await hostRequest("/translate", {
        mode,
        source: stored.sourceLanguage,
        target: stored.targetLanguage,
        model: stored.qwenModel,
        glossary: stored.glossary,
        texts: [text],
        currentTranslations: currentTranslation ? [currentTranslation] : []
      });
      showCard(result.translations[0], rect, mode === "polish" ? "润色结果" : "翻译结果");
    } catch (error) {
      showCard(error.message, rect, "翻译失败");
    }
  }

  function showCard(text, rect, title) {
    card?.remove();
    card = document.createElement("div");
    card.className = "younuo-selection-card";
    const header = document.createElement("header");
    const label = document.createElement("span");
    label.textContent = title;
    const close = document.createElement("button");
    close.textContent = "关闭";
    close.addEventListener("click", () => card?.remove());
    const content = document.createElement("div");
    content.textContent = text;
    header.append(label, close);
    card.append(header, content);
    document.documentElement.append(card);
    positionFloating(card, rect);
  }

  document.addEventListener("mouseup", event => {
    if (event.target.closest?.(".younuo-toolbar, .younuo-selection-card")) return;
    setTimeout(() => {
      const selection = getSelection();
      const selectedText = selection?.toString().trim();
      removeFloating();
      if (!selectedText || selectedText.length < 2 || selectedText.length > 3000 || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const record = records.get(range.startContainer);
      const original = record?.normalizedText || selectedText;
      toolbar = document.createElement("div");
      toolbar.className = "younuo-toolbar";
      const translateButton = document.createElement("button");
      translateButton.textContent = "翻译";
      translateButton.addEventListener("click", () => translateSelection(original, "precise", rect));
      const polishButton = document.createElement("button");
      polishButton.textContent = "润色";
      polishButton.addEventListener("click", () =>
        translateSelection(original, "polish", rect, record ? selectedText : "")
      );
      toolbar.append(translateButton, polishButton);
      document.documentElement.append(toolbar);
      positionFloating(toolbar, rect);
    }, 0);
  });

  document.addEventListener("mousedown", event => {
    if (!event.target.closest?.(".younuo-toolbar, .younuo-selection-card")) removeFloating();
  });
  addEventListener("scroll", scheduleVisibleTranslation, { passive: true });
  addEventListener("resize", scheduleVisibleTranslation, { passive: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SHOW_ORIGINAL") {
      showOriginals();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "SHOW_TRANSLATION") {
      showCurrentTranslations();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "SHOW_BILINGUAL") {
      showBilingualTranslations();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "START_TRANSLATION") {
      startTranslation(message)
        .then(count => sendResponse({ ok: true, count }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: "GET_TAB_TRANSLATION_SESSION" }, response => {
    if (chrome.runtime.lastError || !response?.session) return;
    startTranslation(response.session).catch(() => {});
  });
})();

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
function fixture() {
  const local = { autoTranslateOrigins: {} },
    session = {},
    badges = [],
    tabs = {
      1: { id: 1, url: "https://a.example/page" },
      2: { id: 2, url: "https://a.example/second" },
    };
  let handler;
  const area = (store) => ({
    get: async (arg) =>
      structuredClone(
        typeof arg === "string" ? { [arg]: store[arg] } : { ...arg, ...store },
      ),
    set: async (values) => Object.assign(store, structuredClone(values)),
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    },
  });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    action: {
      setBadgeText: async (value) => badges.push(value),
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
    },
    runtime: {
      getURL: (p) => "chrome-extension://" + "a".repeat(32) + "/" + p,
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => (handler = fn) },
      sendMessage: async () => {},
    },
    tabs: {
      get: async (id) => tabs[id],
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8"),
    {
      chrome,
      URL,
      crypto: require("node:crypto").webcrypto,
      AbortController,
      setTimeout,
      clearTimeout,
    },
  );
  const ui = { url: chrome.runtime.getURL("popup.html") };
  return {
    local,
    badges,
    tabs,
    call: (message, sender = ui) =>
      new Promise((r) => handler(message, sender, r)),
    sender: (id) => ({ tab: tabs[id], url: tabs[id].url, frameId: 0 }),
  };
}
const session = { source: "auto", target: "zh", model: "qwen2.5:3b" };
test("navigation cannot inherit an unrelated origin session", async () => {
  const f = fixture();
  assert.equal(
    (await f.call({ type: "SET_TAB_TRANSLATION_SESSION", tabId: 1, session }))
      .ok,
    true,
  );
  f.tabs[1].url = "https://b.example/private";
  assert.equal(
    (await f.call({ type: "GET_TAB_TRANSLATION_SESSION" }, f.sender(1)))
      .session,
    null,
  );
});
test("same-origin tabs share consent; clearing removes it everywhere", async () => {
  const f = fixture();
  await f.call({ type: "SET_TAB_TRANSLATION_SESSION", tabId: 1, session });
  assert.ok(
    (await f.call({ type: "GET_TAB_TRANSLATION_SESSION" }, f.sender(2)))
      .session,
  );
  await f.call({ type: "CLEAR_TAB_TRANSLATION_SESSION", tabId: 1 });
  assert.equal(
    (await f.call({ type: "GET_TAB_TRANSLATION_SESSION" }, f.sender(2)))
      .session,
    null,
  );
});
test("third-party frames do not inherit top-level consent", async () => {
  const f = fixture();
  await f.call({ type: "SET_TAB_TRANSLATION_SESSION", tabId: 1, session });
  assert.equal(
    (
      await f.call(
        { type: "GET_TAB_TRANSLATION_SESSION" },
        { ...f.sender(1), frameId: 2, url: "https://third.example/" },
      )
    ).session,
    null,
  );
});
test("concurrent writes retain both origins", async () => {
  const f = fixture();
  f.tabs[2].url = "https://b.example";
  await Promise.all(
    [1, 2].map((tabId) =>
      f.call({ type: "SET_TAB_TRANSLATION_SESSION", tabId, session }),
    ),
  );
  assert.equal(Object.keys(f.local.autoTranslateOrigins).length, 2);
});
test("web content cannot mutate site preferences", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call(
        { type: "SET_TAB_TRANSLATION_SESSION", tabId: 1, session },
        f.sender(1),
      )
    ).ok,
    false,
  );
});
test("obsolete session status is ignored", async () => {
  const f = fixture();
  await f.call({ type: "SET_TAB_TRANSLATION_SESSION", tabId: 1, session });
  await f.call(
    {
      type: "UPDATE_TRANSLATION_STATUS",
      sessionId: "obsolete",
      status: "complete",
    },
    f.sender(1),
  );
  assert.equal(
    (await f.call({ type: "GET_TRANSLATION_STATUS", tabId: 1 })).data.status,
    "ready",
  );
});
test("working status appears on the extension icon and clears when done", async () => {
  const f = fixture();
  const started = await f.call({
    type: "SET_TAB_TRANSLATION_SESSION",
    tabId: 1,
    session,
  });
  await f.call(
    {
      type: "UPDATE_TRANSLATION_STATUS",
      sessionId: started.session.id,
      status: "working",
      count: 0,
    },
    f.sender(1),
  );
  assert.equal(f.badges.at(-1).text, "•••");
  await f.call(
    {
      type: "UPDATE_TRANSLATION_STATUS",
      sessionId: started.session.id,
      status: "complete",
      count: 2,
    },
    f.sender(1),
  );
  assert.equal(f.badges.at(-1).text, "");
});
test("settings import validation rejects malformed entries before persistence", () => {
  const c = { URL };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../extension/settings.js"), "utf8"),
    c,
  );
  assert.equal(
    c.YounuoSettings.validate({
      qwenModel: "my-model:latest",
      glossary: { fixed: [], protected: [] },
    }).qwenModel,
    "my-model:latest",
  );
  const external = c.YounuoSettings.validate({
    qwenModel: "vendor/model",
    provider: "openai",
    apiUrl: "https://api.example.com/v1/chat/completions",
    apiKey: "secret",
    glossary: { fixed: [], protected: [] },
  });
  assert.equal(external.provider, "openai");
  assert.throws(() =>
    c.YounuoSettings.validate({
      qwenModel: "vendor/model",
      provider: "openai",
      apiUrl: "http://api.example.com/v1/chat/completions",
      apiKey: "secret",
      glossary: { fixed: [], protected: [] },
    }),
  );
  for (const g of [
    { fixed: [null], protected: [] },
    { fixed: [], protected: [1] },
    {
      fixed: [
        { source: "x", target: "y" },
        { source: "x", target: "z" },
      ],
      protected: [],
    },
  ])
    assert.throws(() =>
      c.YounuoSettings.validate({ qwenModel: "qwen2.5:3b", glossary: g }),
    );
});

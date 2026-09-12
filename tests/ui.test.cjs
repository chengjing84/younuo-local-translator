const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright"),
  path = require("path"),
  { pathToFileURL } = require("url");
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}),
  });
});
after(async () => {
  await browser?.close();
});
async function ui(name) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.uiData = {
      token: "synthetic-ui-token-123456",
      setupComplete: false,
      qwenModel: "qwen2.5:3b",
      glossary: { fixed: [], protected: [] },
      autoTranslateOrigins: {},
    };
    window.models = [];
    window.messages = [];
    chrome = {
      storage: {
        local: {
          get: async (d) =>
            typeof d === "string" ? { [d]: uiData[d] } : { ...d, ...uiData },
          set: async (v) => Object.assign(uiData, v),
        },
        onChanged: { addListener() {} },
      },
      runtime: {
        getURL: (x) => x,
        openOptionsPage: async () => {},
        onMessage: { addListener() {} },
        sendMessage: async (m) => {
          messages.push(m);
          return {
            ok: true,
            session: null,
            data: { status: "idle", ollamaModels: models },
          };
        },
      },
      tabs: {
        query: async () => [{ id: 7, url: "https://example.com" }],
        create: async () => {},
        sendMessage: async () => ({ ok: true }),
      },
      scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    };
    fetch = async () => ({
      ok: true,
      json: async () => ({
        version: "0.9.1",
        protocolVersion: 1,
        ollamaModels: models,
        ollamaError: null,
      }),
    });
  });
  await page.goto(
    pathToFileURL(path.resolve(__dirname, "../extension/" + name + ".html"))
      .href,
  );
  return page;
}
test("setup can finish without Ollama and saves selected available model", async () => {
  const p = await ui("setup");
  try {
    await p.locator("#checkHost").click();
    assert.equal(await p.locator("#finish").isDisabled(), false);
    assert.match(await p.locator("#checks").innerText(), /外部 API/);
    await p.evaluate(() => (models = ["qwen3.5:9b", "qwen3.5:4b"]));
    await p.locator("#checkHost").click();
    await p.locator("#finish").click();
    assert.equal(await p.evaluate(() => uiData.qwenModel), "qwen3.5:4b");
    assert.equal(await p.evaluate(() => uiData.setupComplete), true);
  } finally {
    await p.close();
  }
});
test("editing verified token invalidates setup completion", async () => {
  const p = await ui("setup");
  try {
    await p.evaluate(() => (models = ["qwen2.5:3b"]));
    await p.locator("#checkHost").click();
    assert.equal(await p.locator("#finish").isDisabled(), false);
    await p.locator("#token").fill("changed-invalid-token");
    assert.equal(await p.locator("#finish").isDisabled(), true);
  } finally {
    await p.close();
  }
});
test("malformed settings import leaves preferences unchanged", async () => {
  const p = await ui("options");
  try {
    await p.locator("#import").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          qwenModel: "qwen3.5:9b",
          glossary: { fixed: [null], protected: [] },
        }),
      ),
    });
    await p.waitForFunction(() =>
      document.querySelector("#saveStatus").textContent.startsWith("未导入"),
    );
    assert.equal(await p.evaluate(() => uiData.qwenModel), "qwen2.5:3b");
    assert.deepEqual(await p.evaluate(() => uiData.glossary), {
      fixed: [],
      protected: [],
    });
  } finally {
    await p.close();
  }
});
test("options saves custom Ollama and external API settings", async () => {
  const p = await ui("options");
  try {
    await p.locator("#qwenModel").fill("custom/model:latest");
    await p.locator("#save").click();
    assert.equal(
      await p.evaluate(() => uiData.qwenModel),
      "custom/model:latest",
    );
    await p.locator("#provider").selectOption("openai");
    await p.locator("#qwenModel").fill("vendor/model-v1");
    await p
      .locator("#apiUrl")
      .fill("https://api.example.com/v1/chat/completions");
    await p.locator("#apiKey").fill("private-test-key");
    await p.locator("#save").click();
    assert.deepEqual(
      await p.evaluate(() => ({
        provider: uiData.provider,
        model: uiData.qwenModel,
        url: uiData.apiUrl,
        key: uiData.apiKey,
      })),
      {
        provider: "openai",
        model: "vendor/model-v1",
        url: "https://api.example.com/v1/chat/completions",
        key: "private-test-key",
      },
    );
    assert.equal(await p.evaluate(() => "apiKey" in exportable(uiData)), false);
  } finally {
    await p.close();
  }
});
test("options fits narrow viewport and exposes author link", async () => {
  const p = await ui("options");
  try {
    await p.setViewportSize({ width: 400, height: 900 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await p.locator('a[href="https://space.bilibili.com/13412148"]').count(),
      1,
    );
  } finally {
    await p.close();
  }
});

test("setup persists a verified alternate loopback port", async () => {
  const p = await ui("setup");
  try {
    await p.evaluate(() => (models = ["qwen3.5:9b"]));
    await p.locator("#hostUrl").fill("http://127.0.0.1:18765");
    await p.locator("#checkHost").click();
    await p.locator("#finish").click();
    assert.equal(
      await p.evaluate(() => uiData.hostUrl),
      "http://127.0.0.1:18765",
    );
  } finally {
    await p.close();
  }
});

test("setup rejects remote hosts before sending credentials", async () => {
  const p = await ui("setup");
  try {
    await p.locator("#hostUrl").fill("http://example.com:8765");
    await p.evaluate(() => {
      window.remoteCalls = 0;
      window.fetch = async () => {
        remoteCalls++;
        throw Error("unexpected request");
      };
    });
    await p.locator("#checkHost").click();
    assert.equal(await p.evaluate(() => remoteCalls), 0);
    assert.equal(await p.locator("#finish").isDisabled(), true);
    assert.match(await p.locator("#checks").textContent(), /仅支持/);
  } finally {
    await p.close();
  }
});

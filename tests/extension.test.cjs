const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("path"),
  fs = require("fs"),
  os = require("os"),
  http = require("http");
test(
  "side-loaded extension translates and restores both same-site tabs",
  { timeout: 60000 },
  async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "younuo-e2e-")),
      extension = path.resolve(__dirname, "../extension");
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      ...(process.env.EDGE_PATH
        ? { executablePath: process.env.EDGE_PATH }
        : { channel: "chromium" }),
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    let server;
    try {
      const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker", { timeout: 10000 }));
      await worker.evaluate(() => {
        globalThis.fetch = async (url, options) => ({
          ok: true,
          json: async () => ({
            translations: JSON.parse(options.body).texts.map(
              (t) => "译文 " + t,
            ),
          }),
        });
      });
      server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<p id="text">Real extension content</p>');
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const url = `http://127.0.0.1:${server.address().port}`,
        a = await context.newPage(),
        b = await context.newPage();
      await a.goto(url);
      await b.goto(url + "/second");
      await worker.evaluate(() =>
        chrome.storage.local.set({
          token: "e2e-synthetic-test-token",
          setupComplete: true,
          qwenModel: "qwen2.5:3b",
        }),
      );
      const options = await context.newPage();
      await options.goto(worker.url().replace("background.js", "options.html"));
      const tabId = await worker.evaluate(
        async (url) =>
          (await chrome.tabs.query({})).find((t) => t.url === url + "/").id,
        url,
      );
      const started = await options.evaluate(
        (tabId) =>
          chrome.runtime.sendMessage({
            type: "SET_TAB_TRANSLATION_SESSION",
            tabId,
            session: { source: "en", target: "zh", model: "qwen2.5:3b" },
          }),
        tabId,
      );
      assert.equal(started.ok, true);
      for (const p of [a, b])
        await p.waitForFunction(
          () => document.querySelector("#text").textContent.startsWith("译文"),
          null,
          { timeout: 10000 },
        );
      // Navigate the second tab to a different origin (same controlled HTTP server).
      await b.goto(url.replace("127.0.0.1", "localhost"));
      await b.waitForTimeout(300);
      assert.equal(
        await b.locator("#text").textContent(),
        "Real extension content",
      );
      await b.goto(url + "/second");
      await b.waitForFunction(() =>
        document.querySelector("#text").textContent.startsWith("译文"),
      );
      const stopped = await options.evaluate(
        (tabId) =>
          chrome.runtime.sendMessage({
            type: "CLEAR_TAB_TRANSLATION_SESSION",
            tabId,
          }),
        tabId,
      );
      assert.equal(stopped.ok, true);
      for (const p of [a, b])
        await p.waitForFunction(
          () =>
            document.querySelector("#text").textContent ===
            "Real extension content",
        );
    } finally {
      if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
      await context.close();
      const parent = path.resolve(os.tmpdir()) + path.sep,
        target = path.resolve(profile);
      if (
        !target.startsWith(parent) ||
        !path.basename(target).startsWith("younuo-e2e-")
      )
        throw Error("Unsafe temporary path");
      fs.rmSync(target, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);

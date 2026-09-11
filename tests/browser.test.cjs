const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
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
async function fixture(html = '<p id="text">Original English text.</p>') {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  await page.route("https://fixture.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("https://fixture.test/");
  await page.evaluate(() => {
    window.state = {
      qwenModel: "qwen2.5:3b",
      displayMode: "translation",
      glossary: { fixed: [], protected: [] },
      autoTranslateOrigins: {},
    };
    window.listeners = [];
    window.messages = [];
    window.calls = [];
    window.statuses = [];
    const get = async (defaults) =>
      typeof defaults === "string"
        ? { [defaults]: state[defaults] }
        : { ...defaults, ...state };
    const set = async (values) => {
      const changes = {};
      for (const [k, v] of Object.entries(values)) {
        changes[k] = { oldValue: state[k], newValue: v };
        state[k] = v;
      }
      listeners.forEach((fn) => fn(changes, "local"));
    };
    window.chrome = {
      storage: {
        local: { get, set },
        onChanged: { addListener: (fn) => listeners.push(fn) },
      },
      runtime: {
        onMessage: { addListener: (fn) => messages.push(fn) },
        sendMessage(message, cb) {
          if (message.type === "GET_TAB_TRANSLATION_SESSION")
            return Promise.resolve({
              ok: true,
              session: state.autoTranslateOrigins[location.origin] || null,
            });
          if (message.type === "HOST_REQUEST") {
            calls.push({ message, cb });
            return Promise.resolve();
          }
          if (message.type === "UPDATE_TRANSLATION_STATUS")
            statuses.push(message);
          return Promise.resolve({ ok: true });
        },
      },
    };
    window.sendContent = (m) =>
      new Promise((resolve) => messages.forEach((fn) => fn(m, {}, resolve)));
    window.respond = (index, translations) =>
      calls[index].cb({ ok: true, data: { translations } });
  });
  await page.addScriptTag({ path: path.join(root, "extension/content.js") });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
  return page;
}
async function start(page, target = "zh", id = "one") {
  await page.evaluate(
    ({ target, id }) =>
      sendContent({
        type: "START_TRANSLATION",
        source: "en",
        target,
        model: "qwen2.5:3b",
        id,
      }),
    { target, id },
  );
}
async function calls(page, n) {
  await page.waitForFunction((n) => window.calls.length >= n, n, {
    timeout: 5000,
  });
}
async function translated(page, index, text) {
  await page.evaluate(({ index, text }) => respond(index, [text]), {
    index,
    text,
  });
}
async function textIs(page, text) {
  await page.waitForFunction(
    (text) => document.querySelector("#text").textContent === text,
    text,
    { timeout: 5000 },
  );
}

test("language switching preserves exact original including whitespace", async () => {
  const p = await fixture('<p id="text">  Original English text.  </p>');
  try {
    await start(p);
    await calls(p, 1);
    await translated(p, 0, "中文");
    await textIs(p, "  中文  ");
    await start(p, "ja", "two");
    await calls(p, 2);
    assert.equal(
      await p.evaluate(
        () => JSON.parse(calls[1].message.options.body).texts[0],
      ),
      "Original English text.",
    );
    await translated(p, 1, "日本語");
    await textIs(p, "  日本語  ");
    await p.evaluate(() => sendContent({ type: "SHOW_ORIGINAL" }));
    await textIs(p, "  Original English text.  ");
  } finally {
    await p.close();
  }
});
test("late model result cannot overwrite a changed SPA node", async () => {
  const p = await fixture();
  try {
    await start(p);
    await calls(p, 1);
    await p
      .locator("#text")
      .evaluate((el) => (el.firstChild.nodeValue = "New SPA text"));
    await translated(p, 0, "OLD RESULT");
    await p.waitForTimeout(30);
    assert.equal(await p.locator("#text").textContent(), "New SPA text");
  } finally {
    await p.close();
  }
});
test("stop rejects late replies and restart reuses safe cache", async () => {
  const p = await fixture();
  try {
    await start(p);
    await calls(p, 1);
    await p.evaluate(() => sendContent({ type: "SHOW_ORIGINAL" }));
    await translated(p, 0, "Late");
    await textIs(p, "Original English text.");
    await start(p, "zh", "two");
    await calls(p, 2);
    await translated(p, 1, "中文");
    await textIs(p, "中文");
    await p.evaluate(() => sendContent({ type: "SHOW_ORIGINAL" }));
    await start(p, "zh", "three");
    await textIs(p, "中文");
    assert.equal(await p.evaluate(() => calls.length), 2);
  } finally {
    await p.close();
  }
});
test("editable variants, nested code, translate=no are excluded", async () => {
  const p = await fixture(
    '<p id="text">Safe prose</p><div contenteditable><span>Private draft</span></div><div contenteditable="plaintext-only">Private plain</div><pre><span>Code string</span></pre><div translate="no">Protected region</div>',
  );
  try {
    await start(p);
    await calls(p, 1);
    assert.deepEqual(
      await p.evaluate(() => JSON.parse(calls[0].message.options.body).texts),
      ["Safe prose"],
    );
  } finally {
    await p.close();
  }
});
test("repeated viewport scans do not enqueue duplicate requests", async () => {
  const p = await fixture();
  try {
    await start(p);
    await calls(p, 1);
    for (let i = 0; i < 3; i++) {
      await p.evaluate(() => dispatchEvent(new Event("scroll")));
      await p.waitForTimeout(250);
    }
    assert.equal(await p.evaluate(() => calls.length), 1);
    await translated(p, 0, "中文");
    await textIs(p, "中文");
    await p.waitForTimeout(550);
    assert.equal(await p.evaluate(() => calls.length), 1);
  } finally {
    await p.close();
  }
});
test("bilingual mode removes inserted translation when restoring", async () => {
  const p = await fixture();
  try {
    await p.evaluate(() =>
      chrome.storage.local.set({ displayMode: "bilingual" }),
    );
    await start(p);
    await calls(p, 1);
    await translated(p, 0, "中文");
    await p.waitForSelector(".younuo-bilingual-translation");
    assert.equal(
      await p.locator("#text").evaluate((el) => el.firstChild.nodeValue),
      "Original English text.",
    );
    await p.evaluate(() => sendContent({ type: "SHOW_ORIGINAL" }));
    assert.equal(await p.locator(".younuo-bilingual-translation").count(), 0);
    await textIs(p, "Original English text.");
  } finally {
    await p.close();
  }
});
test("inner scrolling containers trigger visible translation", async () => {
  const p = await fixture(
    '<div id="scroll" style="height:100px;overflow:auto"><div style="height:1000px"></div><p id="text">Below the viewport</p></div>',
  );
  try {
    await start(p);
    assert.equal(await p.evaluate(() => calls.length), 0);
    await p.locator("#scroll").evaluate((el) => (el.scrollTop = 2000));
    await calls(p, 1);
  } finally {
    await p.close();
  }
});
test("settings changes invalidate translated terminology cache", async () => {
  const p = await fixture();
  try {
    await start(p);
    await calls(p, 1);
    await translated(p, 0, "中文");
    await textIs(p, "中文");
    await p.evaluate(() =>
      chrome.storage.local.set({
        glossary: {
          fixed: [{ source: "English", target: "英文" }],
          protected: [],
        },
      }),
    );
    await calls(p, 2);
    assert.equal(
      await p.evaluate(
        () => JSON.parse(calls[1].message.options.body).texts[0],
      ),
      "Original English text.",
    );
  } finally {
    await p.close();
  }
});
test("origin preference removal stops both same-site pages", async () => {
  const pages = await Promise.all([fixture(), fixture()]);
  try {
    for (const p of pages) {
      await p.evaluate(() =>
        chrome.storage.local.set({
          autoTranslateOrigins: {
            [location.origin]: {
              source: "en",
              target: "zh",
              model: "qwen2.5:3b",
              id: "shared",
            },
          },
        }),
      );
      await calls(p, 1);
      await translated(p, 0, "中文");
      await textIs(p, "中文");
    }
    for (const p of pages) {
      await p.evaluate(() =>
        chrome.storage.local.set({ autoTranslateOrigins: {} }),
      );
      await textIs(p, "Original English text.");
    }
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});
test("selection translation sends only selected substring", async () => {
  const p = await fixture();
  try {
    await start(p);
    await calls(p, 1);
    await translated(p, 0, "完整中文译文");
    await textIs(p, "完整中文译文");
    await p.evaluate(() => {
      const node = document.querySelector("#text").firstChild,
        r = document.createRange();
      r.setStart(node, 2);
      r.setEnd(node, 4);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      node.parentElement.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true }),
      );
    });
    await p.getByText("翻译选中内容", { exact: true }).click();
    await calls(p, 2);
    assert.deepEqual(
      await p.evaluate(() => JSON.parse(calls[1].message.options.body).texts),
      ["中文"],
    );
    assert.equal(await p.getByText("润色译文", { exact: true }).count(), 0);
  } finally {
    await p.close();
  }
});
test("10,000-node page remains responsive and requests are bounded", async () => {
  const p = await fixture(
    Array.from({ length: 10000 }, (_, i) => `<p>Paragraph ${i}</p>`).join(""),
  );
  try {
    const t = Date.now();
    await start(p);
    await calls(p, 1);
    const elapsed = Date.now() - t;
    assert.ok(elapsed < 5000, `initial scan ${elapsed} ms`);
    assert.ok(
      (await p.evaluate(
        () => JSON.parse(calls[0].message.options.body).texts.length,
      )) <= 2,
    );
    console.log(`10k DOM initial scan/request: ${elapsed}ms`);
  } finally {
    await p.close();
  }
});

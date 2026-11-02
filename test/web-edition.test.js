"use strict";
// Runs the browser (web edition) node code inside Node with a fake window.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startMockApis } = require("./helpers");

test("web edition: daily quote template runs with in-browser engine", async () => {
  const mock = await startMockApis();
  try {
    const win = {};
    const ctx = vm.createContext({ window: win, self: win, fetch, URL, URLSearchParams, FormData, Blob, console, setTimeout });
    for (const f of ["js/node-meta.js", "js/ai-model.js", "js/link-preview.js", "js/content-gen.js", "js/video-core.js", "js/engine-core.js", "js/web-nodes.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", f), "utf8"), ctx);
    win.YF_TELEGRAM_API = mock.base;
    const wf = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/templates/daily-quote.json"), "utf8"));
    const ex = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings: { ai: { baseUrl: `${mock.base}/v1` }, telegram: { botToken: "9:tok", chatId: "77" } } });
    assert.equal(ex.status, "success", ex.error);
    const call = mock.calls.find((c) => c.path === "/bot9:tok/sendMessage");
    const form = new URLSearchParams(call.body);
    assert.equal(form.get("chat_id"), "77");
    assert.match(form.get("text"), /Good morning/);
    // full-only node gives a friendly message in the web edition
    const yt = await win.YFEngine.runWorkflow({ name: "y", nodes: [{ id: "t", type: "manualTrigger", name: "S", params: {} }, { id: "y", type: "xPost", name: "YT", params: {} }], connections: [{ from: "t", to: "y" }] }, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate });
    assert.match(yt.error, /full version/);
    assert.equal(win.YFWeb.evaluate("{{ $json.a }}-{{ $json.b }}", { $json: { a: 1, b: 2 } }), "1-2");
  } finally { await mock.close(); }
});

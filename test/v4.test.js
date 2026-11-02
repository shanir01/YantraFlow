"use strict";
// v4: schedules (Run once / every N / daily), link preview -> Telegram, SEED + auto-generate.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const SCH = require("../public/js/schedule-core.js");
const LP = require("../public/js/link-preview.js");
const YC = require("../public/js/content-gen.js");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PAGE = `<!doctype html><html><head><title>Fallback title</title>
<meta property="og:title" content="Rohit &amp; Virat&#39;s big day">
<meta name="description" content="Plain description">
<meta property="og:description" content="Match report with   extra spaces">
<meta property="og:image" content="/img/cover.png"><meta property="og:site_name" content="Cricket News">
</head><body>hi</body></html>`;

// One mock for everything: pages, images, AI, Telegram, microlink
function startMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks); const body = raw.toString("latin1");
      const u = new URL(req.url, "http://x"); const p = u.pathname;
      calls.push({ method: req.method, path: p, query: Object.fromEntries(u.searchParams), headers: req.headers, body, size: raw.length });
      const json = (code, o) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
      if (p === "/article") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(PAGE); }
      if (p === "/img/cover.png") { res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" }); return res.end(PNG); }
      if (p === "/microlink/") return json(200, { status: "success", data: { title: "From microlink", description: "ML desc", image: { url: `http://127.0.0.1:${server.address().port}/img/cover.png` }, publisher: "ML" } });
      if (p.endsWith("/chat/completions")) {
        const j = JSON.parse(raw.toString("utf8")); server.ai.push(j);
        const q = j.messages.map((m) => m.content).join("\n");
        let text = "YantraFlow se Telegram automation shuru karo, free hai aur PC pe chalta hai";
        if (/too similar/i.test(q)) text = "Termux pe phone se bot chalao: battery saver band, wake lock on, aur kaam 24x7 chalta rahega";
        return json(200, { model: "mock", choices: [{ message: { content: text } }] });
      }
      if (p.startsWith("/bot")) {
        const isJson = /json/.test(req.headers["content-type"] || "");
        const f = isJson ? JSON.parse(raw.toString("utf8")) : {};
        if (/sendPhoto|sendVideo/.test(p) && isJson && /^http/.test(f.photo || f.video || "")) return json(400, { ok: false, error_code: 400, description: "Bad Request: failed to get HTTP URL content" });
        if (/sendPhoto|sendVideo/.test(p) && /x-www-form-urlencoded/.test(req.headers["content-type"] || "")) return json(400, { ok: false, error_code: 400, description: "Bad Request: failed to get HTTP URL content" });
        return json(200, { ok: true, result: { message_id: 7, chat: { id: 5 } } });
      }
      res.writeHead(404); res.end("nope");
    });
  });
  server.ai = [];
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ base: `http://127.0.0.1:${server.address().port}`, calls, server, close: () => new Promise((d) => server.close(d)) })));
}

// ---------------- schedule-core
test("schedule: minimum 30 minutes is enforced", () => {
  const { schedule, warnings } = SCH.normalize({ mode: "every", every: 5, unit: "minutes" });
  assert.equal(schedule.every, 30); assert.equal(schedule.unit, "minutes"); assert.equal(warnings.length, 1);
  assert.equal(SCH.normalize({ mode: "every", every: 2, unit: "hours" }).schedule.every, 2);
  assert.equal(SCH.normalize({ mode: "once" }).schedule.enabled, false);
  assert.throws(() => SCH.normalize({ mode: "daily", at: "25:99" }), /HH:MM/);
  assert.equal(SCH.normalize({ mode: "daily", at: "9:05", tz: "Mars/Base" }).warnings.length, 1);
});
test("schedule: every N — next run, missed run catches up once", () => {
  const s = SCH.normalize({ mode: "every", every: 1, unit: "hours" }).schedule;
  const t0 = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(SCH.nextRun(s, { startedAt: t0 }, t0), t0 + 3600000);
  assert.equal(SCH.isDue(s, { startedAt: t0, lastRunAt: t0 }, t0 + 30 * 60000), false);
  assert.equal(SCH.isDue(s, { startedAt: t0, lastRunAt: t0 }, t0 + 61 * 60000), true);
  // PC was off for 5 hours: due now (one run), then the gap restarts from that run
  assert.equal(SCH.isDue(s, { lastRunAt: t0 }, t0 + 5 * 3600000), true);
  assert.equal(SCH.nextRun(s, { lastRunAt: t0 + 5 * 3600000 }, t0 + 5 * 3600000), t0 + 6 * 3600000);
});
test("schedule: daily at HH:MM in Asia/Kolkata", () => {
  const s = SCH.normalize({ mode: "daily", at: "09:00", tz: "Asia/Kolkata" }).schedule;
  const now = Date.parse("2026-11-02T13:30:00Z"); // 7:00 PM IST
  assert.equal(new Date(SCH.nextRun(s, { startedAt: now }, now)).toISOString(), "2026-11-03T03:30:00.000Z"); // 9:00 AM IST tomorrow
  const morning = Date.parse("2026-11-02T02:00:00Z"); // 7:30 AM IST
  assert.equal(new Date(SCH.nextRun(s, { startedAt: morning }, morning)).toISOString(), "2026-11-02T03:30:00.000Z");
  assert.match(SCH.describe(s), /Roz 09:00/);
  assert.match(SCH.fmt(Date.parse("2026-11-03T03:30:00Z"), "Asia/Kolkata"), /9:00/);
});

// ---------------- link preview parser
test("link preview: OpenGraph parse, entities, relative image, caption", () => {
  const p = LP.parse(PAGE, "https://news.example.com/a/b?x=1");
  assert.equal(p.title, "Rohit & Virat's big day");
  assert.equal(p.description, "Match report with extra spaces");
  assert.equal(p.image, "https://news.example.com/img/cover.png");
  assert.equal(p.siteName, "Cricket News");
  const tw = LP.parse(`<meta name="twitter:title" content="TW"><meta name="twitter:image" content="https://c.dn/i.jpg">`, "https://t.co/x");
  assert.equal(tw.title, "TW"); assert.equal(tw.image, "https://c.dn/i.jpg");
  const yt = LP.parse("<title>YT</title>", "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(yt.image, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(LP.youtubeId("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  const cap = LP.caption({ ...p, title: "<b>x</b>", description: "d ".repeat(900), url: "https://e.com/?a=1&b=2" }, 1024);
  assert.ok(cap.length <= 1024); assert.match(cap, /&lt;b&gt;x&lt;\/b&gt;/); assert.match(cap, /https:\/\/e\.com\/\?a=1&amp;b=2$/);
  assert.ok(LP.TG_URL_FAIL.test("Bad Request: failed to get HTTP URL content"));
});

// ---------------- content (seed + no repeats)
test("content: seed goes into the prompt, history blocks repeats, media rotates", () => {
  const m = YC.buildMessages({ platform: "x", seed: "Brand: YantraFlow", history: [{ text: "old post one" }] });
  assert.match(m[0].content, /270 characters/); assert.match(m[1].content, /Brand: YantraFlow/); assert.match(m[1].content, /old post one/);
  assert.ok(YC.similarity("free automation tool for telegram", "free automation tool for telegram") > 0.9);
  assert.ok(YC.similarity("free automation tool for telegram", "termux battery wake lock phone") < 0.2);
  assert.equal(YC.parseOutput("x", "Here is your post:\n" + "a".repeat(400)).text.length <= 280, true);
  const yt = YC.parseOutput("youtube", '```json\n{"title":"T","description":"D","tags":["a","b"]}\n```');
  assert.deepEqual([yt.title, yt.description, yt.tags], ["T", "D", "a, b"]);
  assert.deepEqual([YC.pickMedia("a\n#c\nb", 0).media, YC.pickMedia("a\nb", 1).media, YC.pickMedia("a\nb", 2).media], ["a", "b", "a"]);
  assert.equal(YC.pushHistory([1, 2, 3], 4, 3).join(), "2,3,4");
});

// ---------------- full edition (server): Telegram link preview + upload fallback, aiPost, persistent scheduler
function tmpStore() {
  const { Store } = require("../src/store");
  return new Store(fs.mkdtempSync(path.join(os.tmpdir(), "yf4-")));
}
test("server: link preview -> Telegram photo is uploaded as a file (not by URL)", async () => {
  const mock = await startMock();
  process.env.YANTRAFLOW_TELEGRAM_API = mock.base;
  try {
    const { Runner } = require("../src/runner");
    const store = tmpStore(); store.saveSettings({ telegram: { botToken: "1:T", chatId: "5" } });
    const runner = new Runner(store, { log() {} });
    const wf = { id: "lp", name: "lp", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "telegram", name: "TG", params: { operation: "linkPreview", text: "", link: `${mock.base}/article` } }], connections: [{ from: "a", to: "b" }] };
    const ex = await runner.run(wf, { mode: "manual" });
    assert.equal(ex.status, "success", ex.error);
    const send = mock.calls.find((c) => c.path === "/bot1:T/sendPhoto");
    assert.match(send.headers["content-type"], /multipart\/form-data/);
    assert.match(send.body, /name="photo"; filename="cover.png"/);
    assert.match(send.body, /<b>Rohit &amp; Virat's big day<\/b>/);
    assert.ok(send.body.includes(PNG.toString("latin1")));
    assert.equal(ex.nodes[1].output[0].telegram.via, "photo-upload");
    // plain photo by URL: Telegram says "failed to get HTTP URL content" -> YantraFlow downloads + uploads
    mock.calls.length = 0;
    wf.nodes[1].params = { operation: "photo", media: `${mock.base}/img/cover.png`, text: "hi", upload: "auto" };
    const ex2 = await runner.run(wf, { mode: "manual" });
    assert.equal(ex2.status, "success", ex2.error);
    const tries = mock.calls.filter((c) => c.path === "/bot1:T/sendPhoto");
    assert.equal(tries.length, 2); assert.match(tries[0].headers["content-type"], /json/); assert.match(tries[1].headers["content-type"], /multipart/);
    // url-only mode keeps the old behaviour and explains the error in Hinglish
    wf.nodes[1].params.upload = "url";
    const ex3 = await runner.run(wf, { mode: "manual" });
    assert.equal(ex3.status, "error"); assert.match(ex3.error, /khol nahi paaya/);
  } finally { delete process.env.YANTRAFLOW_TELEGRAM_API; await mock.close(); }
});
test("server: AI Post Writer uses the SEED, never repeats, rotates media", async () => {
  const mock = await startMock();
  try {
    const { Runner } = require("../src/runner");
    const store = tmpStore(); store.saveSettings({ ai: { baseUrl: `${mock.base}/v1`, apiKey: "k", model: "m" } });
    const runner = new Runner(store, { log() {} });
    const wf = { id: "seedwf", name: "s", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "aiPost", name: "W", params: { platform: "telegram", seed: "SEED-MARKER brand info", mediaList: "one.jpg\ntwo.jpg" } }], connections: [{ from: "a", to: "b" }] };
    const r1 = await runner.run(wf, { mode: "manual" });
    assert.equal(r1.status, "success", r1.error);
    assert.match(JSON.stringify(mock.server.ai[0].messages), /SEED-MARKER brand info/);
    const o1 = r1.nodes[1].output[0];
    const r2 = await runner.run(wf, { mode: "manual" });
    const o2 = r2.nodes[1].output[0];
    assert.notEqual(o2.text, o1.text, "second post must be different");
    assert.equal(o2.repeatCheck.tries, 2);
    assert.deepEqual([o1.media, o2.media], ["one.jpg", "two.jpg"]);
    const hist = JSON.parse(fs.readFileSync(path.join(store.dir, "post-history.json"), "utf8"));
    assert.equal(hist["seedwf:b"].posts.length, 2);
    // auto-generate off = fixed text, no AI call
    const before = mock.server.ai.length;
    wf.nodes[1].params = { autoGenerate: "off", fixedText: "Fixed hello" };
    const r3 = await runner.run(wf, { mode: "manual" });
    assert.equal(r3.nodes[1].output[0].text, "Fixed hello"); assert.equal(mock.server.ai.length, before);
  } finally { await mock.close(); }
});
test("server: schedule keeps running by itself and resumes after a restart", async () => {
  const mock = await startMock();
  process.env.YANTRAFLOW_TELEGRAM_API = mock.base;
  try {
    const { Runner } = require("../src/runner");
    const store = tmpStore(); store.saveSettings({ telegram: { botToken: "1:T", chatId: "5" } });
    const wf = store.saveWorkflow({ name: "every30", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "telegram", name: "TG", params: { operation: "text", text: "tick" } }], connections: [{ from: "a", to: "b" }] });
    const t0 = Date.parse("2026-11-02T10:00:00Z");
    let runner = new Runner(store, { log() {} });
    const res = await runner.setSchedule(wf.id, { mode: "every", every: 10, unit: "minutes", runNow: true }, t0);
    assert.equal(res.info.schedule.every, 30, "10 min is raised to the 30 min minimum"); assert.equal(res.warnings.length, 1);
    assert.equal(res.execution.status, "success");
    const sends = () => mock.calls.filter((c) => c.path === "/bot1:T/sendMessage").length;
    assert.equal(sends(), 1);
    await runner.tick(new Date(t0 + 10 * 60000)); assert.equal(sends(), 1, "not yet");
    await runner.tick(new Date(t0 + 31 * 60000)); assert.equal(sends(), 2, "runs by itself after 30 min");
    await runner.tick(new Date(t0 + 32 * 60000)); assert.equal(sends(), 2, "no double run");
    // "restart": a brand-new Runner reads data/schedules.json
    runner = new Runner(store, { log() {} });
    await runner.tick(new Date(t0 + 62 * 60000)); assert.equal(sends(), 3, "resumed after restart");
    const info = runner.getSchedule(wf.id);
    assert.equal(info.runs, 3); assert.equal(info.log.length, 3); assert.equal(info.log[0].status, "success");
    runner.stopSchedule(wf.id);
    await runner.tick(new Date(t0 + 200 * 60000)); assert.equal(sends(), 3, "stopped");
  } finally { delete process.env.YANTRAFLOW_TELEGRAM_API; await mock.close(); }
});
test("server API: PUT/GET/DELETE /api/workflows/:id/schedule", async () => {
  const { createServer } = require("../src/server");
  const store = tmpStore();
  const srv = createServer({ store, password: "", logger: { log() {} } });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const wf = store.saveWorkflow({ name: "d", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "log", name: "L", params: {} }], connections: [{ from: "a", to: "b" }] });
    const put = await (await fetch(`${base}/api/workflows/${wf.id}/schedule`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "daily", at: "18:30", tz: "Asia/Kolkata" }) })).json();
    assert.equal(put.info.schedule.mode, "daily"); assert.ok(put.info.nextRunAt);
    const list = await (await fetch(`${base}/api/workflows`)).json();
    assert.match(list[0].schedule.describe, /Roz 18:30/);
    const del = await (await fetch(`${base}/api/workflows/${wf.id}/schedule`, { method: "DELETE" })).json();
    assert.equal(del.schedule.enabled, false);
    assert.ok(fs.existsSync(path.join(store.dir, "schedules.json")));
  } finally { await new Promise((r) => srv.close(r)); }
});

// ---------------- web edition (browser code, run in Node with a fake window)
test("web edition: link preview via metadata service -> photo uploaded with FormData; schedules in localStorage", async () => {
  const mock = await startMock();
  try {
    const mem = {};
    const localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const ctx = vm.createContext({ fetch, URL, URLSearchParams, FormData, Blob, console, setTimeout, setInterval, localStorage, Intl, Date });
    const win = vm.runInContext("this", ctx); win.window = win; win.self = win; // browser: window === global
    for (const f of ["js/node-meta.js", "js/cred-schema.js", "js/ai-model.js", "js/schedule-core.js", "js/link-preview.js", "js/content-gen.js", "js/engine-core.js", "js/web-nodes.js", "js/backend.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", f), "utf8"), ctx);
    win.YF_TELEGRAM_API = mock.base; win.YF_MICROLINK_API = `${mock.base}/microlink`;
    const settings = { telegram: { botToken: "1:W", chatId: "5" } };
    const wf = { id: "w", name: "w", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "telegram", name: "TG", params: { operation: "linkPreview", text: "", link: "https://some.site/post" } }], connections: [{ from: "a", to: "b" }] };
    const ex = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings });
    assert.equal(ex.status, "success", ex.error);
    const send = mock.calls.find((c) => c.path === "/bot1:W/sendPhoto");
    assert.match(send.headers["content-type"], /multipart\/form-data/);
    assert.match(send.body, /From microlink/); assert.match(send.body, /https:\/\/some\.site\/post/);
    // photo by URL fails at Telegram -> browser downloads it and uploads bytes
    mock.calls.length = 0;
    wf.nodes[1].params = { operation: "photo", media: `${mock.base}/img/cover.png`, text: "x" };
    const ex2 = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings });
    assert.equal(ex2.status, "success", ex2.error);
    assert.deepEqual(mock.calls.filter((c) => c.path.endsWith("/sendPhoto")).map((c) => /multipart/.test(c.headers["content-type"])), [false, true]);
    // LocalBackend schedules: min 30, saved in localStorage
    const B = win.YFBackends.LocalBackend;
    const saved = await B.saveWorkflow({ name: "s", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }], connections: [] });
    const r = await B.setSchedule(saved.id, { mode: "every", every: 1, unit: "minutes" });
    assert.equal(r.info.schedule.every, 30); assert.equal(r.warnings.length, 1);
    const all = await B.listWorkflows(); assert.match(all[0].schedule.describe, /Har 30 minute/);
    await B.stopSchedule(saved.id); assert.equal((await B.getSchedule(saved.id)).schedule.enabled, false);
  } finally { await mock.close(); }
});

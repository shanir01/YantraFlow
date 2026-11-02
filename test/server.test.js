"use strict";
// End-to-end: real HTTP server + every outside service mocked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startMockApis, startMockSmtp, tmpDir, silent } = require("./helpers");

let mock, smtp, server, base, dataDir;
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t; }
  return { status: r.status, body: j };
};
const useTemplate = async (key) => (await api("POST", `/api/templates/${key}/use`)).body;
const runWf = async (wf) => (await api("POST", `/api/workflows/${wf.id}/run`, { workflow: wf })).body;

test.before(async () => {
  mock = await startMockApis();
  smtp = await startMockSmtp();
  dataDir = tmpDir();
  const { createServer } = require("../src/server");
  server = createServer({ dataDir, logger: silent, password: "" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await mock.close(); await smtp.close(); });

test("health, nodes, static UI", async () => {
  const h = await api("GET", "/api/health");
  assert.equal(h.body.edition, "full");
  const nodes = await api("GET", "/api/nodes");
  assert.ok(nodes.body.length >= 25);
  const page = await fetch(base + "/");
  assert.match(await page.text(), /YantraFlow/);
  assert.equal((await fetch(base + "/js/app.js")).status, 200);
  assert.equal((await fetch(base + "/vendor/drawflow.min.js")).status, 200);
});

test("credentials are saved locally and secrets are masked", async () => {
  const r = await api("PUT", "/api/credentials", {
    ai: { baseUrl: `${mock.base}/v1`, apiKey: "sk-test-123456", model: "auto" },
    telegram: { botToken: "111:SECRET_TOKEN", chatId: "@mychannel" },
    instagram: { userId: "17841400000", accessToken: "IGTOKEN" },
    facebook: { pageId: "pg1", pageToken: "FBTOKEN" },
    youtube: { clientId: "cid", clientSecret: "csec", refreshToken: "rtok" },
    x: { apiKey: "k", apiSecret: "s", accessToken: "t", accessSecret: "ts" },
    smtp: { host: "127.0.0.1", port: String(smtp.port), user: "me@test", pass: "pw", from: "Nishu <me@test>" },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.values.telegram.botToken, /^••••••OKEN$/);
  assert.equal(r.body.values.ai.baseUrl, `${mock.base}/v1`);
  // sending the masked value back must not overwrite the real secret
  await api("PUT", "/api/credentials", { telegram: { botToken: r.body.values.telegram.botToken, chatId: "@mychannel" } });
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, "credentials.json"), "utf8"));
  assert.equal(saved.telegram.botToken, "111:SECRET_TOKEN");
  const t = await api("POST", "/api/credentials/test", { service: "ai" });
  assert.equal(t.body.ok, true, t.body.error);
});

test("template 1: RSS → AI summary → Telegram", async () => {
  const wf = await useTemplate("rss-ai-telegram");
  wf.nodes.find((n) => n.type === "rss").params.url = `${mock.base}/rss`;
  const ex = await runWf(wf);
  assert.equal(ex.status, "success", ex.error);
  const tg = mock.calls.filter((c) => c.path === "/bot111:SECRET_TOKEN/sendMessage");
  assert.equal(tg.length, 3);
  const msg = JSON.parse(tg[0].body);
  assert.equal(msg.chat_id, "@mychannel");
  assert.match(msg.text, /First & best/);
  assert.match(msg.text, /AI says/);
  assert.match(msg.text, /https:\/\/e\.com\/1/);
});

test("template 2: daily AI quote → Telegram (and scheduler fires it on cron)", async () => {
  const wf = await useTemplate("daily-quote");
  const ex = await runWf(wf);
  assert.equal(ex.status, "success", ex.error);
  const act = await api("POST", `/api/workflows/${wf.id}/active`, { active: true });
  assert.equal(act.status, 200);
  const before = mock.calls.length;
  await server.runner.tick(new Date(2026, 10, 3, 7, 0, 5));
  await server.runner.tick(new Date(2026, 10, 3, 7, 0, 40)); // same minute -> no double run
  const sent = mock.calls.slice(before).filter((c) => c.path.endsWith("/sendMessage"));
  assert.equal(sent.length, 1);
  assert.match(JSON.parse(sent[0].body).text, /Good morning/);
  await server.runner.tick(new Date(2026, 10, 3, 8, 0, 0)); // wrong hour
  assert.equal(mock.calls.slice(before).filter((c) => c.path.endsWith("/sendMessage")).length, 1);
  await api("POST", `/api/workflows/${wf.id}/active`, { active: false });
  const runs = await api("GET", `/api/executions?workflowId=${wf.id}`);
  assert.ok(runs.body.some((r) => r.mode === "schedule" && r.status === "success"));
});

test("template 3: webhook → AI → reply (only when Active)", async () => {
  const wf = await useTemplate("webhook-ai-reply");
  let r = await fetch(`${base}/webhook/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"message":"Termux kya hai?"}' });
  assert.equal(r.status, 404);
  await api("POST", `/api/workflows/${wf.id}/active`, { active: true });
  r = await fetch(`${base}/webhook/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"message":"Termux kya hai?"}' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.reply, "AI says: Termux kya hai?");
  r = await fetch(`${base}/webhook/ask?message=hello`);
  assert.equal((await r.json()).reply, "AI says: hello");
  await api("POST", `/api/workflows/${wf.id}/active`, { active: false });
});

test("template 4: AI caption → Instagram Reel + Telegram video", async () => {
  const wf = await useTemplate("reel-autopost");
  wf.nodes.find((n) => n.type === "set").params.fields = "videoUrl = https://cdn.example.com/reel.mp4\ntopic = Motivation";
  const ex = await runWf(wf);
  assert.equal(ex.status, "success", ex.error);
  const ig = ex.nodes.find((n) => n.type === "instagram");
  assert.equal(ig.output[0].instagram.mediaId, "ig_media_999");
  const create = mock.calls.find((c) => c.path === "/graph/17841400000/media");
  const form = new URLSearchParams(create.body);
  assert.equal(form.get("media_type"), "REELS");
  assert.equal(form.get("video_url"), "https://cdn.example.com/reel.mp4");
  assert.match(form.get("caption"), /AI says/);
  const vid = mock.calls.find((c) => c.path.endsWith("/sendVideo"));
  assert.equal(JSON.parse(vid.body).video, "https://cdn.example.com/reel.mp4");
});

test("template 5: new file in folder → AI JSON → YouTube upload → Telegram", async () => {
  const wf = await useTemplate("folder-youtube");
  await api("POST", `/api/workflows/${wf.id}/active`, { active: true });
  const folder = path.join(dataDir, "files", "videos");
  await server.runner.tick(new Date()); // first look: remembers existing files, fires nothing
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "termux-trick.mp4"), Buffer.alloc(2048, 1));
  server.runner.lastFire = {};
  await server.runner.tick(new Date()); // sees the file, waits until size is stable
  server.runner.lastFire = {};
  await server.runner.tick(new Date()); // fires
  const runs = (await api("GET", `/api/executions?workflowId=${wf.id}`)).body;
  assert.equal(runs.length, 1, JSON.stringify(runs));
  const ex = (await api("GET", `/api/executions/${runs[0].id}`)).body;
  assert.equal(ex.status, "success", ex.error);
  const put = mock.calls.find((c) => c.path === "/youtube/session1");
  assert.equal(put.size, 2048);
  const init = mock.calls.find((c) => c.path === "/youtube/upload");
  const meta = JSON.parse(init.body);
  assert.equal(meta.snippet.title, "Mock title");
  assert.deepEqual(meta.snippet.tags, ["a", "b"]);
  assert.equal(meta.status.privacyStatus, "private");
  const tg = mock.calls.filter((c) => c.path.endsWith("/sendMessage")).pop();
  assert.match(JSON.parse(tg.body).text, /youtu\.be\/yt_vid_123/);
  // file is not processed twice
  server.runner.lastFire = {};
  await server.runner.tick(new Date());
  assert.equal((await api("GET", `/api/executions?workflowId=${wf.id}`)).body.length, 1);
  await api("POST", `/api/workflows/${wf.id}/active`, { active: false });
});

test("template 6: website down → IF → Telegram alert only when down", async () => {
  const wf = await useTemplate("uptime-monitor");
  const httpNode = wf.nodes.find((n) => n.type === "httpRequest");
  httpNode.params.url = `${mock.base}/json`;
  let ex = await runWf(wf);
  assert.equal(ex.nodes.find((n) => n.type === "telegram").status, "skipped");
  httpNode.params.url = `${mock.base}/status/500`;
  ex = await runWf(wf);
  assert.equal(ex.nodes.find((n) => n.type === "telegram").status, "success");
});

test("Facebook, X, Discord, Slack, Email, Sheet, Write File nodes", async () => {
  const wf = { name: "all", nodes: [
    { id: "t", type: "manualTrigger", name: "Start", params: { testData: '{"text":"Hello world 🚀"}' } },
    { id: "fb", type: "facebook", name: "FB", params: { kind: "text", message: "{{ $json.text }}" } },
    { id: "x", type: "xPost", name: "X", params: { text: "{{ $json.text }}" } },
    { id: "d", type: "discord", name: "Discord", params: { webhookUrl: `${mock.base}/discord/abc`, content: "{{ $json.text }}" } },
    { id: "s", type: "slack", name: "Slack", params: { webhookUrl: `${mock.base}/slack/abc`, text: "{{ $json.text }}" } },
    { id: "e", type: "email", name: "Email", params: { to: "friend@test", subject: "Namaste 🙏", body: "{{ $json.text }}" } },
    { id: "w", type: "writeFile", name: "Write", params: { path: "logs/out.txt", content: "{{ $json.text }}", mode: "append" } },
    { id: "sh", type: "readSheet", name: "Sheet", params: { source: `${mock.base}/sheet.csv` } },
  ], connections: ["fb", "x", "d", "s", "e", "w", "sh"].map((to) => ({ from: "t", to })) };
  const saved = (await api("POST", "/api/workflows", wf)).body;
  const ex = await runWf(saved);
  assert.equal(ex.status, "success", ex.error);
  assert.ok(mock.calls.find((c) => c.path === "/graph/pg1/feed"));
  assert.match(mock.calls.find((c) => c.path === "/x/2/tweets").headers.authorization, /oauth_signature=/);
  assert.ok(mock.calls.find((c) => c.path === "/discord/abc"));
  assert.ok(mock.calls.find((c) => c.path === "/slack/abc"));
  assert.equal(smtp.mails.length, 1);
  assert.equal(smtp.mails[0].user, "me@test");
  assert.match(smtp.mails[0].data, /Subject: =\?UTF-8\?B\?/);
  assert.equal(Buffer.from(smtp.mails[0].data.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString(), "Hello world 🚀");
  assert.equal(fs.readFileSync(path.join(dataDir, "files", "logs", "out.txt"), "utf8"), "Hello world 🚀\n");
  assert.deepEqual(ex.nodes.find((n) => n.id === "sh").output[0], { _row: 2, caption: "hello", videoUrl: "https://v/1.mp4" });
});

test("sheet trigger fires only for new rows; Telegram file upload works", async () => {
  mock.server.csv = "caption\none\n";
  const fileP = path.join(dataDir, "files", "pic.jpg"); fs.writeFileSync(fileP, Buffer.alloc(300, 7));
  const wf = (await api("POST", "/api/workflows", { name: "sheet", active: false, nodes: [
    { id: "t", type: "sheetTrigger", name: "Sheet", params: { source: `${mock.base}/sheet.csv`, minutes: 1 } },
    { id: "tg", type: "telegram", name: "TG", params: { operation: "photo", media: "pic.jpg", text: "{{ $json.caption }}" } },
  ], connections: [{ from: "t", to: "tg" }] })).body;
  await api("POST", `/api/workflows/${wf.id}/active`, { active: true });
  server.runner.lastFire = {}; await server.runner.tick(new Date());
  assert.equal((await api("GET", `/api/executions?workflowId=${wf.id}`)).body.length, 0);
  mock.server.csv = "caption\none\ntwo\nthree\n";
  server.runner.lastFire = {}; await server.runner.tick(new Date());
  const runs = (await api("GET", `/api/executions?workflowId=${wf.id}`)).body;
  assert.equal(runs.length, 1);
  const ex = (await api("GET", `/api/executions/${runs[0].id}`)).body;
  assert.equal(ex.status, "success", ex.error);
  assert.equal(ex.nodes[1].outputCount, 2);
  const up = mock.calls.filter((c) => c.path.endsWith("/sendPhoto"));
  assert.equal(up.length, 2);
  assert.match(up[0].headers["content-type"], /multipart\/form-data/);
  await api("POST", `/api/workflows/${wf.id}/active`, { active: false });
});

test("friendly errors: bad Telegram token, AI rate limit, missing keys, manual-only activate", async () => {
  const mk = (node) => ({ name: "e", nodes: [{ id: "t", type: "manualTrigger", name: "Start", params: {} }, node], connections: [{ from: "t", to: "a" }] });
  let ex = await runWf((await api("POST", "/api/workflows", mk({ id: "a", type: "telegram", name: "TG", params: { botToken: "BADTOKEN", text: "x" } }))).body);
  assert.match(ex.error, /Telegram answered 401: Unauthorized/);
  ex = await runWf((await api("POST", "/api/workflows", mk({ id: "a", type: "aiChat", name: "AI", params: { prompt: "FAIL please" } }))).body);
  assert.match(ex.error, /AI answered 429: rate limited/);
  ex = await runWf((await api("POST", "/api/workflows", mk({ id: "a", type: "aiChat", name: "AI", params: { prompt: "hi", baseUrl: "http://127.0.0.1:1/v1" } }))).body);
  assert.match(ex.error, /Is your AI server running/);
  ex = await runWf((await api("POST", "/api/workflows", mk({ id: "a", type: "instagram", name: "IG", params: { mediaUrl: "/sdcard/x.mp4", userId: "1", accessToken: "t" } }))).body);
  assert.match(ex.error, /PUBLIC https/);
  const manual = (await api("POST", "/api/workflows", mk({ id: "a", type: "log", name: "L", params: {} }))).body;
  const act = await api("POST", `/api/workflows/${manual.id}/active`, { active: true });
  assert.equal(act.status, 400);
});

test("import / export round trip and unknown nodes rejected", async () => {
  const wf = (await api("GET", "/api/workflows")).body[0];
  const full = (await api("GET", `/api/workflows/${wf.id}`)).body;
  const copy = JSON.parse(JSON.stringify(full)); delete copy.id;
  const imp = await api("POST", "/api/import", copy);
  assert.equal(imp.status, 201);
  assert.notEqual(imp.body.id, full.id);
  assert.equal(imp.body.active, false);
  assert.deepEqual(imp.body.nodes.map((n) => n.type), full.nodes.map((n) => n.type));
  const bad = await api("POST", "/api/import", { name: "x", nodes: [{ id: "a", type: "hackerNode" }], connections: [] });
  assert.equal(bad.status, 400);
  const del = await api("DELETE", `/api/workflows/${imp.body.id}`);
  assert.equal(del.status, 200);
});

test("optional password protects the UI but not webhooks", async () => {
  const { createServer } = require("../src/server");
  const s2 = createServer({ dataDir: tmpDir(), logger: silent, password: "pass123" });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  assert.equal((await fetch(b2 + "/api/workflows")).status, 401);
  assert.equal((await fetch(b2 + "/api/workflows", { headers: { authorization: "Basic " + Buffer.from("x:pass123").toString("base64") } })).status, 200);
  assert.equal((await fetch(b2 + "/webhook/none")).status, 404);
  s2.close();
});

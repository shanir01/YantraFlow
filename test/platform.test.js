"use strict";
// Public Projects catalogue + local password lock + logo/login wiring.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { tmpDir, silent, startMockApis } = require("./helpers");
const PUB = path.join(__dirname, "../public");
const PROJECTS = require("../public/js/projects.js");
const { BY_TYPE } = require("../src/nodes");

test("public projects: 12+ projects, all FREE, valid nodes and connections", () => {
  assert.ok(PROJECTS.length >= 12, "at least 12 projects");
  const cats = new Set(["YouTube", "Instagram", "Telegram", "Gmail", "AI Content", "Video"]);
  const tplIndex = JSON.parse(fs.readFileSync(path.join(PUB, "templates/index.json"), "utf8"));
  const ids = new Set();
  for (const p of PROJECTS) {
    assert.ok(!ids.has(p.id), "unique id " + p.id); ids.add(p.id);
    assert.equal(p.tier, "free", p.id); assert.equal(p.price, 0, p.id);
    assert.ok(["web", "key", "full", "setup"].includes(p.runsIn), p.id);
    assert.ok(p.categories.length && p.categories.every((c) => cats.has(c)), p.id + " categories");
    const wf = p.workflow || JSON.parse(fs.readFileSync(path.join(PUB, "templates", tplIndex.find((t) => t.key === p.fromTemplate).file), "utf8"));
    const nids = new Set(wf.nodes.map((n) => n.id));
    for (const n of wf.nodes) assert.ok(BY_TYPE[n.type], `${p.id}: unknown node ${n.type}`);
    for (const c of wf.connections) assert.ok(nids.has(c.from) && nids.has(c.to), p.id + " connection");
  }
  for (const c of cats) assert.ok(PROJECTS.some((p) => p.categories.includes(c)), "category has projects: " + c);
  const cartoon = PROJECTS.find((p) => p.id === "cartoon-lipsync");
  assert.equal(cartoon.runsIn, "key"); assert.match(cartoon.honest, /API key/);
  assert.match(PROJECTS.find((p) => p.id === "viral-analyser").honest, /dekh nahi sakta/);
});

test("viral script project runs end-to-end in the browser engine (mock AI)", async () => {
  const mock = await startMockApis();
  try {
    const win = {}; const ctx = vm.createContext({ window: win, self: win, fetch, URL, URLSearchParams, FormData, Blob, console, setTimeout });
    for (const f of ["js/node-meta.js", "js/engine-core.js", "js/web-nodes.js"]) vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), ctx);
    for (const id of ["viral-script", "viral-analyser", "profile-optimiser", "comment-dm", "content-calendar", "youtube-seo"]) {
      const wf = JSON.parse(JSON.stringify(PROJECTS.find((p) => p.id === id).workflow));
      const ex = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings: { ai: { baseUrl: `${mock.base}/v1` } } });
      assert.equal(ex.status, "success", id + ": " + ex.error);
    }
  } finally { await mock.close(); }
});

test("local full version: random password lock, webhooks stay open", async () => {
  const { createServer } = require("../src/server");
  const server = createServer({ dataDir: tmpDir(), logger: silent });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.match(server.password, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    const other = createServer({ dataDir: tmpDir(), logger: silent });
    assert.notEqual(other.password, server.password, "new password each start");
    const h = await (await fetch(base + "/api/health")).json();
    assert.equal(h.locked, true); assert.equal(h.authed, false);
    assert.equal((await fetch(base + "/api/workflows")).status, 401);
    assert.equal((await fetch(base + "/")).status, 200, "lock screen loads");
    const bad = await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "nope" }) });
    assert.equal(bad.status, 401);
    const ok = await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: server.password }) });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(base + "/api/workflows", { headers: { cookie } })).status, 200);
    assert.equal((await (await fetch(base + "/api/health", { headers: { cookie } })).json()).authed, true);
    const hook = await fetch(base + "/webhook/nothing-here", { method: "POST" });
    assert.equal(hook.status, 404, "webhook route answers without password (404 = no active workflow)");
    await fetch(base + "/api/logout", { method: "POST", headers: { cookie } });
    assert.equal((await fetch(base + "/api/workflows", { headers: { cookie } })).status, 401);
  } finally { server.close(); }
});

test("logo everywhere + website login config (publishable key only)", () => {
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  assert.match(html, /img\/logo\.svg/); assert.match(html, /favicon\.svg/); assert.match(html, /og:image/);
  for (const f of ["img/logo.svg", "img/logo-192.png", "img/logo-512.png", "img/apple-touch-icon.png", "favicon.svg", "vendor/supabase.min.js"]) assert.ok(fs.existsSync(path.join(PUB, f)), f);
  const cfg = fs.readFileSync(path.join(PUB, "config.js"), "utf8");
  assert.match(cfg, /sb_publishable_/); assert.doesNotMatch(cfg, /sb_secret_|service_role/);
  const plat = fs.readFileSync(path.join(PUB, "js/platform.js"), "utf8");
  assert.match(plat, /signInWithPassword/); assert.match(plat, /signUp/); assert.match(plat, /resetPasswordForEmail/);
  assert.doesNotMatch(plat, /signInWithOAuth|signInWithOtp/, "email + password only");
  assert.match(plat, /Created by Nirbhay Sharma &amp; Tab/);
});

#!/usr/bin/env node
"use strict";
// YantraFlow — free local automation (n8n-style) for PC and Android (Termux).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("./store");
const { Runner } = require("./runner");
const { publicNodeList, BY_TYPE } = require("./nodes");
const CRED_SCHEMA = require("../public/js/cred-schema.js");
const engine = require("../public/js/engine-core.js");
const pkg = require("../package.json");

const PUBLIC = path.join(__dirname, "..", "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const MASK = "••••••";

function send(res, status, body, headers = {}) {
  const isStr = typeof body === "string" || Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({ "content-type": isStr ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "cache-control": "no-store" }, headers));
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function parseBody(text, type) {
  if (!text) return {};
  if (/json/i.test(type || "") || /^\s*[[{]/.test(text)) { try { return JSON.parse(text); } catch (_) { /* fallthrough */ } }
  if (/x-www-form-urlencoded/i.test(type || "")) return Object.fromEntries(new URLSearchParams(text));
  return { text };
}
function maskSettings(s) {
  const out = {};
  for (const sec of CRED_SCHEMA) {
    out[sec.id] = {};
    for (const f of sec.fields) {
      const v = (s[sec.id] || {})[f.key];
      out[sec.id][f.key] = f.secret && v ? MASK + String(v).slice(-4) : (v || "");
    }
  }
  return out;
}
function mergeSettings(old, incoming) {
  const out = JSON.parse(JSON.stringify(old || {}));
  for (const sec of CRED_SCHEMA) {
    const inc = (incoming || {})[sec.id];
    if (!inc) continue;
    out[sec.id] = out[sec.id] || {};
    for (const f of sec.fields) {
      if (!(f.key in inc)) continue;
      const v = String(inc[f.key] ?? "").trim();
      if (f.secret && v.startsWith(MASK)) continue; // unchanged secret
      out[sec.id][f.key] = v;
    }
  }
  return out;
}
function loadTemplates() {
  const dir = path.join(PUBLIC, "templates");
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  return index.map((t) => ({ ...t, workflow: JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8")) }));
}

function createServer(opts = {}) {
  const store = opts.store || new Store(opts.dataDir || process.env.YANTRAFLOW_DATA || path.join(__dirname, "..", "data"));
  const runner = opts.runner || new Runner(store, opts.logger || console);
  const password = opts.password !== undefined ? opts.password : process.env.YANTRAFLOW_PASSWORD || "";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    try {
      // ---- webhooks (never behind the password, so other apps can call them)
      if (p.startsWith("/webhook/")) {
        const hookPath = decodeURIComponent(p.slice("/webhook/".length));
        const found = runner.findWebhook(hookPath, req.method);
        if (!found) return send(res, 404, { error: `No ACTIVE workflow has a Webhook with path "${hookPath}" (${req.method}). Open the workflow and switch it to Active.` });
        const text = await readBody(req);
        const data = { method: req.method, path: hookPath, query: Object.fromEntries(url.searchParams), headers: req.headers, body: parseBody(text, req.headers["content-type"]) };
        const respond = (found.node.params || {}).respond || "lastNode";
        if (respond === "immediately") {
          const executionId = engine.uid();
          runner.run(found.wf, { triggerNodeId: found.node.id, triggerData: { webhook: data }, mode: "webhook" }).catch(() => {});
          return send(res, 200, { ok: true, message: "Workflow started", executionId });
        }
        const ex = await runner.run(found.wf, { triggerNodeId: found.node.id, triggerData: { webhook: data }, mode: "webhook" });
        if (ex.response) return send(res, ex.response.status || 200, typeof ex.response.body === "string" ? ex.response.body : ex.response.body);
        if (ex.status === "error") return send(res, 500, { error: ex.error, executionId: ex.id });
        return send(res, 200, ex.lastOutput !== undefined ? ex.lastOutput : { ok: true, executionId: ex.id });
      }
      // ---- optional password
      if (password) {
        const h = req.headers.authorization || "";
        const given = h.startsWith("Basic ") ? Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":") : "";
        if (given !== password) return send(res, 401, "Password required", { "www-authenticate": 'Basic realm="YantraFlow"' });
      }
      if (p.startsWith("/api/")) return await api(req, res, url, store, runner);
      // ---- static files
      let file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : decodeURIComponent(p)));
      if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden");
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      send(res, e.status || 500, { error: e.message });
    }
  });
  server.store = store;
  server.runner = runner;
  return server;
}

async function api(req, res, url, store, runner) {
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  const body = async () => { const t = await readBody(req); try { return t ? JSON.parse(t) : {}; } catch (_) { throw Object.assign(new Error("Body must be JSON"), { status: 400 }); } };
  let mm;
  if (p === "/api/health") return send(res, 200, { ok: true, name: "YantraFlow", edition: "full", version: pkg.version, node: process.version, platform: process.platform });
  if (p === "/api/nodes") return send(res, 200, publicNodeList());
  if (p === "/api/templates" && m === "GET") return send(res, 200, loadTemplates().map(({ workflow, ...t }) => ({ ...t, nodes: workflow.nodes.map((n) => n.type) })));
  if ((mm = p.match(/^\/api\/templates\/([\w-]+)\/use$/)) && m === "POST") {
    const t = loadTemplates().find((x) => x.key === mm[1]);
    if (!t) return send(res, 404, { error: "Template not found" });
    const wf = store.saveWorkflow({ ...JSON.parse(JSON.stringify(t.workflow)), id: undefined, active: false });
    return send(res, 201, wf);
  }
  if (p === "/api/workflows" && m === "GET") {
    const runs = store.listExecutions();
    return send(res, 200, store.listWorkflows().map((wf) => {
      const last = runs.find((r) => r.workflowId === wf.id);
      return { id: wf.id, name: wf.name, active: wf.active, updatedAt: wf.updatedAt, nodeCount: wf.nodes.length, nodeTypes: wf.nodes.map((n) => n.type), lastRun: last ? { status: last.status, startedAt: last.startedAt } : null };
    }));
  }
  if ((p === "/api/workflows" || p === "/api/import") && m === "POST") {
    const wf = await body();
    engine.validate(wf);
    const unknown = wf.nodes.filter((n) => !BY_TYPE[n.type]).map((n) => n.type);
    if (unknown.length) return send(res, 400, { error: `Unknown node types: ${[...new Set(unknown)].join(", ")}` });
    if (p === "/api/import") { delete wf.id; wf.active = false; }
    return send(res, 201, store.saveWorkflow(wf));
  }
  if ((mm = p.match(/^\/api\/workflows\/([\w-]+)$/))) {
    const id = mm[1];
    if (m === "GET") { const wf = store.getWorkflow(id); return wf ? send(res, 200, wf) : send(res, 404, { error: "Workflow not found" }); }
    if (m === "PUT") { const wf = await body(); engine.validate(wf); wf.id = id; return send(res, 200, store.saveWorkflow(wf)); }
    if (m === "DELETE") return send(res, store.deleteWorkflow(id) ? 200 : 404, { ok: true });
  }
  if ((mm = p.match(/^\/api\/workflows\/([\w-]+)\/run$/)) && m === "POST") {
    const b = await body();
    const wf = b.workflow ? Object.assign(b.workflow, { id: mm[1] }) : store.getWorkflow(mm[1]);
    if (!wf) return send(res, 404, { error: "Workflow not found" });
    return send(res, 200, await runner.run(wf, { triggerNodeId: b.triggerNodeId, mode: "manual" }));
  }
  if ((mm = p.match(/^\/api\/workflows\/([\w-]+)\/active$/)) && m === "POST") {
    const wf = store.getWorkflow(mm[1]);
    if (!wf) return send(res, 404, { error: "Workflow not found" });
    const b = await body();
    wf.active = !!b.active;
    if (wf.active && !engine.findTriggers(wf, BY_TYPE).some((n) => n.type !== "manualTrigger")) {
      return send(res, 400, { error: "To make it Active, add a Schedule, Webhook, Folder Watch or Sheet trigger. (Manual Trigger only runs when you press Run.)" });
    }
    return send(res, 200, store.saveWorkflow(wf));
  }
  if (p === "/api/executions" && m === "GET") return send(res, 200, store.listExecutions(url.searchParams.get("workflowId")));
  if (p === "/api/executions" && m === "DELETE") { store.clearExecutions(); return send(res, 200, { ok: true }); }
  if ((mm = p.match(/^\/api\/executions\/([\w-]+)$/))) { const ex = store.getExecution(mm[1]); return ex ? send(res, 200, ex) : send(res, 404, { error: "Run not found" }); }
  if (p === "/api/credentials" && m === "GET") return send(res, 200, { schema: CRED_SCHEMA, values: maskSettings(store.getSettings()) });
  if (p === "/api/credentials" && m === "PUT") { store.saveSettings(mergeSettings(store.getSettings(), await body())); return send(res, 200, { ok: true, values: maskSettings(store.getSettings()) }); }
  if (p === "/api/credentials/test" && m === "POST") {
    const b = await body();
    const tests = {
      ai: [{ id: "a", type: "aiChat", name: "AI test", params: { prompt: "Reply with exactly: YantraFlow connected ✅", maxTokens: 30 } }],
      telegram: [{ id: "a", type: "telegram", name: "Telegram test", params: { text: "✅ YantraFlow is connected to this chat!" } }],
    }[b.service];
    if (!tests) return send(res, 400, { error: "Test is available for ai and telegram" });
    const wf = { id: "credential-test", name: `Test ${b.service}`, nodes: [{ id: "t", type: "manualTrigger", name: "Start", params: {} }, ...tests], connections: [{ from: "t", fromOutput: 0, to: "a" }] };
    const ex = await runner.run(wf, { mode: "test" });
    const node = ex.nodes.find((n) => n.id === "a") || {};
    return send(res, 200, { ok: ex.status === "success", error: ex.error, output: node.output });
  }
  return send(res, 404, { error: "Unknown API route" });
}

module.exports = { createServer, maskSettings, mergeSettings };

if (require.main === module) {
  const port = Number(process.env.PORT) || 5679;
  const host = process.env.HOST || "127.0.0.1";
  const server = createServer();
  server.runner.start();
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") console.error(`\n  Port ${port} is busy. Is YantraFlow already running? Open http://localhost:${port}\n  Or start on another port:  PORT=5680 npm start\n`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "localhost" : host;
    console.log(`\n  ⚡ YantraFlow ${pkg.version} is running\n  👉 Open: http://${shown === "127.0.0.1" ? "localhost" : shown}:${port}\n  Webhooks: http://localhost:${port}/webhook/<path>\n  Data folder: ${server.store.dir}\n  Stop: Ctrl+C\n`);
  });
}

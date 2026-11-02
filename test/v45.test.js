"use strict";
// v4.5: dropdown anchoring, Error Center explanations, Terminal (parser, website console, PC shell auth), new nodes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const C = require("../public/js/v45-core.js");
const XN = require("../public/js/extra-nodes.js");
const G = require("../public/js/guides.js");
const yfIcon = require("../public/js/icons.js");
const { publicNodeList } = require("../src/nodes");
const { checkCommand, resolveCd, isLocal } = require("../src/terminal");
const { tmpDir, silent } = require("./helpers");
const PUB = path.join(__dirname, "..", "public");

// ---------------------------------------------------------------- tiny mock for Telegram / Supabase / AI agent / Apps Script
let mock, mbase; const seen = [];
const TG = [{ update_id: 10, message: { message_id: 1, text: "pehla", chat: { id: 5, first_name: "N" }, from: { username: "nishu" }, date: 1 } }];
test.before(async () => {
  mock = http.createServer((req, res) => {
    const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
      const body = Buffer.concat(chunks).toString(); const u = new URL(req.url, "http://x"); seen.push({ method: req.method, path: u.pathname, search: u.search, headers: req.headers, body });
      const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (u.pathname.endsWith("/getUpdates")) { const off = Number(u.searchParams.get("offset") || 0); return json(200, { ok: true, result: TG.filter((x) => x.update_id >= off) }); }
      if (u.pathname.startsWith("/rest/v1/")) {
        if (req.headers.apikey !== "anon-key") return json(401, { message: "Invalid API key" });
        if (req.method === "GET") return json(200, [{ id: 1, title: "pehla" }, { id: 2, title: "doosra" }]);
        return json(201, [Object.assign({ id: 9 }, JSON.parse(body || "{}"))]);
      }
      if (u.pathname.endsWith("/chat/completions")) {
        const j = JSON.parse(body); const last = j.messages[j.messages.length - 1].content; const sys = (j.messages[0] || {}).content || "";
        let text = "AI: " + last.slice(0, 40);
        if (/You are an agent/.test(sys)) text = last.startsWith("Tool result:") ? `{"final":"GST = ${last.replace("Tool result: ", "")} rupaye"}` : '{"tool":"calculator","input":"2499*0.18"}';
        else if (/Classify/.test(sys)) text = last.includes("paisa wapas") ? "complaint" : "question";
        return json(200, { model: "mock", choices: [{ message: { content: text } }] });
      }
      if (u.pathname === "/macros/s/x/exec") return json(200, { ok: true, got: JSON.parse(body) });
      json(404, { error: "nope" });
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r)); mbase = `http://127.0.0.1:${mock.address().port}`;
});
test.after(() => mock.close());

// ---------------------------------------------------------------- 1) dropdown under the button
test("menu anchoring: dropdown sits right under the ⋮ button, right edges aligned, clamped and flipped inside the screen", () => {
  const phone = { width: 390, height: 844 };
  const p = C.placeMenu({ left: 344, right: 378, top: 8, bottom: 42 }, { width: 230, height: 330 }, phone);
  assert.equal(p.placement, "below"); assert.equal(p.top, 48); assert.equal(p.left + p.width, 378); assert.equal(p.align, "end");
  // a button near the left edge: opens to the right instead of off-screen
  const l = C.placeMenu({ left: 10, right: 44, top: 100, bottom: 134 }, { width: 230, height: 200 }, phone);
  assert.equal(l.left, 10); assert.equal(l.align, "start"); assert.ok(l.left + l.width <= phone.width - 8);
  // near the bottom: flips above the button, never below the screen
  const b = C.placeMenu({ left: 300, right: 340, top: 780, bottom: 814 }, { width: 220, height: 300 }, phone);
  assert.equal(b.placement, "above"); assert.ok(b.top + 300 <= 780); assert.ok(b.top >= 8);
  // a menu wider than the phone is shrunk to fit
  const w = C.placeMenu({ left: 300, right: 380, top: 10, bottom: 40 }, { width: 600, height: 100 }, phone);
  assert.ok(w.left >= 8 && w.left + w.width <= phone.width - 8);
  // every menu in the app uses it (no more side popups / bottom sheets for ⋮)
  const app = fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8");
  assert.ok(app.includes('window.YFUI.anchor(m, $("#more"))'));
  assert.ok(app.includes("if (!sheet) window.YFUI.anchor(p, at);") && app.includes("const sheet = false;"));
  assert.ok(fs.readFileSync(path.join(PUB, "js", "platform.js"), "utf8").includes('window.YFUI.anchor(m, $("#avatarBtn"))'));
  const css = fs.readFileSync(path.join(PUB, "css", "app.css"), "utf8") + fs.readFileSync(path.join(PUB, "css", "premium.css"), "utf8");
  assert.ok(/\.yf-dd/.test(css));
});

// ---------------------------------------------------------------- 2) Error Center
test("Error Center maps common errors to why + how-to-fix (Hinglish), with a generic fallback", () => {
  const cases = {
    "Telegram answered 400: Bad Request: failed to get HTTP URL content": "tg-url",
    "Telegram answered 400: Bad Request: chat not found": "tg-chat",
    "Telegram answered 401: Unauthorized": "tg-token",
    "AI answered 401: Invalid API Key": "auth",
    "Instagram answered 400: Error validating access token: Session has expired on Monday": "meta-token",
    "AI answered 404: The model `llama3-70b-8192` has been decommissioned": "model-404",
    "AI answered 429: Rate limit reached for model": "rate",
    "New signups are turned off right now.": "supa-signup",
    "Browser could not reach api.example.com — the site may block browser requests (CORS) or be offline.": "cors",
    "Could not reach the AI at http://localhost:8787/v1": "localhost",
    "Could not reach api.x.com: timed out after 60s": "timeout",
    "spawn ffmpeg ENOENT": "ffmpeg",
    "YouTube answered 400: invalid_grant": "yt-grant",
    "Expression {{$json.titel.trim()}} failed: Cannot read properties of undefined": "expr",
    "Loop detected: a node connects back to an earlier node. Remove the loop.": "loop",
    "Something odd happened": "generic",
  };
  for (const [msg, id] of Object.entries(cases)) {
    const h = C.explain(msg);
    assert.equal(h.id, id, msg);
    assert.ok(h.title && h.why && h.fix.length >= 1, id);
    assert.doesNotMatch(h.why + h.fix.join(" "), /[\u{1F000}-\u{1FAFF}]/u, id);
  }
  const ex = { id: "e1", status: "error", workflowId: "w1", workflowName: "Daily", mode: "schedule", error: "Telegram: chat not found", finishedAt: "2026-11-03T01:00:00Z", nodes: [{ id: "n1", name: "Start", type: "manualTrigger", status: "success" }, { id: "n2", name: "Telegram", type: "telegram", status: "error", error: "Telegram answered 400: Bad Request: chat not found" }] };
  const rows = C.fromExecution(ex);
  assert.equal(rows.length, 1); assert.equal(rows[0].nodeId, "n2"); assert.equal(rows[0].workflowName, "Daily"); assert.equal(rows[0].key, "e1:n2");
  assert.deepEqual(C.fromExecution({ status: "success", nodes: [] }), []);
  // "check workflow": no trigger, unconnected node, PC-only node on the website, missing key
  const meta = publicNodeList();
  const wf = { id: "w2", name: "T", nodes: [{ id: "a", type: "set", name: "Set", params: {} }, { id: "b", type: "execCommand", name: "Cmd", params: {} }, { id: "c", type: "telegram", name: "TG", params: {} }], connections: [{ from: "a", to: "c" }] };
  const issues = C.lintWorkflow(wf, { meta, edition: "web", missing: G.missing(wf, {}), sectionsOf: (t) => (G.NODE_SECTIONS[t] || []).map((r) => r.replace("?", "").split("|")[0]) });
  const kinds = issues.map((i) => i.kind);
  assert.ok(kinds.includes("no-trigger")); assert.ok(kinds.includes("pc-only")); assert.ok(kinds.includes("unconnected")); assert.ok(kinds.includes("key:telegram"));
  assert.equal(issues.find((i) => i.kind === "key:telegram").nodeId, "c");
  // UI wiring: bug icon in top bar + editor, badge, run toast with Details / Fix
  const ui = fs.readFileSync(path.join(PUB, "js", "ui-plus.js"), "utf8");
  for (const s of ["errBtn", "data-err-badge", "Kyun aaya?", "Kaise fix karein", "data-jump", "Details", "Fix", "Clear all", "Resolved"]) assert.ok(ui.includes(s), s);
  assert.ok(fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8").includes('errButton("edErr")'));
});

// ---------------------------------------------------------------- 3) Terminal
test("terminal: command parser + website console (never prints secrets)", async () => {
  assert.deepEqual(C.parseCommand('run "Daily quote" now'), { cmd: "run", args: ["Daily quote", "now"], raw: 'run "Daily quote" now' });
  assert.deepEqual(C.parseCommand("  LOGS   5 ").args, ["5"]); assert.equal(C.parseCommand("  LOGS 5").cmd, "logs");
  assert.deepEqual(C.parseCommand("echo 'a b' \"\"").args, ["a b", ""]);
  const ran = [];
  const api = { version: "4.5.0", edition: "web", listWorkflows: async () => [{ id: "w1", name: "Daily quote" }, { id: "w2", name: "Insta reel" }], run: async (id) => { ran.push(id); return { status: "error", error: "x", durationMs: 5, nodes: [{ name: "TG", status: "error", error: "chat not found" }], logs: [] }; }, stop: async (id) => ran.push("stop:" + id), runs: async () => [{ startedAt: "2026-11-03T00:00:00Z", status: "success", workflowName: "Daily quote" }], errors: async () => [{ workflowName: "Daily", nodeName: "TG", error: "Telegram answered 400: Bad Request: chat not found" }], keys: async () => [{ title: "AI", ok: true }, { title: "Telegram bot", ok: false }], status: async () => ({ edition: "web" }), open: () => {} };
  const txt = async (l) => (await C.consoleCommand(l, api)).lines.map((x) => x.t).join("\n");
  assert.match(await txt("help"), /run <naam ya number>/); assert.match(await txt("help"), /PC\/Termux/);
  assert.match(await txt("list"), /1\. Daily quote/);
  assert.match(await txt("run 2"), /Failed/); assert.deepEqual(ran, ["w2"]);
  assert.match(await txt("run daily"), /TG/); assert.equal(ran[1], "w1");
  assert.match(await txt("run nahi-hai"), /nahi mila/);
  assert.match(await txt("errors"), /Telegram chat ID galat hai/);
  const k = await txt("keys"); assert.match(k, /\[set\]\s+AI/); assert.match(k, /\[missing\] Telegram/); assert.doesNotMatch(k, /gsk_|sk-/);
  assert.equal((await C.consoleCommand("clear", api)).clear, true);
  assert.match(await txt("git pull"), /sirf PC\/Termux/);
});

test("terminal (PC): needs the password session, localhost + header; blocks wreckers; streams output; cd works", async () => {
  assert.equal(checkCommand("rm -rf /").ok, false); assert.equal(checkCommand("rm -rf ~").ok, false); assert.equal(checkCommand("mkfs.ext4 /dev/sda1").ok, false);
  assert.equal(checkCommand("shutdown now").ok, false); assert.equal(checkCommand(":(){ :|:& };:").ok, false);
  assert.equal(checkCommand("rm -rf node_modules").ok, true); assert.equal(checkCommand("git pull").ok, true); assert.equal(checkCommand("").ok, false);
  assert.ok(isLocal("127.0.0.1") && isLocal("::1") && isLocal("::ffff:127.0.0.1")); assert.equal(isLocal("192.168.1.5"), false);
  const root = tmpDir(); fs.mkdirSync(path.join(root, "sub"));
  assert.equal(resolveCd("cd sub", root).cwd, path.join(root, "sub")); assert.ok(resolveCd("cd nope", root).error); assert.equal(resolveCd("ls", root), null);
  const { createServer } = require("../src/server");
  const server = createServer({ dataDir: tmpDir(), logger: silent, password: "TEST-PASS", terminalRoot: root });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const H = { "content-type": "application/json", "x-yf-terminal": "1" };
    let r = await fetch(base + "/api/terminal/run", { method: "POST", headers: H, body: JSON.stringify({ cmd: "echo hi" }) });
    assert.equal(r.status, 401); // not logged in
    r = await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "TEST-PASS" }) });
    const cookie = r.headers.get("set-cookie").split(";")[0];
    r = await fetch(base + "/api/terminal/run", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ cmd: "echo hi" }) });
    assert.equal(r.status, 403); // missing header (CSRF guard)
    r = await fetch(base + "/api/terminal/run", { method: "POST", headers: Object.assign({ cookie }, H), body: JSON.stringify({ cmd: "rm -rf /" }) });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /block/);
    r = await fetch(base + "/api/terminal/run", { method: "POST", headers: Object.assign({ cookie }, H), body: JSON.stringify({ cmd: "echo YantraFlow-$((40+5)) && pwd" }) });
    assert.equal(r.status, 200); const out = await r.text();
    assert.match(out, /YantraFlow-45/); assert.ok(out.includes(root)); assert.match(out, /\[exit 0\]/);
    r = await fetch(base + "/api/terminal/run", { method: "POST", headers: Object.assign({ cookie }, H), body: JSON.stringify({ cmd: "cd sub" }) });
    assert.match(await r.text(), /\[exit 0\] .*sub/);
    r = await fetch(base + "/api/terminal/run", { method: "POST", headers: Object.assign({ cookie }, H), body: JSON.stringify({ cmd: "pwd; exit 3" }) });
    const o2 = await r.text(); assert.ok(o2.includes(path.join(root, "sub"))); assert.match(o2, /\[exit 3\]/);
    const info = await (await fetch(base + "/api/terminal/info", { headers: Object.assign({ cookie }, H) })).json();
    assert.equal(info.enabled, true); assert.ok(info.cwd.endsWith("sub"));
  } finally { server.close(); }
  // YANTRAFLOW_TERMINAL=off turns it off
  const s2 = createServer({ dataDir: tmpDir(), logger: silent, password: "", env: Object.assign({}, process.env, { YANTRAFLOW_TERMINAL: "off" }) });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  try { const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/terminal/run`, { method: "POST", headers: { "content-type": "application/json", "x-yf-terminal": "1" }, body: JSON.stringify({ cmd: "echo hi" }) }); assert.equal(r.status, 403); }
  finally { s2.close(); }
});

// ---------------------------------------------------------------- 4) node picker categories + new nodes
test("node picker: Trigger / Core / Flow / AI / Social / Data / Media, every node has icon + description + field help", () => {
  const meta = publicNodeList(); const cats = XN.CATEGORIES.map((c) => c.id);
  assert.deepEqual(cats, ["Trigger", "Core", "Flow", "AI", "Social", "Data", "Media"]);
  for (const m of meta) { assert.ok(cats.includes(m.group), `${m.type} group ${m.group}`); assert.ok(yfIcon.has(m.icon), m.type); assert.ok(m.description && m.description.length > 10, m.type); }
  for (const c of XN.CATEGORIES) assert.ok(yfIcon.has(c.icon), c.id);
  const types = new Set(meta.map((m) => m.type));
  for (const t of ["rssTrigger", "telegramTrigger", "formTrigger", "execCommand", "merge", "splitItems", "removeDuplicates", "errorHandler", "stopError", "aiSummarize", "aiClassify", "aiTranslate", "aiImagePrompt", "aiAgent", "whatsappLink", "jsonTools", "csvTools", "dateTime", "textTools", "memory", "supabase", "sheetAppend"]) assert.ok(types.has(t), t);
  assert.ok(meta.length >= 55);
  for (const g of cats) assert.ok(meta.filter((m) => m.group === g).length >= 3, g);
  assert.equal(meta.find((m) => m.type === "execCommand").fullOnly.length > 0, true); // PC-only is marked
  const web = fs.readFileSync(path.join(PUB, "js", "web-nodes.js"), "utf8"); assert.ok(web.includes("window.YFExtraNodes")); // same code runs on the website
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  for (const f of ["extra-nodes.js", "v45-core.js", "ui-plus.js"]) assert.ok(html.indexOf(`js/${f}`) > 0 && fs.existsSync(path.join(PUB, "js", f)), f);
  assert.ok(html.indexOf("js/extra-nodes.js") < html.indexOf("js/web-nodes.js"));
});

test("new nodes run for real on PC (server): data, flow, AI, triggers, Supabase, Sheet, WhatsApp, command, form", async () => {
  const { createServer } = require("../src/server");
  const dataDir = tmpDir();
  process.env.YANTRAFLOW_TELEGRAM_API = mbase;
  const server = createServer({ dataDir, logger: silent, password: "" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return r.json(); };
  const ai = { baseUrl: `${mbase}/v1`, apiKey: "k", model: "mock" };
  const run = async (nodes, connections) => { const wf = await api("POST", "/api/workflows", { name: "t", nodes, connections }); return api("POST", `/api/workflows/${wf.id}/run`, {}); };
  const out = (ex, id) => { const n = ex.nodes.find((x) => x.id === id); assert.ok(n, id); assert.equal(n.status, "success", `${id}: ${n.error}`); return n.output; };
  try {
    await api("PUT", "/api/credentials", { ai, telegram: { botToken: "1:TOK", chatId: "5" } });
    const T = { id: "t", type: "manualTrigger", name: "Start", params: { testData: JSON.stringify({ text: "  hello world #yantra https://a.b/c  ", list: [{ a: 1 }, { a: 2 }, { a: 2 }], json: "```json\n{\"x\": 5}\n```", csv: "name,age\nNishu,22\nKashu,20", phone: "+91 98765-43210" }) } };
    let ex = await run([T,
      { id: "tt", type: "textTools", name: "Text", params: { op: "hashtags", text: "{{ $json.text }}", into: "tags" } },
      { id: "sp", type: "splitItems", name: "Split", params: { mode: "split out a list field", field: "list" } },
      { id: "dd", type: "removeDuplicates", name: "Dedupe", params: { field: "a" } },
      { id: "mg", type: "merge", name: "Merge", params: { mode: "list in one item" } },
      { id: "js", type: "jsonTools", name: "JSON", params: { mode: "parse", field: "json", into: "obj" } },
      { id: "cv", type: "csvTools", name: "CSV", params: { mode: "text to items", field: "csv" } },
      { id: "dt", type: "dateTime", name: "Date", params: { op: "add", value: "2026-11-03T00:00:00Z", amount: 2, unit: "days", format: "DD-MM-YYYY", timezone: "UTC", into: "d" } },
      { id: "wa", type: "whatsappLink", name: "WA", params: { phone: "{{ $json.phone }}", text: "Namaste ji" } },
      { id: "mm", type: "memory", name: "Mem", params: { op: "increment", key: "runs" } },
    ], [{ from: "t", to: "tt" }, { from: "t", to: "sp" }, { from: "sp", to: "dd" }, { from: "dd", to: "mg" }, { from: "t", to: "js" }, { from: "t", to: "cv" }, { from: "t", to: "dt" }, { from: "t", to: "wa" }, { from: "t", to: "mm" }]);
    assert.equal(ex.status, "success", ex.error);
    assert.deepEqual(out(ex, "tt")[0].tags, ["#yantra"]);
    assert.equal(out(ex, "sp").length, 3); assert.equal(out(ex, "dd").length, 2);
    assert.equal(out(ex, "mg")[0].count, 2);
    assert.equal(out(ex, "js")[0].obj.x, 5);
    assert.deepEqual(out(ex, "cv").map((r) => r.name), ["Nishu", "Kashu"]);
    assert.equal(out(ex, "dt")[0].d.text, "05-11-2026");
    assert.equal(out(ex, "wa")[0].whatsappUrl, "https://wa.me/919876543210?text=Namaste%20ji");
    assert.equal(out(ex, "mm")[0].memory, 1);
    ex = await run([T, { id: "mm", type: "memory", name: "Mem", params: { op: "increment", key: "runs" } }], [{ from: "t", to: "mm" }]);
    assert.equal(out(ex, "mm")[0].memory, 2); // remembered across runs (data/memory.json)
    assert.ok(fs.existsSync(path.join(dataDir, "memory.json")));
    // error handler: failing node with "Continue if it fails" -> error branch; Stop & Error -> run fails with my message
    ex = await run([T, Object.assign({ id: "j", type: "jsonTools", name: "Bad JSON", params: { mode: "parse", field: "text" } }, { continueOnFail: true }), { id: "eh", type: "errorHandler", name: "EH", params: {} }, { id: "ok", type: "log", name: "OK", params: { message: "ok" } }, { id: "bad", type: "stopError", name: "Stop", params: { message: "Galat data: {{ $json.error }}" } }],
      [{ from: "t", to: "j" }, { from: "j", to: "eh" }, { from: "eh", fromOutput: 0, to: "ok" }, { from: "eh", fromOutput: 1, to: "bad" }]);
    assert.equal(ex.status, "error"); assert.equal(ex.nodes.find((n) => n.id === "ok").status, "skipped");
    assert.match(ex.nodes.find((n) => n.id === "bad").error, /^Galat data: "text" valid JSON nahi hai/);
    // AI nodes (mock AI) + agent with a calculator tool
    ex = await run([T, { id: "sm", type: "aiSummarize", name: "Sum", params: { text: "{{ $json.text }}" } }, { id: "cl", type: "aiClassify", name: "Cls", params: { text: "mujhe paisa wapas chahiye", categories: "question, complaint, spam" } }, { id: "tr", type: "aiTranslate", name: "Tr", params: { text: "hello", to: "Hindi" } }, { id: "ip", type: "aiImagePrompt", name: "IP", params: { topic: "chai" } }, { id: "ag", type: "aiAgent", name: "Agent", params: { task: "2499 pe 18% GST?", tools: "calculator, datetime" } }],
      [{ from: "t", to: "sm" }, { from: "t", to: "cl" }, { from: "t", to: "tr" }, { from: "t", to: "ip" }, { from: "t", to: "ag" }]);
    assert.equal(ex.status, "success", ex.error);
    assert.match(out(ex, "sm")[0].summary, /^AI:/); assert.equal(out(ex, "cl")[0].category, "complaint"); assert.match(out(ex, "tr")[0].translated, /^AI:/); assert.match(out(ex, "ip")[0].imagePrompt, /^AI:/);
    const ag = out(ex, "ag")[0]; assert.equal(ag.steps[0].tool, "calculator"); assert.equal(ag.steps[0].result, "449.82"); assert.match(ag.answer, /449\.82/);
    // Supabase + Google Sheet (Apps Script URL) + Telegram Message trigger + Run Command
    ex = await run([T, { id: "sb", type: "supabase", name: "SB", params: { op: "select", supabaseUrl: mbase, supabaseKey: "anon-key", table: "posts", filter: "limit=2" } }, { id: "sb2", type: "supabase", name: "SB ins", params: { op: "insert", supabaseUrl: mbase, supabaseKey: "anon-key", table: "posts", row: "{\"title\": \"naya\"}" } }, { id: "cmd", type: "execCommand", name: "Cmd", params: { command: "echo cmd-{{ $json.phone.length }}" } }],
      [{ from: "t", to: "sb" }, { from: "t", to: "sb2" }, { from: "t", to: "cmd" }]);
    assert.equal(ex.status, "success", ex.error);
    assert.equal(out(ex, "sb").length, 2); assert.equal(out(ex, "sb2")[0].title, "naya"); assert.equal(out(ex, "cmd")[0].stdout, "cmd-15");
    assert.ok(seen.some((s) => s.path === "/rest/v1/posts" && s.search === "?limit=2" && s.headers.apikey === "anon-key"));
    ex = await run([T, { id: "ud", type: "supabase", name: "SB del", params: { op: "delete", supabaseUrl: mbase, supabaseKey: "anon-key", table: "posts", filter: "" } }], [{ from: "t", to: "ud" }]);
    assert.match(ex.error, /Filter zaroori/); // never wipes a whole table
    ex = await run([T, { id: "gs", type: "sheetAppend", name: "Sheet", params: { url: "https://example.com/x", row: "{}" } }], [{ from: "t", to: "gs" }]);
    assert.match(ex.error, /script\.google\.com/);
    const tgT = { id: "tg", type: "telegramTrigger", name: "TG msg", params: {} };
    ex = await run([tgT, { id: "l", type: "log", name: "L", params: { message: "{{ $json.text }}" } }], [{ from: "tg", to: "l" }]);
    assert.equal(ex.status, "success", ex.error); assert.equal(out(ex, "tg")[0].chatId, 5);
    const def = require("../src/nodes").BY_TYPE.telegramTrigger; const st = {};
    assert.deepEqual(await def.poll({ raw: {}, settings: { telegram: { botToken: "1:TOK" } }, filesDir: dataDir }, st), []); // first poll only remembers the offset
    TG.push({ update_id: 11, message: { message_id: 2, text: "naya message", chat: { id: 5, first_name: "N" }, from: { username: "nishu" }, date: 2 } });
    const fresh = await def.poll({ raw: {}, settings: { telegram: { botToken: "1:TOK" } }, filesDir: dataDir }, st);
    assert.deepEqual(fresh.map((m) => m.text), ["naya message"]);
    // Form Submit trigger: public form page on PC
    const fwf = await api("POST", "/api/workflows", { name: "Form", active: true, nodes: [{ id: "f", type: "formTrigger", name: "Form", params: { title: "Order form", path: "order", fields: "name | Naam | text | required\nqty | Kitne | number" } }, { id: "m", type: "memory", name: "Save", params: { op: "set", key: "lastOrder", value: "{{ $json.name }}:{{ $json.qty }}" } }], connections: [{ from: "f", to: "m" }] });
    await api("POST", `/api/workflows/${fwf.id}/active`, { active: true });
    const page = await (await fetch(base + "/form/order")).text(); assert.match(page, /Order form/); assert.match(page, /name="qty"/);
    let fr = await fetch(base + "/form/order", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "qty=2" }); assert.equal(fr.status, 400);
    fr = await fetch(base + "/form/order", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Nishu&qty=2" }); assert.match(await fr.text(), /Shukriya/);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")).lastOrder, "Nishu:2");
    assert.equal((await fetch(base + "/form/nahi-hai")).status, 404);
  } finally { server.close(); delete process.env.YANTRAFLOW_TELEGRAM_API; }
});

test("website host: the same node code runs with browser helpers (memory in localStorage, form popup, no shell)", async () => {
  const mem = new Map();
  const H = { edition: "web", http: async () => ({ ok: true, status: 200, data: "" }), apiError: (n, r) => new Error(n + r.status), parseFeed: () => [], ai: async () => ({ text: "x" }), mem: { get: async (k) => (mem.has(k) ? mem.get(k) : null), set: async (k, v) => mem.set(k, v) }, askForm: async (d) => ({ name: "Kashu", d: d.fields.length }) };
  const by = Object.fromEntries(XN.DEFS.map((d) => [d.type, d]));
  const ctx = (raw, items) => ({ raw, items: items || [{}], settings: {}, workflow: { id: "w" }, node: { id: "n" }, p: (k) => raw[k] });
  const f = await by.formTrigger.run(ctx({ title: "T", fields: "name | Naam | text | required\nage|Age|number" }), H);
  assert.equal(f[0][0].name, "Kashu"); assert.equal(f[0][0].d, 2);
  const d1 = await by.removeDuplicates.run(ctx({ field: "id", remember: true }, [{ id: 1 }, { id: 2 }]), H);
  const d2 = await by.removeDuplicates.run(ctx({ field: "id", remember: true }, [{ id: 2 }, { id: 3 }]), H);
  assert.equal(d1[0].length, 2); assert.deepEqual(d2[0].map((x) => x.id), [3]); // no repeat across runs
  await assert.rejects(by.execCommand.run(ctx({ command: "ls" }), H), /PC\/Termux/);
  assert.equal(XN.helpers.textOp("slug", "Good Morning Doston!"), "good-morning-doston");
  assert.equal(XN.helpers.calc("2^10 + sqrt(16)"), 1028); assert.throws(() => XN.helpers.calc("process.exit()"));
  assert.equal(XN.helpers.toCsv([{ a: 1, b: "x,y" }]), 'a,b\n1,"x,y"');
});

test("new AI / key fields have field help + guides; README documents v4.5", () => {
  for (const t of ["aiSummarize", "aiClassify", "aiTranslate", "aiImagePrompt", "aiAgent"]) for (const k of ["baseUrl", "apiKey", "model"]) assert.ok(G.fieldInfo(t, k), `${t}.${k}`);
  assert.ok(G.fieldInfo("supabase", "supabaseKey").what); assert.ok(G.fieldInfo("sheetAppend", "url").eg); assert.ok(G.fieldInfo("telegramTrigger", "botToken"));
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  assert.match(readme, /What's new in v4\.5/); assert.match(readme, /Error Center/); assert.match(readme, /Terminal/);
});

"use strict";
// Every YantraFlow node lives here: what the editor shows (label, icon, fields)
// and what it does when a workflow runs (run). Add your own node by copying one!
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { sendMail } = require("./smtp");
const { parseFeed } = require("./rss");
const { parseCsv } = require("./csv");
const { oauth1Header } = require("./oauth1");
const AIM = require("../public/js/ai-model.js");

// API base URLs (overridable with env vars — handy for tests or proxies).
const API = {
  telegram: () => process.env.YANTRAFLOW_TELEGRAM_API || "https://api.telegram.org",
  graph: () => process.env.YANTRAFLOW_GRAPH_API || "https://graph.facebook.com/v21.0",
  googleToken: () => process.env.YANTRAFLOW_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  youtubeUpload: () => process.env.YANTRAFLOW_YOUTUBE_UPLOAD || "https://www.googleapis.com/upload/youtube/v3/videos",
  x: () => process.env.YANTRAFLOW_X_API || "https://api.twitter.com",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const one = (items) => [items];
const s = (v) => (v === undefined || v === null ? "" : String(v));

async function http(url, opts = {}) {
  const timeout = opts.timeoutMs || 60000;
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    const why = e.name === "TimeoutError" ? `timed out after ${timeout / 1000}s` : (e.cause && e.cause.message) || e.message;
    throw new Error(`Could not reach ${new URL(url).host}: ${why}`);
  }
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
  return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers), data };
}
function apiError(name, r) {
  const d = r.data;
  const msg = (d && (d.description || (d.error && (d.error.message || d.error)) || d.message || d.detail || d.title)) || (typeof d === "string" ? d.slice(0, 300) : JSON.stringify(d).slice(0, 300));
  return new Error(`${name} answered ${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
}
function resolvePath(ctx, p) {
  p = s(p).trim();
  if (!p) throw new Error("File path is empty");
  if (p.startsWith("~")) p = path.join(require("node:os").homedir(), p.slice(1));
  return path.isAbsolute(p) ? p : path.join(ctx.filesDir, p);
}
function need(v, what) { if (!s(v).trim()) throw new Error(`${what} is empty. Add it in the node or on the Credentials page.`); return s(v).trim(); }
function parseLines(text) {
  // "key = value" per line  ->  [[key, value]]
  return s(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.search(/=|:/);
    if (i < 0) return [l, ""];
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
}
function setDeep(obj, key, val) {
  const parts = key.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || !o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = val;
}
async function fileBlob(file) {
  const buf = await fsp.readFile(file);
  return new Blob([buf]);
}

// ------------------------------------------------------------------ nodes
const NODES = [];
const def = (d) => { NODES.push(Object.assign({ inputs: 1, outputs: 1, params: [] }, d)); };
const CRED = "(blank = use Keys page)";

// ===== Triggers
def({
  type: "manualTrigger", label: "Manual Trigger", group: "Triggers", icon: "play", color: "#22c55e", inputs: 0, trigger: "manual",
  description: "Starts when you press Run.",
  params: [{ key: "testData", label: "Test data (JSON, optional)", type: "json", default: "{}" }],
  async run(ctx) {
    let d = {};
    try { d = JSON.parse(ctx.raw.testData || "{}"); } catch (_) { throw new Error("Test data is not valid JSON"); }
    return one(Array.isArray(d) ? d : [d]);
  },
});
def({
  type: "scheduleTrigger", label: "Schedule", group: "Triggers", icon: "clock", color: "#22c55e", inputs: 0, trigger: "schedule",
  description: "Runs on a timer or cron while the workflow is Active.",
  params: [
    { key: "mode", label: "Mode", type: "select", options: ["interval", "cron"], default: "interval" },
    { key: "minutes", label: "Every N minutes (interval mode)", type: "number", default: 60 },
    { key: "cron", label: "Cron (cron mode)", type: "text", default: "0 9 * * *", help: "minute hour day month weekday — e.g. 0 9 * * * = every day 9:00, */15 * * * * = every 15 min, 30 18 * * 1-5 = weekdays 6:30 PM" },
  ],
  async run(ctx) { return one([{ firedAt: new Date().toISOString() }]); },
});
def({
  type: "webhookTrigger", fullOnly: "Webhooks need a server — use the full version on PC/Termux.", label: "Webhook", group: "Triggers", icon: "webhook", color: "#22c55e", inputs: 0, trigger: "webhook",
  description: "Starts when a URL is called: http://localhost:PORT/webhook/<path>",
  params: [
    { key: "path", label: "Path", type: "text", default: "my-hook" },
    { key: "method", label: "Method", type: "select", options: ["ANY", "GET", "POST"], default: "ANY" },
    { key: "respond", label: "Respond with", type: "select", options: ["lastNode", "immediately"], default: "lastNode", help: "lastNode = wait and send the last node's output (or a Respond node). immediately = answer {ok:true} at once." },
    { key: "testData", label: "Test body when you press Run (JSON)", type: "json", default: "{\"message\": \"hello\"}" },
  ],
  async run(ctx) {
    if (ctx.webhook) return one([ctx.webhook]);
    let body = {};
    try { body = JSON.parse(ctx.raw.testData || "{}"); } catch (_) { throw new Error("Test body is not valid JSON"); }
    return one([{ body, query: {}, headers: {}, method: "POST", test: true }]);
  },
});
def({
  type: "folderTrigger", fullOnly: "Browsers cannot watch folders — use the full version.", label: "Folder Watch", group: "Triggers", icon: "folder-search", color: "#22c55e", inputs: 0, trigger: "poll",
  description: "Fires once for every NEW file that appears in a folder (checked every few seconds while Active).",
  params: [
    { key: "folder", label: "Folder", type: "text", default: "inbox", help: "Relative = inside YantraFlow's data/files. Termux phone storage: /sdcard/Movies (run termux-setup-storage once)." },
    { key: "extensions", label: "Only these file types", type: "text", default: ".mp4,.mov,.jpg,.png" },
    { key: "seconds", label: "Check every N seconds", type: "number", default: 30 },
    { key: "testFile", label: "Test file name when you press Run", type: "text", default: "my-video.mp4" },
  ],
  pollEverySeconds: (raw) => Math.max(5, Number(raw.seconds) || 30),
  async poll(ctx, state) {
    const dir = resolvePath(ctx, ctx.raw.folder || "inbox");
    await fsp.mkdir(dir, { recursive: true });
    const exts = s(ctx.raw.extensions).toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
    const names = (await fsp.readdir(dir)).filter((n) => !n.startsWith(".") && (!exts.length || exts.some((e) => n.toLowerCase().endsWith(e))));
    const seen = new Set(state.seen || []);
    const first = !state.initialized;
    const fresh = [];
    for (const n of names) {
      if (seen.has(n)) continue;
      const full = path.join(dir, n);
      const st = await fsp.stat(full).catch(() => null);
      if (!st || !st.isFile()) continue;
      // wait until the file stops growing (copy finished)
      if (state.sizes && state.sizes[n] !== st.size) { state.sizes[n] = st.size; continue; }
      seen.add(n);
      if (!first) fresh.push({ path: full, name: n, ext: path.extname(n).toLowerCase(), size: st.size, modified: st.mtime.toISOString() });
    }
    if (first) { state.sizes = {}; for (const n of names) seen.add(n); }
    state.seen = [...seen].slice(-5000);
    state.initialized = true;
    return fresh;
  },
  async run(ctx) {
    if (ctx.pollItems) return one(ctx.pollItems);
    const dir = resolvePath(ctx, ctx.raw.folder || "inbox");
    const n = ctx.raw.testFile || "my-video.mp4";
    return one([{ path: path.join(dir, n), name: n, ext: path.extname(n).toLowerCase(), size: 0, modified: new Date().toISOString(), test: true }]);
  },
});
def({
  type: "sheetTrigger", label: "Sheet / CSV New Row", group: "Triggers", icon: "googlesheets", color: "#22c55e", inputs: 0, trigger: "poll",
  description: "Fires for every new row in a Google Sheet (File → Share → Publish to web → CSV link) or a local .csv file.",
  params: [
    { key: "source", label: "CSV link or file path", type: "text", default: "", placeholder: "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" },
    { key: "minutes", label: "Check every N minutes", type: "number", default: 5 },
  ],
  pollEverySeconds: (raw) => Math.max(60, (Number(raw.minutes) || 5) * 60),
  async poll(ctx, state) {
    const rows = await readCsvSource(ctx, ctx.raw.source);
    const first = !state.initialized;
    state.initialized = true;
    const before = state.count || 0;
    state.count = rows.length;
    if (first) return [];
    return rows.slice(before);
  },
  async run(ctx) {
    if (ctx.pollItems) return one(ctx.pollItems);
    const rows = await readCsvSource(ctx, ctx.raw.source);
    return one(rows.slice(-1));
  },
});
async function readCsvSource(ctx, src) {
  src = need(src, "CSV link / file path");
  if (/^https?:\/\//i.test(src)) {
    const r = await http(src);
    if (!r.ok) throw apiError("Sheet", r);
    return parseCsv(typeof r.data === "string" ? r.data : JSON.stringify(r.data));
  }
  return parseCsv(await fsp.readFile(resolvePath(ctx, src), "utf8"));
}

// ===== Core
def({
  type: "httpRequest", label: "HTTP Request", group: "Core", icon: "globe", color: "#3b82f6",
  description: "Call any API or website.",
  params: [
    { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
    { key: "url", label: "URL", type: "text", default: "https://api.github.com/repos/shanir01/YantraFlow" },
    { key: "headers", label: "Headers (one per line: Name = value)", type: "textarea", default: "" },
    { key: "body", label: "Body (JSON or text, for POST/PUT)", type: "textarea", default: "" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const method = ctx.p("method", i) || "GET";
      const url = need(ctx.p("url", i), "URL");
      const headers = { "user-agent": "YantraFlow" };
      for (const [k, v] of parseLines(ctx.p("headers", i))) headers[k] = v;
      let body = ctx.p("body", i);
      if (method !== "GET" && body !== "" && body !== undefined) {
        if (typeof body === "object") body = JSON.stringify(body);
        else if (/^\s*[[{]/.test(body)) { try { JSON.parse(body); } catch (_) { /* send as text */ } }
        if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = /^\s*[[{]/.test(body) ? "application/json" : "text/plain";
      } else body = undefined;
      const r = await http(url, { method, headers, body });
      out.push({ status: r.status, ok: r.ok, data: r.data });
    }
    return one(out);
  },
});
def({
  type: "set", label: "Set Fields", group: "Core", icon: "square-pen", color: "#3b82f6",
  description: "Add or change fields. One per line: name = value  (values can use {{ }})",
  params: [
    { key: "fields", label: "Fields", type: "textarea", default: "greeting = Hello {{ $json.name || 'Nishu' }}\ndate = {{ $today }}" },
    { key: "keepOld", label: "Keep existing fields", type: "boolean", default: true },
  ],
  async run(ctx) {
    return one(ctx.items.map((item, i) => {
      const o = ctx.raw.keepOld === false || ctx.raw.keepOld === "false" ? {} : JSON.parse(JSON.stringify(item));
      for (const [k, v] of parseLines(ctx.raw.fields)) setDeep(o, k, ctx.evalFor(v, i));
      return o;
    }));
  },
});
def({
  type: "code", label: "Code (JavaScript)", group: "Core", icon: "code-xml", color: "#3b82f6",
  description: "Write JavaScript. `items` = list of inputs. Return a list (or one object).",
  params: [{ key: "code", label: "JavaScript", type: "code", default: "// items = [{...}, {...}]\nreturn items.map(item => ({\n  ...item,\n  upper: String(item.title || 'hello').toUpperCase(),\n}));" }],
  async run(ctx) {
    const logs = [];
    const sandbox = {
      items: JSON.parse(JSON.stringify(ctx.items)), $node: ctx.nodeData, $now: new Date().toISOString(),
      console: { log: (...a) => { const m = a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" "); logs.push(m); ctx.log(m); } },
      fetch, setTimeout, URL, URLSearchParams, Buffer,
    };
    let result;
    try {
      const fn = vm.runInNewContext(`(async () => {\n${ctx.raw.code || "return items;"}\n})`, sandbox, { timeout: 2000 });
      result = await fn();
    } catch (e) { throw new Error(`Code error: ${e.message}`); }
    if (result === undefined) result = sandbox.items;
    if (!Array.isArray(result)) result = [result];
    return one(result.map((r) => (r && typeof r === "object" ? (r.json && Object.keys(r).length === 1 ? r.json : r) : { value: r })));
  },
});
def({
  type: "if", label: "IF", group: "Logic", icon: "split", color: "#a855f7", outputs: 2, outputLabels: ["true", "false"],
  description: "Sends each item to TRUE (top) or FALSE (bottom).",
  params: [
    { key: "left", label: "Value", type: "text", default: "{{ $json.status }}" },
    { key: "op", label: "Condition", type: "select", options: ["equals", "not equals", "contains", "not contains", "greater than", "less than", "is empty", "is not empty", "starts with", "ends with", "regex", "is true"], default: "equals" },
    { key: "right", label: "Compare with", type: "text", default: "200" },
  ],
  async run(ctx) {
    const t = [], f = [];
    ctx.items.forEach((item, i) => (testCondition(ctx.p("left", i), ctx.raw.op, ctx.p("right", i)) ? t : f).push(item));
    return [t, f];
  },
});
function testCondition(a, op, b) {
  const as = s(typeof a === "object" && a !== null ? JSON.stringify(a) : a), bs = s(b);
  const num = (x) => Number(x);
  switch (op) {
    case "equals": return as === bs;
    case "not equals": return as !== bs;
    case "contains": return as.toLowerCase().includes(bs.toLowerCase());
    case "not contains": return !as.toLowerCase().includes(bs.toLowerCase());
    case "greater than": return num(a) > num(b);
    case "less than": return num(a) < num(b);
    case "is empty": return as.trim() === "" || as === "[]" || as === "{}";
    case "is not empty": return !(as.trim() === "" || as === "[]" || as === "{}");
    case "starts with": return as.startsWith(bs);
    case "ends with": return as.endsWith(bs);
    case "regex": return new RegExp(bs, "i").test(as);
    case "is true": return a === true || as === "true" || as === "1" || as === "yes";
    default: throw new Error(`Unknown condition "${op}"`);
  }
}
def({
  type: "switch", label: "Switch", group: "Logic", icon: "route", color: "#a855f7", outputs: 4, outputLabels: ["1", "2", "3", "else"],
  description: "Route by value: output 1/2/3 when the value matches, else the last output.",
  params: [
    { key: "value", label: "Value", type: "text", default: "{{ $json.type }}" },
    { key: "case1", label: "Output 1 when value =", type: "text", default: "news" },
    { key: "case2", label: "Output 2 when value =", type: "text", default: "meme" },
    { key: "case3", label: "Output 3 when value =", type: "text", default: "" },
  ],
  async run(ctx) {
    const outs = [[], [], [], []];
    ctx.items.forEach((item, i) => {
      const v = s(ctx.p("value", i)).trim().toLowerCase();
      const k = ["case1", "case2", "case3"].findIndex((c) => s(ctx.p(c, i)).trim() !== "" && s(ctx.p(c, i)).trim().toLowerCase() === v);
      outs[k >= 0 ? k : 3].push(item);
    });
    return outs;
  },
});
def({
  type: "delay", label: "Delay", group: "Logic", icon: "timer", color: "#a855f7",
  description: "Wait before continuing.",
  params: [{ key: "seconds", label: "Seconds", type: "number", default: 5 }],
  async run(ctx) { await sleep(Math.min(Number(ctx.p("seconds")) || 0, 3600) * 1000); return one(ctx.items); },
});
def({
  type: "filter", label: "Limit / Filter", group: "Logic", icon: "funnel", color: "#a855f7",
  description: "Keep only the first N items, and/or items matching a JS condition.",
  params: [
    { key: "max", label: "Keep first N (0 = all)", type: "number", default: 3 },
    { key: "condition", label: "Keep when (optional, JS)", type: "text", default: "", placeholder: "{{ $json.title.length > 10 }}" },
  ],
  async run(ctx) {
    let items = ctx.items.filter((_, i) => (s(ctx.raw.condition).trim() ? !!ctx.p("condition", i) : true));
    const n = Number(ctx.raw.max) || 0;
    if (n > 0) items = items.slice(0, n);
    return one(items);
  },
});

// ===== AI
def({
  type: "aiChat", label: "AI Chat", group: "AI", icon: "sparkles", color: "#f59e0b",
  description: "Ask any OpenAI-compatible AI. Default: your FreeLLM-Router on http://localhost:8787/v1. Model blank = auto-pick (Groq: openai/gpt-oss-120b, Gemini: gemini-3.8-flash).",
  params: [
    { key: "prompt", label: "Prompt", type: "textarea", default: "Write a short motivational quote in Hinglish." },
    { key: "system", label: "System message", type: "textarea", default: "You are a helpful assistant. Keep answers short." },
    { key: "model", label: "Model " + CRED, type: "text", default: "" },
    { key: "temperature", label: "Temperature (0-2)", type: "number", default: 0.7 },
    { key: "maxTokens", label: "Max tokens", type: "number", default: 500 },
    { key: "baseUrl", label: "Base URL " + CRED, type: "text", default: "" },
    { key: "apiKey", label: "API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const out = [];
    const st = ctx.settings.ai || {};
    for (let i = 0; i < ctx.items.length; i++) {
      const base = s(ctx.p("baseUrl", i) || st.baseUrl || "http://localhost:8787/v1").replace(/\/+$/, "");
      const key = s(ctx.p("apiKey", i) || st.apiKey || "local");
      const pick = AIM.pickModel(base, s(ctx.p("model", i) || st.model));
      const model = pick.model;
      const badM = AIM.badModel(base, model);
      if (badM) throw new Error(badM);
      const messages = [];
      const sys = s(ctx.p("system", i));
      if (sys) messages.push({ role: "system", content: sys });
      messages.push({ role: "user", content: need(ctx.p("prompt", i), "Prompt") });
      const r = await http(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...pick.extra, model, messages, temperature: Number(ctx.raw.temperature ?? 0.7), max_tokens: Number(ctx.raw.maxTokens) || 500 }),
        timeoutMs: 120000,
      }).catch((e) => { throw new Error(`${e.message}. Is your AI server running? (FreeLLM-Router: start it first, or change Base URL on the Credentials page)`); });
      if (!r.ok) { const e = apiError("AI", r); const f = AIM.modelError(base, model, r.status, e.message.replace(/^AI answered \d+: /, "")); throw f ? new Error(f) : e; }
      const text = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message ? s(r.data.choices[0].message.content).trim() : "";
      out.push({ ...ctx.items[i], text, model: (r.data && r.data.model) || model, usage: (r.data && r.data.usage) || null });
    }
    return one(out);
  },
});

// ===== Social / messaging
def({
  type: "telegram", label: "Telegram", group: "Social & Messaging", icon: "telegram", color: "#0ea5e9",
  description: "Send text, photo, video or file to a chat, group or channel (@channelname — add your bot as admin).",
  params: [
    { key: "operation", label: "Send", type: "select", options: ["text", "photo", "video", "document"], default: "text" },
    { key: "text", label: "Text / caption", type: "textarea", default: "Hello from YantraFlow 🚀" },
    { key: "media", label: "Photo / video / file (URL or file path)", type: "text", default: "" },
    { key: "chatId", label: "Chat ID or @channel " + CRED, type: "text", default: "" },
    { key: "parseMode", label: "Formatting", type: "select", options: ["none", "HTML", "Markdown"], default: "none" },
    { key: "botToken", label: "Bot token " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const st = ctx.settings.telegram || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const token = need(ctx.p("botToken", i) || st.botToken, "Telegram bot token");
      const chatId = need(ctx.p("chatId", i) || st.chatId, "Telegram chat ID");
      const op = ctx.raw.operation || "text";
      let text = s(ctx.p("text", i));
      const pm = ctx.raw.parseMode && ctx.raw.parseMode !== "none" ? ctx.raw.parseMode : undefined;
      let r;
      if (op === "text") {
        if (text.length > 4096) text = text.slice(0, 4093) + "...";
        r = await http(`${API.telegram()}/bot${token}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: need(text, "Text"), parse_mode: pm }),
        });
      } else {
        const method = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" }[op];
        const media = need(ctx.p("media", i), "Media URL / file path");
        if (text.length > 1024) text = text.slice(0, 1021) + "...";
        if (/^https?:\/\//i.test(media)) {
          r = await http(`${API.telegram()}/bot${token}/${method}`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, [op]: media, caption: text || undefined, parse_mode: pm }),
          });
        } else {
          const file = resolvePath(ctx, media);
          const fd = new FormData();
          fd.append("chat_id", chatId);
          if (text) fd.append("caption", text);
          if (pm) fd.append("parse_mode", pm);
          fd.append(op, await fileBlob(file), path.basename(file));
          r = await http(`${API.telegram()}/bot${token}/${method}`, { method: "POST", body: fd, timeoutMs: 600000 });
        }
      }
      if (!r.ok || (r.data && r.data.ok === false)) throw apiError("Telegram", r);
      const m = r.data.result || {};
      out.push({ ...ctx.items[i], telegram: { ok: true, messageId: m.message_id, chat: m.chat && (m.chat.username || m.chat.id) } });
    }
    return one(out);
  },
});
def({
  type: "instagram", label: "Instagram Post", group: "Social & Messaging", icon: "instagram", color: "#e1306c",
  description: "Post a photo or Reel with the official Instagram Graph API. Needs a Business/Creator account + a PUBLIC media URL.",
  params: [
    { key: "kind", label: "Post type", type: "select", options: ["REELS", "IMAGE"], default: "REELS" },
    { key: "mediaUrl", label: "Public video / image URL", type: "text", default: "{{ $json.videoUrl }}" },
    { key: "caption", label: "Caption", type: "textarea", default: "{{ $json.text }}" },
    { key: "shareToFeed", label: "Also show Reel in feed", type: "boolean", default: true },
    { key: "userId", label: "Instagram user ID " + CRED, type: "text", default: "" },
    { key: "accessToken", label: "Access token " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const st = ctx.settings.instagram || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const uid = need(ctx.p("userId", i) || st.userId, "Instagram user ID");
      const token = need(ctx.p("accessToken", i) || st.accessToken, "Instagram access token");
      const url = need(ctx.p("mediaUrl", i), "Media URL");
      if (!/^https:\/\//i.test(url)) throw new Error("Instagram needs a PUBLIC https:// URL for the media (not a file on your phone). Upload it somewhere public first (e.g. your website, a CDN, Cloudinary free plan).");
      const kind = ctx.raw.kind || "REELS";
      const params = new URLSearchParams({ caption: s(ctx.p("caption", i)).slice(0, 2200), access_token: token });
      if (kind === "IMAGE") params.set("image_url", url);
      else { params.set("media_type", "REELS"); params.set("video_url", url); params.set("share_to_feed", String(ctx.raw.shareToFeed !== false && ctx.raw.shareToFeed !== "false")); }
      const c = await http(`${API.graph()}/${uid}/media`, { method: "POST", body: params });
      if (!c.ok) throw apiError("Instagram (create)", c);
      const creationId = c.data.id;
      // Videos are processed by Instagram first — wait until FINISHED (max ~5 min).
      for (let k = 0; k < 60; k++) {
        const st2 = await http(`${API.graph()}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
        const code = st2.data && st2.data.status_code;
        if (code === "FINISHED" || (kind === "IMAGE" && (!code || code === "FINISHED"))) break;
        if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram could not process the media: ${st2.data.status || code}`);
        if (k === 59) throw new Error("Instagram is still processing after 5 minutes — try again later");
        await sleep(Number(process.env.YANTRAFLOW_IG_POLL_MS || 5000));
      }
      const p = await http(`${API.graph()}/${uid}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: creationId, access_token: token }) });
      if (!p.ok) throw apiError("Instagram (publish)", p);
      out.push({ ...ctx.items[i], instagram: { ok: true, mediaId: p.data.id } });
    }
    return one(out);
  },
});
def({
  type: "facebook", label: "Facebook Page Post", group: "Social & Messaging", icon: "facebook", color: "#1877f2",
  description: "Post text/link, a photo URL or a video URL to your Facebook Page (Graph API).",
  params: [
    { key: "kind", label: "Post type", type: "select", options: ["text", "photo", "video"], default: "text" },
    { key: "message", label: "Text / caption", type: "textarea", default: "{{ $json.text }}" },
    { key: "link", label: "Link (text posts, optional)", type: "text", default: "" },
    { key: "mediaUrl", label: "Public photo / video URL", type: "text", default: "" },
    { key: "pageId", label: "Page ID " + CRED, type: "text", default: "" },
    { key: "pageToken", label: "Page access token " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const st = ctx.settings.facebook || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const pid = need(ctx.p("pageId", i) || st.pageId, "Facebook Page ID");
      const token = need(ctx.p("pageToken", i) || st.pageToken, "Facebook Page token");
      const kind = ctx.raw.kind || "text";
      const msg = s(ctx.p("message", i));
      const body = new URLSearchParams({ access_token: token });
      let edge = "feed";
      if (kind === "text") { body.set("message", need(msg, "Text")); const l = s(ctx.p("link", i)); if (l) body.set("link", l); }
      else if (kind === "photo") { edge = "photos"; body.set("url", need(ctx.p("mediaUrl", i), "Photo URL")); if (msg) body.set("caption", msg); }
      else { edge = "videos"; body.set("file_url", need(ctx.p("mediaUrl", i), "Video URL")); if (msg) body.set("description", msg); }
      const r = await http(`${API.graph()}/${pid}/${edge}`, { method: "POST", body });
      if (!r.ok) throw apiError("Facebook", r);
      out.push({ ...ctx.items[i], facebook: { ok: true, id: r.data.post_id || r.data.id } });
    }
    return one(out);
  },
});
def({
  type: "youtube", fullOnly: "YouTube upload reads a video file from disk — use the full version.", label: "YouTube Upload", group: "Social & Messaging", icon: "youtube", color: "#ff0033",
  description: "Upload a video file from this phone/PC to your channel (YouTube Data API v3).",
  params: [
    { key: "file", label: "Video file path", type: "text", default: "{{ $json.path }}" },
    { key: "title", label: "Title", type: "text", default: "{{ $json.title }}" },
    { key: "description", label: "Description", type: "textarea", default: "{{ $json.description }}" },
    { key: "tags", label: "Tags (comma separated)", type: "text", default: "{{ $json.tags }}" },
    { key: "privacy", label: "Privacy", type: "select", options: ["private", "unlisted", "public"], default: "private" },
    { key: "categoryId", label: "Category ID (22 = People & Blogs, 24 = Entertainment, 27 = Education)", type: "text", default: "22" },
  ],
  async run(ctx) {
    const st = ctx.settings.youtube || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const file = resolvePath(ctx, need(ctx.p("file", i), "Video file path"));
      const stat = await fsp.stat(file).catch(() => null);
      if (!stat) throw new Error(`Video file not found: ${file}`);
      const tok = await http(API.googleToken(), {
        method: "POST",
        body: new URLSearchParams({ client_id: need(st.clientId, "YouTube client ID"), client_secret: need(st.clientSecret, "YouTube client secret"), refresh_token: need(st.refreshToken, "YouTube refresh token"), grant_type: "refresh_token" }),
      });
      if (!tok.ok || !tok.data.access_token) throw apiError("Google login", tok);
      let tags = ctx.p("tags", i);
      tags = Array.isArray(tags) ? tags : s(tags).split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
      const meta = {
        snippet: { title: need(ctx.p("title", i), "Title").slice(0, 100), description: s(ctx.p("description", i)).slice(0, 5000), tags: tags.slice(0, 30), categoryId: s(ctx.raw.categoryId || "22") },
        status: { privacyStatus: ctx.raw.privacy || "private", selfDeclaredMadeForKids: false },
      };
      const init = await fetch(`${API.youtubeUpload()}?uploadType=resumable&part=snippet,status`, {
        method: "POST",
        headers: { authorization: `Bearer ${tok.data.access_token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/*", "x-upload-content-length": String(stat.size) },
        body: JSON.stringify(meta),
      });
      if (!init.ok) throw apiError("YouTube (start upload)", { status: init.status, data: await init.text().then((t) => { try { return JSON.parse(t); } catch (_) { return t; } }) });
      const uploadUrl = init.headers.get("location");
      if (!uploadUrl) throw new Error("YouTube did not return an upload URL");
      const up = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "video/*", "content-length": String(stat.size) }, body: fs.createReadStream(file), duplex: "half" });
      const txt = await up.text();
      let data; try { data = JSON.parse(txt); } catch (_) { data = txt; }
      if (!up.ok) throw apiError("YouTube (upload)", { status: up.status, data });
      out.push({ ...ctx.items[i], youtube: { ok: true, videoId: data.id, url: `https://youtu.be/${data.id}`, privacy: meta.status.privacyStatus } });
    }
    return one(out);
  },
});
def({
  type: "xPost", fullOnly: "X blocks browser calls (CORS) — use the full version.", label: "X (Twitter) Post", group: "Social & Messaging", icon: "x", color: "#64748b",
  description: "Post a text tweet with the X API v2 (your own developer app keys).",
  params: [{ key: "text", label: "Tweet text (max 280)", type: "textarea", default: "{{ $json.text }}" }],
  async run(ctx) {
    const st = ctx.settings.x || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const url = `${API.x()}/2/tweets`;
      const auth = oauth1Header({ method: "POST", url, consumerKey: need(st.apiKey, "X API key"), consumerSecret: need(st.apiSecret, "X API secret"), token: need(st.accessToken, "X access token"), tokenSecret: need(st.accessSecret, "X access token secret") });
      const r = await http(url, { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ text: need(ctx.p("text", i), "Tweet text").slice(0, 280) }) });
      if (!r.ok) throw apiError("X", r);
      out.push({ ...ctx.items[i], x: { ok: true, id: r.data.data && r.data.data.id } });
    }
    return one(out);
  },
});
def({
  type: "discord", label: "Discord", group: "Social & Messaging", icon: "discord", color: "#5865f2",
  description: "Send a message to a Discord channel webhook.",
  params: [
    { key: "webhookUrl", label: "Webhook URL " + CRED, type: "secret", default: "" },
    { key: "content", label: "Message", type: "textarea", default: "{{ $json.text }}" },
    { key: "username", label: "Bot name", type: "text", default: "YantraFlow" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const url = need(ctx.p("webhookUrl", i) || (ctx.settings.discord || {}).webhookUrl, "Discord webhook URL");
      const r = await http(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: need(ctx.p("content", i), "Message").slice(0, 2000), username: ctx.p("username", i) || undefined }) });
      if (!r.ok) throw apiError("Discord", r);
      out.push({ ...ctx.items[i], discord: { ok: true } });
    }
    return one(out);
  },
});
def({
  type: "slack", fullOnly: "Slack blocks browser calls (CORS) — use the full version.", label: "Slack", group: "Social & Messaging", icon: "slack", color: "#4a154b",
  description: "Send a message to Slack (Incoming Webhook).",
  params: [
    { key: "webhookUrl", label: "Webhook URL " + CRED, type: "secret", default: "" },
    { key: "text", label: "Message", type: "textarea", default: "{{ $json.text }}" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const url = need(ctx.p("webhookUrl", i) || (ctx.settings.slack || {}).webhookUrl, "Slack webhook URL");
      const r = await http(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: need(ctx.p("text", i), "Message") }) });
      if (!r.ok) throw apiError("Slack", r);
      out.push({ ...ctx.items[i], slack: { ok: true } });
    }
    return one(out);
  },
});
def({
  type: "email", fullOnly: "Browsers cannot send SMTP email — use the full version.", label: "Email (SMTP)", group: "Social & Messaging", icon: "mail", color: "#14b8a6",
  description: "Send an email with your SMTP account (Gmail: use an App Password).",
  params: [
    { key: "to", label: "To (comma separated)", type: "text", default: "" },
    { key: "subject", label: "Subject", type: "text", default: "YantraFlow report {{ $today }}" },
    { key: "body", label: "Message", type: "textarea", default: "{{ $json.text }}" },
    { key: "html", label: "Send as HTML", type: "boolean", default: false },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const body = s(ctx.p("body", i));
      const isHtml = ctx.raw.html === true || ctx.raw.html === "true";
      const r = await sendMail(ctx.settings.smtp || {}, { to: ctx.p("to", i), subject: ctx.p("subject", i), text: isHtml ? undefined : body, html: isHtml ? body : undefined });
      out.push({ ...ctx.items[i], email: r });
    }
    return one(out);
  },
});

// ===== Data
def({
  type: "rss", label: "RSS Read", group: "Data", icon: "rss", color: "#ec4899",
  description: "Read a news/blog/YouTube RSS feed. Each post becomes one item.",
  params: [
    { key: "url", label: "Feed URL", type: "text", default: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en" },
    { key: "max", label: "Max items", type: "number", default: 5 },
  ],
  async run(ctx) {
    const url = need(ctx.p("url"), "Feed URL");
    const r = await http(url, { headers: { "user-agent": "YantraFlow RSS" } });
    if (!r.ok) throw apiError("RSS", r);
    const feed = parseFeed(typeof r.data === "string" ? r.data : JSON.stringify(r.data));
    const n = Number(ctx.raw.max) || 5;
    return one(feed.items.slice(0, n).map((it) => ({ ...it, feedTitle: feed.title })));
  },
});
def({
  type: "readSheet", label: "Read Sheet / CSV", group: "Data", icon: "file-spreadsheet", color: "#ec4899",
  description: "Read all rows from a Google Sheet CSV link or a .csv file. Each row = one item.",
  params: [
    { key: "source", label: "CSV link or file path", type: "text", default: "posts.csv" },
    { key: "max", label: "Max rows (0 = all)", type: "number", default: 0 },
  ],
  async run(ctx) {
    let rows = await readCsvSource(ctx, ctx.p("source"));
    const n = Number(ctx.raw.max) || 0;
    if (n > 0) rows = rows.slice(0, n);
    return one(rows);
  },
});
def({
  type: "writeFile", fullOnly: "Browsers cannot write files on disk — use the full version.", label: "Write File / Log", group: "Data", icon: "file-pen", color: "#ec4899",
  description: "Save text or JSON to a file (relative paths go to data/files).",
  params: [
    { key: "path", label: "File path", type: "text", default: "log.txt" },
    { key: "content", label: "Content", type: "textarea", default: "{{ $now }} {{ $json.text }}" },
    { key: "mode", label: "Mode", type: "select", options: ["append", "overwrite"], default: "append" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const file = resolvePath(ctx, ctx.p("path", i));
      let content = ctx.p("content", i);
      if (typeof content === "object") content = JSON.stringify(content, null, 2);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      if (ctx.raw.mode === "overwrite") await fsp.writeFile(file, s(content));
      else await fsp.appendFile(file, s(content) + "\n");
      out.push({ ...ctx.items[i], file });
    }
    return one(out);
  },
});
def({
  type: "log", label: "Log", group: "Data", icon: "scroll-text", color: "#ec4899",
  description: "Write a line into the run log (see Executions).",
  params: [{ key: "message", label: "Message", type: "text", default: "Got: {{ $json }}" }],
  async run(ctx) {
    ctx.items.forEach((_, i) => ctx.log(s(ctx.p("message", i))));
    return one(ctx.items);
  },
});
def({
  type: "respondWebhook", fullOnly: "Only useful with Webhook — full version.", label: "Respond to Webhook", group: "Data", icon: "reply", color: "#ec4899",
  description: "Choose what the Webhook caller gets back.",
  params: [
    { key: "body", label: "Response body (JSON or text)", type: "textarea", default: "{\"reply\": \"{{ $json.text }}\"}" },
    { key: "status", label: "Status code", type: "number", default: 200 },
  ],
  async run(ctx) {
    let body = ctx.p("body", 0);
    if (typeof body === "string" && /^\s*[[{]/.test(body)) { try { body = JSON.parse(body); } catch (_) { /* keep text */ } }
    ctx.respond({ status: Number(ctx.raw.status) || 200, body });
    return one(ctx.items);
  },
});

const BY_TYPE = Object.fromEntries(NODES.map((n) => [n.type, n]));
function publicNodeList() {
  return NODES.map(({ run, poll, pollEverySeconds, ...meta }) => meta);
}
module.exports = { NODES, BY_TYPE, publicNodeList, testCondition, API };

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
const LP = require("../public/js/link-preview.js");
const YC = require("../public/js/content-gen.js");
const YV = require("../public/js/video-core.js");
const VM = require("./video");

// API base URLs (overridable with env vars — handy for tests or proxies).
const API = {
  telegram: () => process.env.YANTRAFLOW_TELEGRAM_API || "https://api.telegram.org",
  graph: () => process.env.YANTRAFLOW_GRAPH_API || "https://graph.facebook.com/v21.0",
  googleToken: () => process.env.YANTRAFLOW_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  youtubeUpload: () => process.env.YANTRAFLOW_YOUTUBE_UPLOAD || "https://www.googleapis.com/upload/youtube/v3/videos",
  x: () => process.env.YANTRAFLOW_X_API || "https://api.twitter.com",
  linkedin: () => process.env.YANTRAFLOW_LINKEDIN_API || "https://api.linkedin.com",
  rupload: () => process.env.YANTRAFLOW_RUPLOAD_API || "https://rupload.facebook.com/ig-api-upload/v21.0",
  youtubeData: () => process.env.YANTRAFLOW_YOUTUBE_API || "https://www.googleapis.com/youtube/v3",
  pexels: () => process.env.YANTRAFLOW_PEXELS_API || "https://api.pexels.com",
  pixabay: () => process.env.YANTRAFLOW_PIXABAY_API || "https://pixabay.com",
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


// ---- v4 helpers: downloads, link previews, Telegram upload, AI, small JSON stores
const BROWSER_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const BOT_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "application/pdf": ".pdf", "audio/mpeg": ".mp3" };
async function download(url, maxBytes = 50 * 1024 * 1024) {
  let res;
  try { res = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(180000) }); }
  catch (e) { throw new Error(`Could not download ${url}: ${(e.cause && e.cause.message) || e.message}`); }
  if (!res.ok) throw new Error(`Could not download ${url}: the site answered ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error(`File is too big (${Math.round(len / 1048576)} MB, limit ${Math.round(maxBytes / 1048576)} MB)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`File is too big (${Math.round(buf.length / 1048576)} MB)`);
  const type = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (/text\/html/.test(type)) throw new Error(`${url} is a web page, not a photo/video file. Use the "link preview" option for pages.`);
  let name = "file";
  try { name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "file"); } catch (_) { /* */ }
  if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += EXT[type] || "";
  return { buf, type, name: name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file" };
}
async function fetchHtml(url, ua) {
  const res = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-IN,en;q=0.9,hi;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  const type = res.headers.get("content-type") || "";
  if (/^image\//i.test(type)) return { imageOnly: true, url: res.url || url };
  const text = (await res.text()).slice(0, 1500000);
  return { status: res.status, html: text, url: res.url || url };
}
/* Read any link's preview (title, description, image) like Telegram/WhatsApp do. */
async function getPreview(url) {
  url = s(url).trim();
  if (!url) throw new Error("Link is empty");
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let best = null; let lastErr = "";
  for (const ua of [BROWSER_UA, BOT_UA]) {
    try {
      const r = await fetchHtml(url, ua);
      if (r.imageOnly) return { url, canonicalUrl: url, title: "", description: "", image: url, siteName: "", type: "image", video: "" };
      const p = LP.parse(r.html, url);
      if (!best || (p.title && !best.title) || (p.image && !best.image)) best = p;
      if (p.title && p.image) break;
    } catch (e) { lastErr = (e.cause && e.cause.message) || e.message; }
  }
  const yt = LP.youtubeId(url);
  if (yt && (!best || !best.title || /^\s*-?\s*YouTube\s*$/i.test(best.title))) {
    try {
      const o = await http(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { timeoutMs: 15000 });
      if (o.ok && o.data && o.data.title) best = Object.assign(best || {}, { url, title: o.data.title, siteName: "YouTube", description: (best && best.description && !/^Enjoy the videos and music you love/i.test(best.description) ? best.description : "") || (o.data.author_name ? `by ${o.data.author_name}` : ""), image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` });
    } catch (_) { /* */ }
  }
  if (LP.looksEmpty(best)) throw new Error(`Is link ka preview nahi mila — site ne block kiya ya login maangti hai${lastErr ? ` (${lastErr})` : ""}. Link: ${url}`);
  return best;
}
async function tgCall(token, method, fields, file) {
  const url = `${API.telegram()}/bot${token}/${method}`;
  let r;
  if (file) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    fd.append(file.field, new Blob([file.buf], { type: file.type || "application/octet-stream" }), file.name || "file");
    r = await http(url, { method: "POST", body: fd, timeoutMs: 600000 });
  } else {
    r = await http(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
  }
  return r;
}
const tgOk = (r) => r.ok && !(r.data && r.data.ok === false);
const tgDesc = (r) => s(r.data && (r.data.description || r.data.error)) || s(r.data);
/* Send photo/video/document by URL; if Telegram can't fetch the URL itself, download it here and upload the bytes. */
async function tgMedia(token, op, fields, media, mode) {
  const method = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" }[op];
  let r = null;
  if (mode !== "upload") {
    r = await tgCall(token, method, { ...fields, [op]: media });
    if (tgOk(r)) return { r, via: "url" };
    if (mode === "url" || !(r.status === 400 && LP.TG_URL_FAIL.test(tgDesc(r)))) return { r, via: "url" };
  }
  const f = await download(media, op === "photo" ? 10 * 1024 * 1024 : 50 * 1024 * 1024);
  let field = op; let m = method;
  if (op === "photo" && !/^image\/(jpeg|png|webp)$/.test(f.type)) { field = "document"; m = "sendDocument"; }
  r = await tgCall(token, m, fields, { field, buf: f.buf, type: f.type, name: f.name });
  return { r, via: "upload" };
}
async function aiComplete(ctx, i, messages, opt = {}) {
  const st = ctx.settings.ai || {};
  const base = s(ctx.p("baseUrl", i) || st.baseUrl || "http://localhost:8787/v1").replace(/\/+$/, "");
  const key = s(ctx.p("apiKey", i) || st.apiKey || "local");
  const pick = AIM.pickModel(base, s(ctx.p("model", i) || st.model));
  const badM = AIM.badModel(base, pick.model);
  if (badM) throw new Error(badM);
  const r = await http(`${base}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...pick.extra, model: pick.model, messages, temperature: opt.temperature ?? 0.9, max_tokens: opt.maxTokens || 900 }), timeoutMs: 120000,
  }).catch((e) => { throw new Error(`${e.message}. Is your AI server running? (set AI Base URL + key on the Keys page)`); });
  if (!r.ok) { const e = apiError("AI", r); const f = AIM.modelError(base, pick.model, r.status, e.message.replace(/^AI answered \d+: /, "")); throw f ? new Error(f) : e; }
  const c = r.data && r.data.choices && r.data.choices[0];
  return { text: s(c && c.message && c.message.content).trim(), model: (r.data && r.data.model) || pick.model };
}
function jsonFile(ctx, name) {
  const dir = ctx.dataDir || path.join(ctx.filesDir || ".", "..");
  const file = path.join(dir, name);
  return {
    read() { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return {}; } },
    write(o) { fs.mkdirSync(dir, { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(o, null, 2)); fs.renameSync(tmp, file); },
  };
}

// ------------------------------------------------------------------ nodes
const NODES = [];
const def = (d) => { NODES.push(Object.assign({ inputs: 1, outputs: 1, params: [] }, d)); };
const CRED = "(blank = use Keys page)";

// ===== Triggers
def({
  type: "manualTrigger", label: "Manual Trigger", group: "Trigger", icon: "play", color: "#22c55e", inputs: 0, trigger: "manual",
  description: "Starts when you press Run.",
  params: [{ key: "testData", label: "Test data (JSON, optional)", type: "json", default: "{}" }],
  async run(ctx) {
    let d = {};
    try { d = JSON.parse(ctx.raw.testData || "{}"); } catch (_) { throw new Error("Test data is not valid JSON"); }
    return one(Array.isArray(d) ? d : [d]);
  },
});
def({
  type: "scheduleTrigger", label: "Schedule", group: "Trigger", icon: "clock", color: "#22c55e", inputs: 0, trigger: "schedule",
  description: "Runs on a timer or cron while the workflow is Active.",
  params: [
    { key: "mode", label: "Mode", type: "select", options: ["interval", "cron"], default: "interval" },
    { key: "minutes", label: "Every N minutes (interval mode)", type: "number", default: 60 },
    { key: "cron", label: "Cron (cron mode)", type: "text", default: "0 9 * * *", help: "minute hour day month weekday — e.g. 0 9 * * * = every day 9:00, */15 * * * * = every 15 min, 30 18 * * 1-5 = weekdays 6:30 PM" },
  ],
  async run(ctx) { return one([{ firedAt: new Date().toISOString() }]); },
});
def({
  type: "webhookTrigger", fullOnly: "Webhooks need a server — use the full version on PC/Termux.", label: "Webhook", group: "Trigger", icon: "webhook", color: "#22c55e", inputs: 0, trigger: "webhook",
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
  type: "folderTrigger", fullOnly: "Browsers cannot watch folders — use the full version.", label: "Folder Watch", group: "Trigger", icon: "folder-search", color: "#22c55e", inputs: 0, trigger: "poll",
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
  type: "sheetTrigger", label: "Sheet / CSV New Row", group: "Trigger", icon: "googlesheets", color: "#22c55e", inputs: 0, trigger: "poll",
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
  type: "if", label: "IF", group: "Flow", icon: "split", color: "#a855f7", outputs: 2, outputLabels: ["true", "false"],
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
  type: "switch", label: "Switch", group: "Flow", icon: "route", color: "#a855f7", outputs: 4, outputLabels: ["1", "2", "3", "else"],
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
  type: "delay", label: "Wait / Delay", group: "Core", icon: "timer", color: "#a855f7",
  description: "Thoda ruko, phir aage badho (rate limit se bachne ke liye bhi).",
  params: [{ key: "seconds", label: "Seconds", type: "number", default: 5 }],
  async run(ctx) { await sleep(Math.min(Number(ctx.p("seconds")) || 0, 3600) * 1000); return one(ctx.items); },
});
def({
  type: "filter", label: "Limit / Filter", group: "Flow", icon: "funnel", color: "#a855f7",
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
    { key: "timeGreeting", label: "Time greeting + unique message", type: "select", options: ["off", "on"], default: "off", help: "on = message time ke hisaab se shuru: Good Morning (5-12) / Afternoon (12-17) / Evening (17-21) / Night (21-5), India time. Har run naya message, pichhle messages repeat nahi. Auto-message projects me ON hai." },
  ],
  async run(ctx) {
    const out = [];
    const st = ctx.settings.ai || {};
    const greetOn = ctx.raw.timeGreeting === "on";
    const hstore = greetOn ? jsonFile(ctx, "post-history.json") : null;
    const hall = hstore ? hstore.read() : {};
    const hkey = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${(ctx.node && ctx.node.id) || "n"}`;
    const hrec = hall[hkey] || { posts: [] };
    for (let i = 0; i < ctx.items.length; i++) {
      const base = s(ctx.p("baseUrl", i) || st.baseUrl || "http://localhost:8787/v1").replace(/\/+$/, "");
      const key = s(ctx.p("apiKey", i) || st.apiKey || "local");
      const pick = AIM.pickModel(base, s(ctx.p("model", i) || st.model));
      const model = pick.model;
      const badM = AIM.badModel(base, model);
      if (badM) throw new Error(badM);
      const messages = [];
      const greet = greetOn ? YC.greetingFor(hrec.posts) : null;
      const sys = [s(ctx.p("system", i)), greetOn ? YC.greetingSystem(greet, hrec.posts) : ""].filter(Boolean).join("\n");
      if (sys) messages.push({ role: "system", content: sys });
      messages.push({ role: "user", content: need(ctx.p("prompt", i), "Prompt") });
      const r = await http(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...pick.extra, model, messages, temperature: Number(ctx.raw.temperature ?? 0.7), max_tokens: Number(ctx.raw.maxTokens) || 500 }),
        timeoutMs: 120000,
      }).catch((e) => { throw new Error(`${e.message}. Is your AI server running? (FreeLLM-Router: start it first, or change Base URL on the Credentials page)`); });
      if (!r.ok) { const e = apiError("AI", r); const f = AIM.modelError(base, model, r.status, e.message.replace(/^AI answered \d+: /, "")); throw f ? new Error(f) : e; }
      let text = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message ? s(r.data.choices[0].message.content).trim() : "";
      if (greet && text) { text = YC.ensureGreeting(text, greet.slot, greet); hrec.posts = YC.pushHistory(hrec.posts, { text, at: new Date().toISOString() }, 20); }
      out.push({ ...ctx.items[i], text, model: (r.data && r.data.model) || model, usage: (r.data && r.data.usage) || null, ...(greet ? { timeOfDay: greet.slot } : {}) });
    }
    if (hstore) { hall[hkey] = hrec; hstore.write(hall); }
    return one(out);
  },
});

def({
  type: "aiPost", label: "AI Post Writer (seed)", group: "AI", icon: "sprout", color: "#22c55e",
  description: "Writes a NEW post every run for Telegram / Instagram / X / LinkedIn / YouTube from your SEED document. Remembers the last posts so it never repeats.",
  params: [
    { key: "platform", label: "Platform", type: "select", options: ["telegram", "instagram", "x", "linkedin", "youtube", "video"], default: "telegram", help: "video = Shorts/Reels: title + caption + description + hashtags + first comment (Daily video project)." },
    { key: "autoGenerate", label: "Auto message generate", type: "select", options: ["on", "off"], default: "on", help: "on = har run pe AI naya, alag message banayega. off = neeche wala fixed message hi bhejega." },
    { key: "timeGreeting", label: "Time greeting", type: "select", options: ["on", "off"], default: "on", help: "on = post time ke hisaab se shuru hoga: Good Morning (5-12), Good Afternoon (12-17), Good Evening (17-21), Good Night (21-5), India time. Har baar alag wording, repeat nahi." },
    { key: "seed", label: "SEED document (brand info, topics, style)", type: "textarea", upload: true, default: "", placeholder: "Apne brand / channel ke baare me likho: kya karte ho, topics, links, kaisi language, kya NAHI bolna..." },
    { key: "topic", label: "Topic / instruction (optional)", type: "text", default: "", placeholder: "khaali = AI seed se naya topic chunega" },
    { key: "language", label: "Language", type: "select", options: ["Hinglish", "Hindi", "English"], default: "Hinglish" },
    { key: "tone", label: "Tone", type: "text", default: "friendly, useful, energetic" },
    { key: "fixedText", label: "Fixed message (when auto = off)", type: "textarea", default: "" },
    { key: "mediaList", label: "Photos / videos to rotate (optional, one link or file path per line)", type: "textarea", default: "", help: "Har run me agla item -> {{ $json.media }}. Instagram/YouTube ke liye zaroori." },
    { key: "history", label: "Remember last N posts (no repeat)", type: "number", default: 20 },
    { key: "model", label: "Model " + CRED, type: "text", default: "" },
    { key: "baseUrl", label: "Base URL " + CRED, type: "text", default: "" },
    { key: "apiKey", label: "API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const store = jsonFile(ctx, "post-history.json");
    const all = store.read();
    const key = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${ctx.node.id}`;
    const rec = all[key] || { posts: [], mediaIndex: 0 };
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const platform = ctx.raw.platform || "telegram";
      const lang = { Hinglish: "Hinglish (Hindi in English letters, simple words)", Hindi: "Hindi (Devanagari)", English: "simple English" }[ctx.raw.language] || ctx.raw.language;
      let res; let similarity = 0; let tries = 0;
      const greeting = (ctx.raw.timeGreeting || "on") !== "off" ? Object.assign(YC.timeOfDay(new Date(), "Asia/Kolkata"), YC.pickGreeting(YC.timeOfDay(new Date(), "Asia/Kolkata").slot, rec.posts, Date.now())) : null;
      if ((ctx.raw.autoGenerate || "on") === "off") {
        res = { text: need(ctx.p("fixedText", i), "Fixed message") };
      } else {
        let avoid = "";
        for (tries = 1; tries <= 2; tries++) {
          const msgs = YC.buildMessages({ platform, seed: ctx.p("seed", i), topic: s(ctx.p("topic", i)), language: lang, tone: s(ctx.p("tone", i)), history: rec.posts, avoid, greeting });
          const ai = await aiComplete(ctx, i, msgs, { temperature: tries === 1 ? 0.9 : 1.1, maxTokens: platform === "x" ? 300 : 1200 });
          res = YC.parseOutput(platform, ai.text); res.model = ai.model;
          if (greeting && platform !== "youtube") res.text = YC.ensureGreeting(res.text, greeting.slot, greeting);
          similarity = YC.maxSimilarity(res.text, rec.posts);
          if (!res.text) throw new Error("AI ne khaali jawab diya — Keys page pe AI model check karo");
          if (similarity < YC.REPEAT_LIMIT) break;
          avoid = res.text;
        }
      }
      const pm = YC.pickMedia(ctx.p("mediaList", i), rec.mediaIndex);
      if (pm.total) rec.mediaIndex = pm.index + 1;
      rec.posts = YC.pushHistory(rec.posts, { text: res.text, at: new Date().toISOString() }, Number(ctx.raw.history) || 20);
      const credit = s(ctx.items[i].credit);
      if (credit && res.text && platform !== "x") { res.description = YV.addCredit(res.description || "", credit); if (platform !== "youtube") res.text = YV.addCredit(res.text, credit); }
      if (platform === "video") res.caption = res.text;
      out.push({ ...ctx.items[i], ...res, platform, topicUsed: s(ctx.p("topic", i)), timeOfDay: greeting ? greeting.slot : "", media: pm.media || ctx.items[i].media || "", seedUsed: !!s(ctx.p("seed", i)).trim(), repeatCheck: { similarity, tries, remembered: rec.posts.length } });
    }
    all[key] = rec; store.write(all);
    return one(out);
  },
});

// ===== Video: free-licence finder, Auto Video Maker, Video Editor (v4.3)
async function stockSearch(ctx, q, src, orientation) {
  const P = (ctx.settings.pexels || {}).apiKey; const X = (ctx.settings.pixabay || {}).apiKey;
  const pk = s(ctx.p("pexelsKey", 0) || P).trim(); const xk = s(ctx.p("pixabayKey", 0) || X).trim();
  const list = []; const errs = [];
  if ((src === "auto" || src === "pexels") && pk) {
    const page = 1 + Math.floor(Math.random() * 3);
    const r = await http(`${API.pexels()}/videos/search?query=${encodeURIComponent(q)}&per_page=40&page=${page}${orientation === "portrait" ? "&orientation=portrait" : ""}`, { headers: { authorization: pk }, timeoutMs: 30000 }).catch((e) => ({ ok: false, status: 0, data: e.message }));
    if (r.ok) list.push(...YV.normalizePexels(r.data)); else errs.push(apiError("Pexels", r).message);
  }
  if ((src === "auto" || src === "pixabay") && xk) {
    const r = await http(`${API.pixabay()}/api/videos/?key=${encodeURIComponent(xk)}&q=${encodeURIComponent(q.slice(0, 100))}&per_page=50&safesearch=true`, { timeoutMs: 30000 }).catch((e) => ({ ok: false, status: 0, data: e.message }));
    if (r.ok) list.push(...YV.normalizePixabay(r.data)); else errs.push(apiError("Pixabay", r).message);
  }
  if (!pk && !xk && src !== "own") errs.push("Pexels / Pixabay key nahi hai — Keys page pe free key daalo (2 min ka kaam)");
  return { list, errs };
}
async function saveDownload(ctx, url, prefix) {
  const f = await download(url, 200 * 1024 * 1024);
  const dir = path.join(ctx.filesDir || ".", "videos"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${prefix}-${Date.now()}${path.extname(f.name) || ".mp4"}`);
  fs.writeFileSync(file, f.buf);
  return file;
}
def({
  type: "stockVideo", label: "Free Video Finder (Pexels / Pixabay)", group: "Media", icon: "film", color: "#14b8a6",
  description: "Topic do (funny, cats, memes...) -> har run ek NAYA free-licence short video dhundhta hai (Pexels / Pixabay — repost allowed) ya tumhare apne clips. Credit line apne aap. Copyright strike se bachne ke liye dusron ke Pinterest/Insta/YouTube videos nahi uthata.",
  params: [
    { key: "topic", label: "Topic", type: "text", default: "funny animals", placeholder: "funny, cats, memes, baarish, gym..." },
    { key: "source", label: "Source", type: "select", options: ["auto", "pexels", "pixabay", "own"], default: "auto", help: "auto = Pexels + Pixabay (jiski key ho). own = sirf neeche wale tumhare apne clips." },
    { key: "ownClips", label: "My own clips (one link or file path per line)", type: "textarea", default: "", help: "Apne banaye / license wale clips. auto me tab use honge jab Pexels/Pixabay kuch na de." },
    { key: "orientation", label: "Shape", type: "select", options: ["portrait", "any"], default: "portrait" },
    { key: "minSeconds", label: "Min seconds", type: "number", default: 5 },
    { key: "maxSeconds", label: "Max seconds", type: "number", default: 60 },
    { key: "fallback", label: "Kuch na mile to", type: "select", options: ["maker", "error"], default: "maker", help: "maker = agle Auto Video Maker step se slide video ban jayegi." },
    { key: "download", label: "Download file (PC/Termux)", type: "select", options: ["on", "off"], default: "on", help: "YouTube upload + editing ke liye file chahiye." },
    { key: "pexelsKey", label: "Pexels API key " + CRED, type: "secret", default: "" },
    { key: "pixabayKey", label: "Pixabay API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const store = jsonFile(ctx, "video-history.json"); const all = store.read();
    const key = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${ctx.node.id}`;
    const rec = all[key] || { used: [] };
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const topic = s(ctx.p("topic", i)).trim() || "funny animals"; const q = YV.stockQuery(topic);
      const src = ctx.raw.source || "auto";
      const opt = { used: rec.used, minSeconds: Number(ctx.raw.minSeconds) || 0, maxSeconds: Number(ctx.raw.maxSeconds) || 60, orientation: ctx.raw.orientation || "portrait" };
      const found = src === "own" ? { list: [], errs: [] } : await stockSearch(ctx, q, src, opt.orientation);
      let clip = YV.pickClip(found.list, opt);
      if (!clip && found.list.length && rec.used.length) { rec.used = []; clip = YV.pickClip(found.list, Object.assign(opt, { used: [] })); }
      if (!clip) { const own = YV.ownClips(ctx.p("ownClips", i)); clip = YV.pickClip(own, Object.assign(opt, { minSeconds: 0, orientation: "any" })) || (own.length ? own[0] : null); }
      if (!clip) {
        const why = found.errs.join(" · ") || `"${q}" ke liye koi naya video nahi mila`;
        if ((ctx.raw.fallback || "maker") === "error") throw new Error(why);
        ctx.log(`No free video found (${why}) — Auto Video Maker will make one`);
        out.push({ ...ctx.items[i], topic, query: q, media: "", needsMaker: true, videoSource: "none", fallbackReason: why });
        continue;
      }
      let media = clip.url;
      if (/^https?:\/\//i.test(clip.url) && (ctx.raw.download || "on") === "on") media = await saveDownload(ctx, clip.url, clip.id.replace(/[^a-z0-9]+/gi, "-"));
      rec.used = rec.used.concat([clip.id]).slice(-300);
      const credit = YV.creditLine(clip);
      out.push({ ...ctx.items[i], topic, query: q, media, path: /^https?:/i.test(media) ? "" : media, videoUrl: /^https:\/\//i.test(clip.url) ? clip.url : "", credit, videoSource: clip.source,
        videoInfo: [clip.tags, clip.author && `by ${clip.author}`].filter(Boolean).join(", "), clip: { id: clip.id, page: clip.pageUrl, author: clip.author, license: clip.license, seconds: clip.duration, width: clip.width, height: clip.height } });
    }
    all[key] = rec; store.write(all);
    return one(out);
  },
});
const VIDEO_PARAMS = [
  { key: "voice", label: "AI voice (PC/Termux)", type: "select", options: ["off", "auto", "edge", "espeak"], default: "off", help: "edge = free natural voice (pip install edge-tts, internet). espeak = offline robotic. Website pe voice nahi lagti (browser limit)." },
  { key: "voiceLang", label: "Voice language", type: "select", options: ["Hinglish", "Hindi", "English"], default: "Hinglish" },
  { key: "music", label: "Music", type: "select", options: ["generated", "file", "off"], default: "generated", help: "generated = YantraFlow khud soft royalty-free music banata hai. file = apni music (link ya file path) neeche." },
  { key: "musicFile", label: "Music file / link (royalty-free)", type: "text", default: "" },
  { key: "theme", label: "Style", type: "select", options: ["bold", "neon", "sunset", "clean"], default: "bold" },
  { key: "watermark", label: "Watermark / handle", type: "text", default: "", placeholder: "@mychannel" },
];
def({
  type: "imageMaker", label: "Post Photo Maker (quote / post card)", group: "Media", icon: "image-plus", color: "#ec4899",
  description: "Har run khud post photo banata hai: tumhara text + brand colours, 1080x1350 (Insta feed) / 1080x1920 (Story) / 1080x1080. Background: gradient ya free stock photo (Pexels/Pixabay key ho to). Website = browser me PNG, PC/Termux = ffmpeg PNG.",
  params: [
    { key: "text", label: "Photo text", type: "textarea", default: "{{ $json.quote || $json.caption || $json.text }}", help: "Hashtags / links / emoji apne aap hat jaate hain. Chhota text = bada font." },
    { key: "title", label: "Upar chhota title (optional)", type: "text", default: "{{ $json.greeting || '' }}" },
    { key: "size", label: "Size", type: "select", options: ["1080x1350", "1080x1920", "1080x1080"], default: "1080x1350" },
    { key: "style", label: "Style", type: "select", options: ["gradient", "photo", "dark", "light"], default: "gradient", help: "photo = Pexels/Pixabay se free photo background (key chahiye; na mile to gradient)." },
    { key: "color1", label: "Brand colour 1", type: "text", default: "#7c5cff", placeholder: "#7c5cff" },
    { key: "color2", label: "Brand colour 2", type: "text", default: "#00d4ff", placeholder: "#00d4ff" },
    { key: "handle", label: "Handle / brand name (neeche)", type: "text", default: "", placeholder: "@mychannel" },
    { key: "bgQuery", label: "Photo background search (English)", type: "text", default: "{{ $json.topicUsed || $json.topic }}", placeholder: "sunrise, mountains, city..." },
    { key: "pexelsKey", label: "Pexels API key " + CRED, type: "secret", default: "" },
    { key: "pixabayKey", label: "Pixabay API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const YI = require("../public/js/image-core.js");
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const it = ctx.items[i];
      const plan = YI.planImage({ text: s(ctx.p("text", i)), title: s(ctx.p("title", i)), size: ctx.raw.size, style: ctx.raw.style, color1: s(ctx.p("color1", i)), color2: s(ctx.p("color2", i)), handle: s(ctx.p("handle", i)) });
      if (!(await VM.hasFfmpeg())) throw new Error(VM.NO_FFMPEG);
      const work = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "yf-img-"));
      let bg = null; let credit = "";
      if (plan.style === "photo") {
        const q = YI.stockPhotoQuery(s(ctx.p("bgQuery", i)) || plan.text);
        const pk = s(ctx.p("pexelsKey", i) || (ctx.settings.pexels || {}).apiKey).trim(); const xk = s(ctx.p("pixabayKey", i) || (ctx.settings.pixabay || {}).apiKey).trim();
        let list = [];
        if (pk) { const r = await http(`${API.pexels()}/v1/search?query=${encodeURIComponent(q)}&per_page=30&orientation=portrait`, { headers: { authorization: pk }, timeoutMs: 30000 }).catch((e) => ({ ok: false, status: 0, data: e.message })); if (r.ok) list = YI.normalizePexelsPhotos(r.data); else ctx.log(apiError("Pexels", r).message); }
        if (!list.length && xk) { const r = await http(`${API.pixabay()}/api/?key=${encodeURIComponent(xk)}&q=${encodeURIComponent(q.slice(0, 100))}&image_type=photo&orientation=vertical&per_page=30&safesearch=true`, { timeoutMs: 30000 }).catch((e) => ({ ok: false, status: 0, data: e.message })); if (r.ok) list = YI.normalizePixabayPhotos(r.data); else ctx.log(apiError("Pixabay", r).message); }
        if (!pk && !xk) ctx.log("Photo style: Pexels/Pixabay key nahi hai — gradient background use kiya");
        const pick = list.length ? list[Math.floor(Math.random() * Math.min(list.length, 10))] : null;
        if (pick) { try { bg = await saveDownload(ctx, pick.url, "imgbg"); credit = YI.photoCredit(pick); } catch (e) { ctx.log(`Stock photo download fail (${e.message}) — gradient`); } }
      }
      if (!bg) { bg = path.join(work, "bg.ppm"); fs.writeFileSync(bg, Buffer.from(YV.gradientPPM(108, Math.round(108 * plan.height / plan.width), plan.colors.bg1, plan.colors.bg2, Date.now() % 97))); }
      fs.writeFileSync(path.join(work, "card.ass"), YI.assForImage(plan));
      const dir = path.join(ctx.filesDir || ".", "images"); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `yantraflow-post-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${i}.png`);
      const r = await VM.run(process.env.YANTRAFLOW_FFMPEG || "ffmpeg", YI.imageArgs(plan, { bg, ass: "card.ass", out: file, photo: !bg.endsWith(".ppm") }), { cwd: work, timeoutMs: 120000 });
      try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* */ }
      if (r.code !== 0 || !fs.existsSync(file)) throw new Error(`Photo nahi bani (ffmpeg): ${s(r.out).slice(-300)}`);
      const res = { ...it, image: file, imageFile: file, photo: file, imageSize: plan.size, imageBy: "YantraFlow Post Photo Maker" };
      if (credit) { res.credit = YV.addCredit(s(it.credit), credit); }
      out.push(res);
    }
    return one(out);
  },
});
def({
  type: "videoMaker", label: "Auto Video Maker (Shorts / Reels)", group: "Media", icon: "clapperboard", color: "#f43f5e",
  description: "Har run khud vertical video banata hai (1080x1920, 15-60 s): AI ke text se kinetic captions + photo / free stock clip / gradient background + music (+ voice on PC). Template / slide-style video hai — camera footage nahi. PC/Termux = MP4 (ffmpeg). Website = browser me banti hai.",
  params: [
    { key: "mode", label: "Video source", type: "select", options: ["auto", "make", "own", "off"], default: "auto", help: "auto = pichhle step me video (apni file/link) ho to wahi, warna nayi video banao. make = hamesha nayi. own = sirf apni file/link. off = video nahi (text post)." },
    { key: "script", label: "Video text (script)", type: "textarea", default: "{{ $json.caption || $json.text || $json.description }}", help: "Hashtags / links apne aap hat jaate hain. Har line = ek slide." },
    { key: "title", label: "Hook / title (first slide)", type: "text", default: "{{ $json.title }}" },
    { key: "seconds", label: "Length (15-60 s, 0 = auto)", type: "number", default: 0 },
    { key: "background", label: "Background", type: "select", options: ["auto", "stock", "photos", "gradient"], default: "auto", help: "auto = Pexels/Pixabay key ho to free stock clip, warna animated gradient. photos = neeche apni photos." },
    { key: "bgQuery", label: "Stock background search (English)", type: "text", default: "{{ $json.topicUsed || $json.topic }}", placeholder: "motivation, city, nature..." },
    { key: "photos", label: "My photos / clips (one link or path per line)", type: "textarea", default: "" },
    ...VIDEO_PARAMS,
    { key: "cta", label: "End text (CTA)", type: "text", default: "Like + Follow karo" },
    { key: "size", label: "Size", type: "select", options: ["1080x1920", "720x1280"], default: "1080x1920" },
    { key: "pexelsKey", label: "Pexels API key " + CRED, type: "secret", default: "" },
    { key: "pixabayKey", label: "Pixabay API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const it = ctx.items[i]; const mode = ctx.raw.mode || "auto";
      const incoming = s(it.videoFile || it.path || it.media);
      if (mode === "off") { out.push({ ...it }); continue; }
      if (mode === "own" || (mode === "auto" && !it.needsMaker && YV.looksVideo(incoming))) {
        if (!incoming) throw new Error("Video source = own, par pichhle step me koi video file/link nahi mila");
        out.push({ ...it, media: incoming, videoBy: "own" }); continue;
      }
      const planInput = { script: s(ctx.p("script", i)), title: s(ctx.p("title", i)), seconds: Number(ctx.p("seconds", i)) || 0, theme: ctx.raw.theme, size: ctx.raw.size, cta: s(ctx.p("cta", i)), watermark: s(ctx.p("watermark", i)) };
      if (!YV.splitScript(planInput.script).length && !planInput.title.trim()) throw new Error("Video ke liye text khaali hai — pehle AI Post Writer step lagao ya 'Video text' bharo");
      const plan = YV.planVideo(planInput);
      let bg = null; let credit = "";
      const bgMode = ctx.raw.background || "auto";
      const photos = YV.ownClips(ctx.p("photos", i)).map((c) => c.url);
      const inImg = /\.(jpe?g|png|webp)(\?|$)/i.test(incoming) ? [incoming] : [];
      const local = async (u) => (/^https?:\/\//i.test(u) ? saveDownload(ctx, u, "bg") : resolvePath(ctx, u));
      if (bgMode === "photos" || (bgMode === "auto" && (photos.length || inImg.length))) {
        const list = photos.length ? photos : inImg;
        if (list.length) { const files = []; for (const u of list.slice(0, 8)) files.push(await local(u)); bg = { type: YV.looksVideo(list[0]) ? "video" : "image", files }; }
      }
      if (!bg && (bgMode === "stock" || bgMode === "auto")) {
        const q = YV.stockQuery(s(ctx.p("bgQuery", i)) || plan.title || "abstract background");
        const f = await stockSearch(ctx, q, "auto", "portrait");
        const clip = YV.pickClip(f.list, { minSeconds: 4, maxSeconds: 120 });
        if (clip) { bg = { type: "video", files: [await saveDownload(ctx, clip.url, "bg")] }; credit = YV.creditLine(clip); }
        else if (bgMode === "stock") throw new Error(f.errs.join(" · ") || `Stock clip nahi mila: ${q}`);
        else if (f.errs.length) ctx.log(`Stock background skipped (${f.errs.join(" · ")}) — using gradient`);
      }
      const dir = path.join(ctx.filesDir || ".", "videos"); fs.mkdirSync(dir, { recursive: true });
      const music = ctx.raw.music === "off" ? "off" : ctx.raw.music === "file" ? await local(need(ctx.p("musicFile", i), "Music file")) : "generated";
      const r = await VM.makeVideo({ plan, planInput, bg, voice: ctx.raw.voice || "off", voiceName: YV.VOICES[ctx.raw.voiceLang] || YV.VOICES.Hinglish, music, outFile: path.join(dir, `yantraflow-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mp4`) });
      r.warnings.forEach((w) => ctx.log(w));
      const res = { ...it, media: r.file, path: r.file, videoFile: r.file, videoUrl: "", videoType: "mp4", videoSeconds: r.seconds, videoBy: "YantraFlow Auto Video Maker", videoBackground: r.background, voice: r.voice, needsMaker: false };
      if (credit) { res.credit = YV.addCredit(s(it.credit), credit); res.description = YV.addCredit(s(it.description), credit); }
      out.push(res);
    }
    return one(out);
  },
});
def({
  type: "videoEdit", label: "Video Editor (9:16, trim, Hindi captions)", group: "Media", icon: "scissors", color: "#f97316",
  description: "Clip ko Shorts/Reels ready banata hai: 9:16 crop, max 60 s trim, speed, hook text upar, end CTA, watermark, music. English bol-chaal ho to Hindi/Hinglish captions + optional Hindi voice dub (PC/Termux).",
  params: [
    { key: "input", label: "Video file / link", type: "text", default: "{{ $json.videoFile || $json.path || $json.media }}" },
    { key: "hook", label: "Hook text (first 3 s, top)", type: "text", default: "{{ $json.title }}" },
    { key: "cta", label: "End text (last 3 s)", type: "text", default: "Follow karo roz naye videos ke liye" },
    { key: "watermark", label: "Watermark / handle", type: "text", default: "", placeholder: "@mychannel" },
    { key: "maxSeconds", label: "Max length (s)", type: "number", default: 59 },
    { key: "speed", label: "Speed (0.5 - 2)", type: "number", default: 1 },
    { key: "music", label: "Music", type: "select", options: ["off", "generated", "file"], default: "off" },
    { key: "musicFile", label: "Music file / link (royalty-free)", type: "text", default: "" },
    { key: "translate", label: "English -> Hindi", type: "select", options: ["off", "captions", "captions+dub"], default: "captions", help: "PC/Termux: faster-whisper sunta hai (pip install faster-whisper), AI Hindi me badalta hai, captions video pe. +dub = Hindi AI voice (edge-tts), original awaaz dheemi. Clip me English bol-chaal na ho to skip." },
    { key: "captionLang", label: "Caption language", type: "select", options: ["Hindi", "Hinglish"], default: "Hindi" },
    { key: "whisperModel", label: "Speech model (tiny = fast, base = better)", type: "select", options: ["tiny", "base", "small"], default: "base" },
    { key: "theme", label: "Colours", type: "select", options: ["bold", "neon", "sunset", "clean"], default: "bold" },
    { key: "model", label: "AI model " + CRED, type: "text", default: "" },
    { key: "baseUrl", label: "AI Base URL " + CRED, type: "text", default: "" },
    { key: "apiKey", label: "AI API key " + CRED, type: "secret", default: "" },
  ],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const it = ctx.items[i];
      let input = s(ctx.p("input", i)).trim();
      if (!input) { ctx.log("No video to edit — passing through"); out.push({ ...it }); continue; }
      input = /^https?:\/\//i.test(input) ? await saveDownload(ctx, input, "src") : resolvePath(ctx, input);
      let captions = []; let dubLines = []; let speech = null;
      const tr = ctx.raw.translate || "captions";
      if (tr !== "off") {
        const info = await VM.probe(input);
        if (info.hasAudio) {
          try {
            const wav = input + ".16k.wav";
            await VM.run(process.env.YANTRAFLOW_FFMPEG || "ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-t", "120", "-ac", "1", "-ar", "16000", wav], { timeoutMs: 120000 });
            speech = await VM.transcribe(wav, ctx.raw.whisperModel || "base");
            try { fs.unlinkSync(wav); } catch (_) { /* */ }
            const words = speech.segments.map((x) => x.text).join(" ").split(/\s+/).filter(Boolean).length;
            if (speech.language === "en" && words >= 3) {
              const ai = await aiComplete(ctx, i, YV.translateMessages(speech.segments.slice(0, 40), ctx.raw.captionLang || "Hindi"), { temperature: 0.3, maxTokens: 1500 });
              captions = YV.parseTranslation(ai.text, speech.segments.slice(0, 40));
              if (tr === "captions+dub") dubLines = captions.map((c) => ({ start: c.start, text: c.text }));
            } else ctx.log(`Speech language "${speech.language}" / ${words} words — translation skipped`);
          } catch (e) { ctx.log(`English -> Hindi skipped: ${e.message}`); }
        } else ctx.log("Clip has no sound — translation skipped");
      }
      const dir = path.join(ctx.filesDir || ".", "videos"); fs.mkdirSync(dir, { recursive: true });
      const music = ctx.raw.music === "file" ? (/^https?:/i.test(s(ctx.p("musicFile", i))) ? await saveDownload(ctx, s(ctx.p("musicFile", i)), "music") : resolvePath(ctx, ctx.p("musicFile", i))) : ctx.raw.music || "off";
      const r = await VM.editVideo({ input, hook: s(ctx.p("hook", i)), cta: s(ctx.p("cta", i)), watermark: s(ctx.p("watermark", i)), maxSeconds: Number(ctx.raw.maxSeconds) || 59, speed: Number(ctx.raw.speed) || 1, music, theme: ctx.raw.theme, captions, dubLines, voiceName: ctx.raw.captionLang === "Hinglish" ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural", outFile: path.join(dir, `edited-${Date.now()}.mp4`) });
      r.warnings.forEach((w) => ctx.log(w));
      out.push({ ...it, media: r.file, path: r.file, videoFile: r.file, videoUrl: "", videoSeconds: r.seconds, edited: { captions: r.captions, dubbed: r.dubbed, speechLanguage: speech ? speech.language : "", hindi: captions.map((c) => c.text).join(" ").slice(0, 500) } });
    }
    return one(out);
  },
});

// ===== Social / messaging
def({
  type: "telegram", label: "Telegram", group: "Social", icon: "telegram", color: "#0ea5e9",
  description: "Send text, photo, video, file or a LINK PREVIEW (any link -> photo + title + description + link) to a chat, group or channel (@channelname — add your bot as admin).",
  params: [
    { key: "operation", label: "Send", type: "select", options: ["text", "photo", "video", "document", "linkPreview"], default: "text", help: "linkPreview = koi bhi link do (article, YouTube, Insta, website) -> uski photo + title + description + link bot pe jayega." },
    { key: "text", label: "Text / caption", type: "textarea", default: "Hello from YantraFlow 🚀", help: "linkPreview me khaali chhodo = auto caption (title + description + link)." },
    { key: "media", label: "Photo / video / file (URL or file path)", type: "text", default: "" },
    { key: "link", label: "Link (for linkPreview)", type: "text", default: "", placeholder: "https://... (article / YouTube / Instagram / any page)" },
    { key: "upload", label: "Media sending", type: "select", options: ["auto", "upload", "url"], default: "auto", help: "auto = pehle link se bhejo; Telegram link na khol paaye (\"failed to get HTTP URL content\") to YantraFlow file download karke upload karega. upload = hamesha upload. url = sirf link." },
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
      const mode = ctx.raw.upload || "auto";
      let r; let via = "api"; let preview;
      if (op === "text") {
        if (text.length > 4096) text = text.slice(0, 4093) + "...";
        r = await tgCall(token, "sendMessage", { chat_id: chatId, text: need(text, "Text"), parse_mode: pm });
      } else if (op === "linkPreview") {
        const link = need(ctx.p("link", i) || ctx.items[i].url || ctx.items[i].link, "Link");
        preview = ctx.items[i].title && (ctx.items[i].url === link || ctx.items[i].link === link) && ctx.items[i].image !== undefined ? ctx.items[i] : await getPreview(link);
        preview = Object.assign({}, preview, { url: link });
        const own = text.trim() && text.trim() !== "Hello from YantraFlow 🚀";
        const cap = own ? text.slice(0, 1024) : LP.caption(preview, 1024);
        const capPm = own ? pm : "HTML";
        r = null;
        if (preview.image) {
          try { const m = await tgMedia(token, "photo", { chat_id: chatId, caption: cap, parse_mode: capPm }, preview.image, "upload"); r = m.r; via = "photo-upload"; }
          catch (e) { ctx.log(`Preview photo could not be downloaded (${e.message}) — sending text + link preview instead`); }
          if (r && !tgOk(r)) { ctx.log(`Telegram refused the photo (${tgDesc(r)}) — sending text + link preview instead`); r = null; }
        }
        if (!r) {
          const msg = own ? text.slice(0, 4096) : LP.caption(preview, 4096);
          r = await tgCall(token, "sendMessage", { chat_id: chatId, text: msg, parse_mode: capPm, link_preview_options: { url: link, prefer_large_media: true, show_above_text: true } });
          via = "message+preview";
        }
      } else {
        const method = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" }[op];
        const media = need(ctx.p("media", i), "Media URL / file path");
        if (text.length > 1024) text = text.slice(0, 1021) + "...";
        const fields = { chat_id: chatId, caption: text || undefined, parse_mode: pm };
        if (/^https?:\/\//i.test(media)) {
          const m = await tgMedia(token, op, fields, media, mode); r = m.r; via = m.via;
        } else {
          const file = resolvePath(ctx, media);
          r = await tgCall(token, method, fields, { field: op, buf: await fsp.readFile(file), name: path.basename(file) });
          via = "file";
        }
      }
      if (!tgOk(r)) {
        const d = tgDesc(r);
        if (LP.TG_URL_FAIL.test(d)) throw new Error(`Telegram answered ${r.status}: ${d}. Telegram ye link khol nahi paaya — "Media sending" = upload rakho, ya direct photo/video file ka link do (web page ka nahi).`);
        throw apiError("Telegram", r);
      }
      const m = r.data.result || {};
      out.push({ ...ctx.items[i], ...(preview ? { preview } : {}), telegram: { ok: true, messageId: m.message_id, chat: m.chat && (m.chat.username || m.chat.id), via } });
    }
    return one(out);
  },
});
def({
  type: "linkPreview", label: "Link Preview", group: "Data", icon: "link", color: "#0ea5e9",
  description: "Any link -> its preview: title, description, image (thumbnail), site name. Same data Telegram/WhatsApp show.",
  params: [{ key: "url", label: "Link", type: "text", default: "{{ $json.link }}", placeholder: "https://..." }],
  async run(ctx) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const p = await getPreview(need(ctx.p("url", i), "Link"));
      out.push({ ...ctx.items[i], ...p, link: p.url });
    }
    return one(out);
  },
});
def({
  type: "instagram", label: "Instagram Post", group: "Social", icon: "instagram", color: "#e1306c",
  description: "Post a photo or Reel with the official Instagram Graph API. Needs a Business/Creator account + a PUBLIC media URL.",
  params: [
    { key: "kind", label: "Post type", type: "select", options: ["REELS", "IMAGE"], default: "REELS" },
    { key: "mediaUrl", label: "Video / image (public URL, or a file on PC/Termux)", type: "text", default: "{{ $json.videoUrl || $json.videoFile || $json.media }}", help: "Public https link -> Instagram khud le leta hai. PC/Termux pe file path bhi chalega (resumable upload) — Auto Video Maker wali video seedha jaati hai." },
    { key: "caption", label: "Caption", type: "textarea", default: "{{ $json.text }}" },
    { key: "shareToFeed", label: "Also show Reel in feed", type: "boolean", default: true },
    { key: "firstComment", label: "First comment (optional)", type: "text", default: "{{ $json.comment }}", help: "Post ke baad pehla comment (instagram_manage_comments permission chahiye; fail hua to post phir bhi ho jayega)." },
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
      const kind = ctx.raw.kind || "REELS";
      const isWeb = /^https:\/\//i.test(url);
      if (!isWeb && (/^(yfvideo|blob):/i.test(url) || /^http:/i.test(url) || kind === "IMAGE")) throw new Error("Instagram needs a PUBLIC https:// URL for this media (photos), or a video FILE on PC/Termux. Upload it somewhere public first (e.g. your website, a CDN, Cloudinary free plan).");
      const params = new URLSearchParams({ caption: s(ctx.p("caption", i)).slice(0, 2200), access_token: token });
      let localFile = "";
      if (kind === "IMAGE") params.set("image_url", url);
      else {
        params.set("media_type", "REELS"); params.set("share_to_feed", String(ctx.raw.shareToFeed !== false && ctx.raw.shareToFeed !== "false"));
        if (isWeb) params.set("video_url", url);
        else { localFile = resolvePath(ctx, url); if (!fs.existsSync(localFile)) throw new Error(`Video file not found: ${localFile}. Instagram needs a PUBLIC https:// link, or a video file that exists on this PC/Termux.`); params.set("upload_type", "resumable"); }
      }
      const c = await http(`${API.graph()}/${uid}/media`, { method: "POST", body: params });
      if (!c.ok) throw apiError("Instagram (create)", c);
      const creationId = c.data.id;
      if (localFile) {
        // resumable upload: send the file bytes straight to Instagram (no public link needed)
        const buf = await fsp.readFile(localFile);
        const up = await http(c.data.uri || `${API.rupload()}/${creationId}`, { method: "POST", headers: { authorization: `OAuth ${token}`, offset: "0", file_size: String(buf.length), "content-type": "application/octet-stream" }, body: buf, timeoutMs: 600000 });
        if (!up.ok || (up.data && up.data.success === false)) throw apiError("Instagram (upload)", up);
      }
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
      const ig = { ok: true, mediaId: p.data.id, upload: localFile ? "file" : "url" };
      const cm = s(ctx.p("firstComment", i)).trim();
      if (cm) {
        const r2 = await http(`${API.graph()}/${p.data.id}/comments`, { method: "POST", body: new URLSearchParams({ message: cm.slice(0, 2200), access_token: token }) }).catch((e) => ({ ok: false, data: e.message }));
        if (r2.ok) ig.commentId = r2.data && r2.data.id; else { ig.commentError = apiError("Instagram (comment)", r2).message; ctx.log(`Post done, first comment failed: ${ig.commentError}`); }
      }
      out.push({ ...ctx.items[i], instagram: ig });
    }
    return one(out);
  },
});
def({
  type: "facebook", label: "Facebook Page Post", group: "Social", icon: "facebook", color: "#1877f2",
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
  type: "youtube", label: "YouTube Upload", group: "Social", icon: "youtube", color: "#ff0033",
  description: "Upload a video (Shorts too: vertical + under 60 s) to your channel (YouTube Data API v3). PC/Termux: file or link. Website: Auto Video Maker wali video ya direct video link.",
  params: [
    { key: "file", label: "Video file path or direct video link", type: "text", default: "{{ $json.videoFile || $json.path || $json.media }}" },
    { key: "title", label: "Title", type: "text", default: "{{ $json.title }}" },
    { key: "description", label: "Description", type: "textarea", default: "{{ $json.description }}" },
    { key: "tags", label: "Tags (comma separated)", type: "text", default: "{{ $json.tags }}" },
    { key: "privacy", label: "Privacy", type: "select", options: ["private", "unlisted", "public"], default: "private" },
    { key: "categoryId", label: "Category ID (22 = People & Blogs, 24 = Entertainment, 27 = Education)", type: "text", default: "22" },
    { key: "firstComment", label: "First comment (optional)", type: "text", default: "", help: "Upload ke baad pehla comment. Refresh token me youtube.force-ssl scope chahiye; fail hua to upload phir bhi ho jayega." },
  ],
  async run(ctx) {
    const st = ctx.settings.youtube || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      let file = s(need(ctx.p("file", i), "Video file path")).trim();
      if (/^https?:\/\//i.test(file)) {
        const f = await download(file, 512 * 1024 * 1024);
        const dir = path.join(ctx.filesDir, "downloads"); fs.mkdirSync(dir, { recursive: true });
        file = path.join(dir, Date.now() + "-" + f.name); fs.writeFileSync(file, f.buf);
      } else file = resolvePath(ctx, file);
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
      const yt = { ok: true, videoId: data.id, url: `https://youtu.be/${data.id}`, privacy: meta.status.privacyStatus };
      const cm = s(ctx.p("firstComment", i)).trim();
      if (cm) {
        const r2 = await http(`${API.youtubeData()}/commentThreads?part=snippet`, { method: "POST", headers: { authorization: `Bearer ${tok.data.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ snippet: { videoId: data.id, topLevelComment: { snippet: { textOriginal: cm.slice(0, 9000) } } } }) }).catch((e) => ({ ok: false, data: e.message }));
        if (r2.ok) yt.commentId = r2.data && r2.data.id; else { yt.commentError = apiError("YouTube (comment)", r2).message; ctx.log(`Upload done, first comment failed (needs youtube.force-ssl scope): ${yt.commentError}`); }
      }
      out.push({ ...ctx.items[i], youtube: yt });
    }
    return one(out);
  },
});
def({
  type: "xPost", fullOnly: "X blocks browser calls (CORS) — use the full version.", label: "X (Twitter) Post", group: "Social", icon: "x", color: "#64748b",
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
  type: "linkedinPost", fullOnly: "LinkedIn blocks browser calls (CORS) — use the full version (PC/Termux).", label: "LinkedIn Post", group: "Social", icon: "linkedin", color: "#0a66c2",
  description: "Post text (+ optional link) on your LinkedIn profile with the official Posts API (needs your LinkedIn developer app token with w_member_social).",
  params: [
    { key: "text", label: "Post text (max 3000)", type: "textarea", default: "{{ $json.text }}" },
    { key: "link", label: "Link to share (optional)", type: "text", default: "" },
    { key: "visibility", label: "Who can see", type: "select", options: ["PUBLIC", "CONNECTIONS"], default: "PUBLIC" },
  ],
  async run(ctx) {
    const st = ctx.settings.linkedin || {};
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const token = need(st.accessToken, "LinkedIn access token");
      const version = s(st.version).trim() || "202610";
      let author = s(st.authorUrn).trim();
      if (!author) {
        const me = await http(`${API.linkedin()}/v2/userinfo`, { headers: { authorization: `Bearer ${token}` } });
        if (!me.ok || !me.data || !me.data.sub) throw new Error(`LinkedIn: could not read your member id (${me.status}). Add "Author URN" on the Keys page (urn:li:person:XXXX) or create the token with the openid + profile scopes too.`);
        author = `urn:li:person:${me.data.sub}`;
      }
      const body = { author, commentary: need(ctx.p("text", i), "Post text").slice(0, 3000), visibility: ctx.raw.visibility || "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false };
      const link = s(ctx.p("link", i)).trim();
      if (link) body.content = { article: { source: link, title: s(ctx.items[i].title || link).slice(0, 200) } };
      const r = await http(`${API.linkedin()}/rest/posts`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" }, body: JSON.stringify(body) });
      if (!r.ok) { const e = apiError("LinkedIn", r); if (/VERSION/i.test(e.message)) e.message += ` — Keys page pe "API version" badlo (abhi ${version}, format YYYYMM).`; throw e; }
      const id = (r.headers && (r.headers["x-restli-id"] || r.headers["x-linkedin-id"])) || "";
      out.push({ ...ctx.items[i], linkedin: { ok: true, id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : "" } });
    }
    return one(out);
  },
});
def({
  type: "discord", label: "Discord", group: "Social", icon: "discord", color: "#5865f2",
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
  type: "slack", fullOnly: "Slack blocks browser calls (CORS) — use the full version.", label: "Slack", group: "Social", icon: "slack", color: "#4a154b",
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
  type: "email", fullOnly: "Browsers cannot send SMTP email — use the full version.", label: "Email (SMTP)", group: "Social", icon: "mail", color: "#14b8a6",
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
  type: "writeFile", fullOnly: "Browsers cannot write files on disk — use the full version.", label: "Write File / Log", group: "Media", icon: "file-pen", color: "#ec4899",
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


// ===== v4.5: extra nodes (shared with the browser) — public/js/extra-nodes.js
const XN = require("../public/js/extra-nodes.js");
const { execFile: _execFile, spawn: _spawn } = require("node:child_process");
function hostFor(ctx) {
  const memFile = () => jsonFile(ctx, "memory.json");
  return {
    edition: "full", http, apiError, parseFeed, telegramApi: API.telegram,
    ai: (c, i, messages, opt) => aiComplete(c, i, messages, opt),
    mem: { get: async (k) => { const v = memFile().read()[k]; return v === undefined ? null : v; }, set: async (k, v) => { const f = memFile(); const o = f.read(); if (v === null) delete o[k]; else o[k] = v; f.write(o); } },
    exec: (cmd, opt = {}) => new Promise((resolve) => {
      const sh = process.platform === "win32" ? "cmd.exe" : (process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/sh");
      const args = process.platform === "win32" ? ["/d", "/s", "/c", cmd] : ["-c", cmd];
      const child = _spawn(sh, args, { cwd: ctx.workDir || path.join(__dirname, ".."), env: process.env });
      let out = "", err = ""; const cap = (a, b) => (a + b).slice(-200000);
      child.stdout.on("data", (d) => (out = cap(out, d.toString())));
      child.stderr.on("data", (d) => (err = cap(err, d.toString())));
      const t = setTimeout(() => { err += "\n[timeout — process killed]"; try { child.kill("SIGKILL"); } catch (_) { /* */ } }, opt.timeoutMs || 120000);
      child.on("error", (e) => { clearTimeout(t); resolve({ code: 127, stdout: out, stderr: err + e.message }); });
      child.on("close", (code) => { clearTimeout(t); resolve({ code: code === null ? 137 : code, stdout: out.trim(), stderr: err.trim() }); });
    }),
  };
}
for (const d of XN.DEFS) {
  const { run, poll, ...meta } = d;
  const node = Object.assign({}, meta, { run: (ctx) => run(ctx, hostFor(ctx)) });
  if (poll) node.poll = (ctx, state) => poll(ctx, state, hostFor(ctx));
  def(node);
}

const BY_TYPE = Object.fromEntries(NODES.map((n) => [n.type, n]));
function publicNodeList() {
  return NODES.map(({ run, poll, pollEverySeconds, ...meta }) => meta);
}
module.exports = { NODES, BY_TYPE, publicNodeList, testCondition, API, getPreview, download, aiComplete };

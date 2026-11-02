/* Browser (web edition) implementations of YantraFlow nodes.
   The full edition runs src/nodes.js on Node.js instead. */
(function () {
  "use strict";
  const META = window.YF_NODE_META;
  const s = (v) => (v === undefined || v === null ? "" : String(v));
  const one = (items) => [items];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const need = (v, what) => { if (!s(v).trim()) throw new Error(`${what} is empty. Add it in the node or on the Keys page.`); return s(v).trim(); };
  const parseLines = (text) => s(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => { const i = l.search(/=|:/); return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  function setDeep(o, key, val) { const p = key.split("."); for (let i = 0; i < p.length - 1; i++) { if (typeof o[p[i]] !== "object" || !o[p[i]]) o[p[i]] = {}; o = o[p[i]]; } o[p[p.length - 1]] = val; }

  async function http(url, opts = {}) {
    let res;
    try { res = await fetch(url, opts); }
    catch (e) {
      throw new Error(`Browser could not reach ${(() => { try { return new URL(url).host; } catch (_) { return url; } })()} — the site may block browser requests (CORS) or be offline. Use the full version (PC/Termux) for this.`);
    }
    const text = await res.text();
    let data = text; try { data = text ? JSON.parse(text) : null; } catch (_) { /* text */ }
    return { status: res.status, ok: res.ok, data };
  }
  function apiError(name, r) {
    const d = r.data;
    const msg = (d && (d.description || (d.error && (d.error.message || d.error)) || d.message)) || (typeof d === "string" ? d.slice(0, 300) : JSON.stringify(d));
    return new Error(`${name} answered ${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  function parseCsv(text) {
    const rows = []; let row = []; let cur = ""; let q = false; text = s(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; } else cur += ch; }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    const r2 = rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!r2.length) return [];
    const head = r2[0].map((h, i) => h.trim() || `col${i + 1}`);
    return r2.slice(1).map((r, idx) => { const o = { _row: idx + 2 }; head.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); }); return o; });
  }
  async function readCsv(src) {
    src = need(src, "CSV link");
    if (!/^https?:\/\//.test(src)) throw new Error("In the web version use a CSV link (Google Sheets → Publish to web → CSV). Local files need the full version.");
    const r = await http(src); if (!r.ok) throw apiError("Sheet", r);
    return parseCsv(typeof r.data === "string" ? r.data : JSON.stringify(r.data));
  }
  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const nodes = [...doc.querySelectorAll("item"), ...doc.querySelectorAll("entry")];
    const txt = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent.trim() : ""; };
    const strip = (h) => { const d = document.createElement("div"); d.innerHTML = h; return d.textContent.replace(/\s+/g, " ").trim(); };
    return nodes.map((el) => {
      const linkEl = el.querySelector("link");
      const link = linkEl ? (linkEl.getAttribute("href") || linkEl.textContent.trim()) : "";
      const content = strip(txt(el, "description") || txt(el, "summary") || txt(el, "content"));
      return { title: strip(txt(el, "title")), link, pubDate: txt(el, "pubDate") || txt(el, "published") || txt(el, "updated"), content, contentSnippet: content.slice(0, 300) };
    });
  }

  const impl = {
    manualTrigger: async (ctx) => { let d = {}; try { d = JSON.parse(ctx.raw.testData || "{}"); } catch (_) { throw new Error("Test data is not valid JSON"); } return one(Array.isArray(d) ? d : [d]); },
    scheduleTrigger: async () => one([{ firedAt: new Date().toISOString() }]),
    webhookTrigger: async (ctx) => { let b = {}; try { b = JSON.parse(ctx.raw.testData || "{}"); } catch (_) { /* */ } return one([{ body: b, query: {}, headers: {}, method: "POST", test: true }]); },
    folderTrigger: async (ctx) => one([{ path: `${ctx.raw.folder}/${ctx.raw.testFile}`, name: ctx.raw.testFile, ext: (ctx.raw.testFile.match(/\.[^.]+$/) || [""])[0], size: 0, test: true }]),
    sheetTrigger: async (ctx) => one(ctx.pollItems || (await readCsv(ctx.raw.source)).slice(-1)),
    httpRequest: async (ctx) => {
      const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const method = ctx.p("method", i) || "GET"; const headers = {};
        for (const [k, v] of parseLines(ctx.p("headers", i))) headers[k] = v;
        let body = ctx.p("body", i);
        if (method === "GET" || body === "" || body === undefined) body = undefined;
        else { if (typeof body === "object") body = JSON.stringify(body); if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = /^\s*[[{]/.test(body) ? "application/json" : "text/plain"; }
        const r = await http(need(ctx.p("url", i), "URL"), { method, headers, body });
        out.push({ status: r.status, ok: r.ok, data: r.data });
      }
      return one(out);
    },
    set: async (ctx) => one(ctx.items.map((item, i) => { const o = ctx.raw.keepOld === false || ctx.raw.keepOld === "false" ? {} : JSON.parse(JSON.stringify(item)); for (const [k, v] of parseLines(ctx.raw.fields)) setDeep(o, k, ctx.evalFor(v, i)); return o; })),
    code: async (ctx) => {
      const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
      const con = { log: (...a) => ctx.log(a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")) };
      let r;
      try { r = await new AsyncFn("items", "$node", "console", ctx.raw.code || "return items;")(JSON.parse(JSON.stringify(ctx.items)), ctx.nodeData, con); }
      catch (e) { throw new Error(`Code error: ${e.message}`); }
      if (r === undefined) r = ctx.items; if (!Array.isArray(r)) r = [r];
      return one(r.map((x) => (x && typeof x === "object" ? x : { value: x })));
    },
    if: async (ctx) => { const t = [], f = []; ctx.items.forEach((it, i) => (test(ctx.p("left", i), ctx.raw.op, ctx.p("right", i)) ? t : f).push(it)); return [t, f]; },
    switch: async (ctx) => { const outs = [[], [], [], []]; ctx.items.forEach((it, i) => { const v = s(ctx.p("value", i)).trim().toLowerCase(); const k = ["case1", "case2", "case3"].findIndex((c) => s(ctx.p(c, i)).trim() !== "" && s(ctx.p(c, i)).trim().toLowerCase() === v); outs[k >= 0 ? k : 3].push(it); }); return outs; },
    delay: async (ctx) => { await sleep(Math.min(Number(ctx.p("seconds")) || 0, 3600) * 1000); return one(ctx.items); },
    filter: async (ctx) => { let it = ctx.items.filter((_, i) => (s(ctx.raw.condition).trim() ? !!ctx.p("condition", i) : true)); const n = Number(ctx.raw.max) || 0; if (n > 0) it = it.slice(0, n); return one(it); },
    aiChat: async (ctx) => {
      const st = ctx.settings.ai || {}; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const base = s(ctx.p("baseUrl", i) || st.baseUrl || "http://localhost:8787/v1").replace(/\/+$/, "");
        const messages = []; const sys = s(ctx.p("system", i)); if (sys) messages.push({ role: "system", content: sys });
        messages.push({ role: "user", content: need(ctx.p("prompt", i), "Prompt") });
        let r;
        try {
          r = await http(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s(ctx.p("apiKey", i) || st.apiKey || "local")}` }, body: JSON.stringify({ model: s(ctx.p("model", i) || st.model || "auto"), messages, temperature: Number(ctx.raw.temperature ?? 0.7), max_tokens: Number(ctx.raw.maxTokens) || 500 }) });
        } catch (e) { throw new Error(`Could not reach the AI at ${base}. Start FreeLLM-Router on this device, or set an online OpenAI-compatible Base URL + key on the Keys page (e.g. https://api.groq.com/openai/v1).`); }
        if (!r.ok) throw apiError("AI", r);
        const c = r.data && r.data.choices && r.data.choices[0];
        out.push({ ...ctx.items[i], text: s(c && c.message && c.message.content).trim(), model: (r.data && r.data.model) || "", usage: (r.data && r.data.usage) || null });
      }
      return one(out);
    },
    telegram: async (ctx) => {
      const st = ctx.settings.telegram || {}; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const token = need(ctx.p("botToken", i) || st.botToken, "Telegram bot token"); const chatId = need(ctx.p("chatId", i) || st.chatId, "Telegram chat ID");
        const op = ctx.raw.operation || "text"; const pm = ctx.raw.parseMode && ctx.raw.parseMode !== "none" ? ctx.raw.parseMode : undefined;
        let text = s(ctx.p("text", i)); let body;
        if (op === "text") body = { chat_id: chatId, text: need(text, "Text").slice(0, 4096), parse_mode: pm };
        else { const media = need(ctx.p("media", i), "Media URL"); if (!/^https?:\/\//.test(media)) throw new Error("Web version can send media by URL only. Local files need the full version."); body = { chat_id: chatId, [op]: media, caption: text.slice(0, 1024) || undefined, parse_mode: pm }; }
        const method = { text: "sendMessage", photo: "sendPhoto", video: "sendVideo", document: "sendDocument" }[op];
        // form-encoded = "simple" CORS request (Telegram's API answers browsers, but not preflight checks)
        const form = new URLSearchParams(); for (const [k, v] of Object.entries(body)) if (v !== undefined) form.set(k, v);
        const r = await http(`${window.YF_TELEGRAM_API || "https://api.telegram.org"}/bot${token}/${method}`, { method: "POST", body: form });
        if (!r.ok || (r.data && r.data.ok === false)) throw apiError("Telegram", r);
        out.push({ ...ctx.items[i], telegram: { ok: true, messageId: r.data.result && r.data.result.message_id } });
      }
      return one(out);
    },
    instagram: async (ctx) => {
      const st = ctx.settings.instagram || {}; const out = []; const G = "https://graph.facebook.com/v21.0";
      for (let i = 0; i < ctx.items.length; i++) {
        const uid = need(ctx.p("userId", i) || st.userId, "Instagram user ID"); const token = need(ctx.p("accessToken", i) || st.accessToken, "Instagram access token");
        const url = need(ctx.p("mediaUrl", i), "Media URL"); if (!/^https:\/\//.test(url)) throw new Error("Instagram needs a PUBLIC https:// media URL.");
        const kind = ctx.raw.kind || "REELS"; const p = new URLSearchParams({ caption: s(ctx.p("caption", i)).slice(0, 2200), access_token: token });
        if (kind === "IMAGE") p.set("image_url", url); else { p.set("media_type", "REELS"); p.set("video_url", url); }
        const c = await http(`${G}/${uid}/media`, { method: "POST", body: p }); if (!c.ok) throw apiError("Instagram (create)", c);
        for (let k = 0; k < 60; k++) { const q = await http(`${G}/${c.data.id}?fields=status_code&access_token=${encodeURIComponent(token)}`); const code = q.data && q.data.status_code; if (code === "FINISHED" || (kind === "IMAGE" && !code)) break; if (code === "ERROR") throw new Error("Instagram could not process the media"); await sleep(5000); }
        const pub = await http(`${G}/${uid}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.data.id, access_token: token }) }); if (!pub.ok) throw apiError("Instagram (publish)", pub);
        out.push({ ...ctx.items[i], instagram: { ok: true, mediaId: pub.data.id } });
      }
      return one(out);
    },
    facebook: async (ctx) => {
      const st = ctx.settings.facebook || {}; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const pid = need(ctx.p("pageId", i) || st.pageId, "Page ID"); const token = need(ctx.p("pageToken", i) || st.pageToken, "Page token");
        const kind = ctx.raw.kind || "text"; const msg = s(ctx.p("message", i)); const b = new URLSearchParams({ access_token: token }); let edge = "feed";
        if (kind === "text") { b.set("message", need(msg, "Text")); if (s(ctx.p("link", i))) b.set("link", s(ctx.p("link", i))); }
        else if (kind === "photo") { edge = "photos"; b.set("url", need(ctx.p("mediaUrl", i), "Photo URL")); if (msg) b.set("caption", msg); }
        else { edge = "videos"; b.set("file_url", need(ctx.p("mediaUrl", i), "Video URL")); if (msg) b.set("description", msg); }
        const r = await http(`https://graph.facebook.com/v21.0/${pid}/${edge}`, { method: "POST", body: b }); if (!r.ok) throw apiError("Facebook", r);
        out.push({ ...ctx.items[i], facebook: { ok: true, id: r.data.post_id || r.data.id } });
      }
      return one(out);
    },
    discord: async (ctx) => {
      const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const url = need(ctx.p("webhookUrl", i) || (ctx.settings.discord || {}).webhookUrl, "Discord webhook URL");
        const fd = new FormData(); fd.append("content", need(ctx.p("content", i), "Message").slice(0, 2000)); if (ctx.p("username", i)) fd.append("username", ctx.p("username", i));
        const r = await http(url, { method: "POST", body: fd });
        if (!r.ok) throw apiError("Discord", r); out.push({ ...ctx.items[i], discord: { ok: true } });
      }
      return one(out);
    },
    rss: async (ctx) => {
      const r = await http(need(ctx.p("url"), "Feed URL")); if (!r.ok) throw apiError("RSS", r);
      return one(parseFeed(typeof r.data === "string" ? r.data : "").slice(0, Number(ctx.raw.max) || 5));
    },
    readSheet: async (ctx) => { let rows = await readCsv(ctx.p("source")); const n = Number(ctx.raw.max) || 0; if (n > 0) rows = rows.slice(0, n); return one(rows); },
    log: async (ctx) => { ctx.items.forEach((_, i) => ctx.log(s(ctx.p("message", i)))); return one(ctx.items); },
    respondWebhook: async (ctx) => { ctx.respond({ status: Number(ctx.raw.status) || 200, body: ctx.p("body", 0) }); return one(ctx.items); },
  };
  function test(a, op, b) {
    const as = s(typeof a === "object" && a !== null ? JSON.stringify(a) : a), bs = s(b);
    switch (op) {
      case "equals": return as === bs; case "not equals": return as !== bs;
      case "contains": return as.toLowerCase().includes(bs.toLowerCase()); case "not contains": return !as.toLowerCase().includes(bs.toLowerCase());
      case "greater than": return Number(a) > Number(b); case "less than": return Number(a) < Number(b);
      case "is empty": return as.trim() === "" || as === "[]" || as === "{}"; case "is not empty": return !(as.trim() === "" || as === "[]" || as === "{}");
      case "starts with": return as.startsWith(bs); case "ends with": return as.endsWith(bs);
      case "regex": return new RegExp(bs, "i").test(as); case "is true": return a === true || ["true", "1", "yes"].includes(as);
      default: throw new Error(`Unknown condition "${op}"`);
    }
  }
  const types = {};
  for (const m of META) {
    types[m.type] = Object.assign({}, m, {
      run: m.fullOnly && !["webhookTrigger", "folderTrigger", "respondWebhook"].includes(m.type)
        ? async () => { throw new Error(`${m.fullOnly} Download: github.com/shanir01/YantraFlow`); }
        : impl[m.type],
    });
  }
  // Expressions in the browser: {{ $json.title }}
  function evaluate(value, base) {
    if (typeof value !== "string" || value.indexOf("{{") < 0) return value;
    const now = new Date(); const pad = (n) => String(n).padStart(2, "0");
    const ctx = Object.assign({ $now: now.toISOString(), $today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, $time: `${pad(now.getHours())}:${pad(now.getMinutes())}` }, base);
    const keys = Object.keys(ctx); const vals = keys.map((k) => ctx[k]);
    const run = (code) => { try { return new Function(...keys, `"use strict"; return (${code});`)(...vals); } catch (e) { throw new Error(`Expression {{${code.trim()}}} failed: ${e.message}`); } };
    const one = value.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (one && one[1].indexOf("{{") < 0 && one[1].indexOf("}}") < 0) return run(one[1]);
    return value.replace(/\{\{([\s\S]+?)\}\}/g, (_, c) => { const v = run(c); return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); });
  }
  window.YFWeb = { types, evaluate, parseCsv };
})();

/* Browser (web edition) implementations of YantraFlow nodes.
   The full edition runs src/nodes.js on Node.js instead. */
(function () {
  "use strict";
  const META = window.YF_NODE_META;
  const AIM = window.YFAiModel || { pickModel: (b, m) => ({ model: (m == null ? "" : String(m)).trim() || "auto", extra: {} }), modelError: () => null };
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


  // ---- v4: link preview, uploads, AI helper
  const LP = window.YFLinkPreview; const YC = window.YFContent; const YV = window.YFVideo;
  const tgOk = (r) => r && r.ok && !(r.data && r.data.ok === false);
  const tgDesc = (r) => s(r && r.data && (r.data.description || r.data.error)) || s(r && r.data);
  async function tgCall(token, method, fields, file) {
    const url = `${window.YF_TELEGRAM_API || "https://api.telegram.org"}/bot${token}/${method}`;
    if (file) {
      // multipart/form-data is a "simple" CORS request too, so the browser can upload bytes to Telegram
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      fd.append(file.field, file.blob, file.name || "file");
      return http(url, { method: "POST", body: fd });
    }
    const form = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") form.set(k, typeof v === "object" ? JSON.stringify(v) : v);
    return http(url, { method: "POST", body: form });
  }
  const proxyOf = (settings) => s(((settings || {}).linkpreview || {}).proxyUrl).trim().replace(/\/+$/, "");
  /* Browsers can't read most pages (CORS), so the website asks a metadata service:
     1) your own Supabase Edge Function (Keys page) 2) microlink.io free API (no key, ~50/day) 3) YouTube oEmbed for YouTube links. */
  async function getPreview(url, settings) {
    url = s(url).trim(); if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const proxy = proxyOf(settings); const errs = [];
    if (proxy) {
      try { const r = await http(`${proxy}?url=${encodeURIComponent(url)}`); if (r.ok && r.data && !LP.looksEmpty(LP.fromService(r.data, url))) return LP.fromService(r.data, url); errs.push(`your proxy answered ${r.status}`); } catch (e) { errs.push("your proxy: " + e.message); }
    }
    try {
      const r = await http(`${window.YF_MICROLINK_API || "https://api.microlink.io"}/?url=${encodeURIComponent(url)}`);
      if (r.ok && r.data && r.data.status === "success") { const p = LP.fromService(r.data, url); if (!LP.looksEmpty(p) && !(LP.youtubeId(url) && /^\s*-?\s*YouTube\s*$/i.test(p.title))) return p; }
      errs.push(`microlink answered ${r.status}${r.data && r.data.message ? ": " + r.data.message : ""}`);
    } catch (e) { errs.push("microlink: " + e.message); }
    const yt = LP.youtubeId(url);
    if (yt) {
      try { const o = await http(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`); if (o.ok && o.data && o.data.title) return { url, canonicalUrl: url, title: o.data.title, description: o.data.author_name ? `by ${o.data.author_name}` : "", image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, siteName: "YouTube", type: "video", video: "" }; } catch (_) { /* */ }
      return { url, canonicalUrl: url, title: "", description: "", image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, siteName: "YouTube", type: "video", video: "" };
    }
    throw new Error(`Is link ka preview website se nahi mil paaya (${errs.join("; ")}). Free service ki daily limit khatam ho sakti hai — Keys page pe apna Supabase proxy URL daalo, ya PC/Termux version use karo (wahan koi limit nahi).`);
  }
  async function blobOf(r, url) {
    if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
    const blob = await r.blob();
    if (/text\/html/i.test(blob.type)) throw new Error("ye link web page hai, photo/video file nahi");
    let name = "file"; try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "file"); } catch (_) { /* */ }
    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4" }[blob.type] || "";
    if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += ext;
    return { blob, name: name.replace(/[^\w.\-]+/g, "_").slice(-80) };
  }
  async function downloadDirect(url) {
    let r; try { r = await fetch(url); } catch (_) { throw new Error(`browser is file ko download nahi kar sakta (${new URL(url).host} CORS block karta hai). Full version (PC/Termux) se bhejo, ya "Media sending" = url rakho.`); }
    return blobOf(r, url);
  }
  // photo bytes: direct, else your proxy, else images.weserv.nl (free image proxy, CORS-enabled, resizes to <=1280px jpg)
  async function downloadImage(url, settings) {
    try { return await downloadDirect(url); } catch (_) { /* try a proxy */ }
    const proxy = proxyOf(settings);
    const via = [];
    if (proxy) via.push(`${proxy}?image=1&url=${encodeURIComponent(url)}`);
    via.push(`${window.YF_IMAGE_PROXY || "https://images.weserv.nl"}/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}&w=1280&we&output=jpg`);
    let last = "";
    for (const u of via) { try { const f = await blobOf(await fetch(u), u); if (f.blob.size > 0) { f.name = "preview.jpg"; return f; } } catch (e) { last = e.message; } }
    throw new Error(`photo download nahi hui (${last})`);
  }
  async function stockSearch(ctx, q, src, orientation) {
    const pk = s(ctx.p("pexelsKey", 0) || (ctx.settings.pexels || {}).apiKey).trim(); const xk = s(ctx.p("pixabayKey", 0) || (ctx.settings.pixabay || {}).apiKey).trim();
    const list = []; const errs = [];
    if ((src === "auto" || src === "pexels") && pk) {
      const r = await http(`${window.YF_PEXELS_API || "https://api.pexels.com"}/videos/search?query=${encodeURIComponent(q)}&per_page=40&page=${1 + Math.floor(Math.random() * 3)}${orientation === "portrait" ? "&orientation=portrait" : ""}`, { headers: { authorization: pk } }).catch((e) => ({ ok: false, status: 0, data: e.message }));
      if (r.ok) list.push(...YV.normalizePexels(r.data)); else errs.push(apiError("Pexels", r).message);
    }
    if ((src === "auto" || src === "pixabay") && xk) {
      const r = await http(`${window.YF_PIXABAY_API || "https://pixabay.com"}/api/videos/?key=${encodeURIComponent(xk)}&q=${encodeURIComponent(q.slice(0, 100))}&per_page=50&safesearch=true`).catch((e) => ({ ok: false, status: 0, data: e.message }));
      if (r.ok) list.push(...YV.normalizePixabay(r.data)); else errs.push(apiError("Pixabay", r).message);
    }
    if (!pk && !xk && src !== "own") errs.push("Pexels / Pixabay key nahi hai — Keys page pe free key daalo (2 min ka kaam)");
    return { list, errs };
  }
  async function aiComplete(ctx, i, messages, opt) {
    const st = ctx.settings.ai || {};
    const base = s(ctx.p("baseUrl", i) || st.baseUrl || "http://localhost:8787/v1").replace(/\/+$/, "");
    const pick = AIM.pickModel(base, s(ctx.p("model", i) || st.model));
    const badM = AIM.badModel && AIM.badModel(base, pick.model); if (badM) throw new Error(badM);
    let r;
    try { r = await http(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s(ctx.p("apiKey", i) || st.apiKey || "local")}` }, body: JSON.stringify({ ...pick.extra, model: pick.model, messages, temperature: (opt && opt.temperature) ?? 0.9, max_tokens: (opt && opt.maxTokens) || 900 }) }); }
    catch (e) { throw new Error(`Could not reach the AI at ${base}. Keys page pe online AI Base URL + key daalo (e.g. https://api.groq.com/openai/v1).`); }
    if (!r.ok) { const e = apiError("AI", r); const f = AIM.modelError(base, pick.model, r.status, e.message.replace(/^AI answered \d+: /, "")); throw f ? new Error(f) : e; }
    const c = r.data && r.data.choices && r.data.choices[0];
    return { text: s(c && c.message && c.message.content).trim(), model: (r.data && r.data.model) || pick.model };
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
        const greetOn = ctx.raw.timeGreeting === "on"; const HK = "yf_" + (window.YF_NS || "") + "posthist";
        let hall = {}; if (greetOn) { try { hall = JSON.parse(localStorage.getItem(HK) || "{}"); } catch (_) { hall = {}; } }
        const hkey = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${(ctx.node && ctx.node.id) || "n"}`; const hrec = hall[hkey] || { posts: [] };
        const greet = greetOn ? YC.greetingFor(hrec.posts) : null;
        const messages = []; const sys = [s(ctx.p("system", i)), greet ? YC.greetingSystem(greet, hrec.posts) : ""].filter(Boolean).join("\n"); if (sys) messages.push({ role: "system", content: sys });
        messages.push({ role: "user", content: need(ctx.p("prompt", i), "Prompt") });
        const pick = AIM.pickModel(base, s(ctx.p("model", i) || st.model));
        const badM = AIM.badModel && AIM.badModel(base, pick.model); if (badM) throw new Error(badM);
        let r;
        try {
          r = await http(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s(ctx.p("apiKey", i) || st.apiKey || "local")}` }, body: JSON.stringify({ ...pick.extra, model: pick.model, messages, temperature: Number(ctx.raw.temperature ?? 0.7), max_tokens: Number(ctx.raw.maxTokens) || 500 }) });
        } catch (e) { throw new Error(`Could not reach the AI at ${base}. Start FreeLLM-Router on this device, or set an online OpenAI-compatible Base URL + key on the Keys page (e.g. https://api.groq.com/openai/v1).`); }
        if (!r.ok) { const e = apiError("AI", r); const f = AIM.modelError(base, pick.model, r.status, e.message.replace(/^AI answered \d+: /, "")); throw f ? new Error(f) : e; }
        const c = r.data && r.data.choices && r.data.choices[0];
        let text = s(c && c.message && c.message.content).trim();
        if (greet && text) { text = YC.ensureGreeting(text, greet.slot, greet); hrec.posts = YC.pushHistory(hrec.posts, { text, at: new Date().toISOString() }, 20); hall[hkey] = hrec; try { localStorage.setItem(HK, JSON.stringify(hall)); } catch (_) { /* */ } }
        out.push({ ...ctx.items[i], text, model: (r.data && r.data.model) || pick.model, usage: (r.data && r.data.usage) || null, ...(greet ? { timeOfDay: greet.slot } : {}) });
      }
      return one(out);
    },
    telegram: async (ctx) => {
      const st = ctx.settings.telegram || {}; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const token = need(ctx.p("botToken", i) || st.botToken, "Telegram bot token"); const chatId = need(ctx.p("chatId", i) || st.chatId, "Telegram chat ID");
        const op = ctx.raw.operation || "text"; const pm = ctx.raw.parseMode && ctx.raw.parseMode !== "none" ? ctx.raw.parseMode : undefined;
        const mode = ctx.raw.upload || "auto";
        let text = s(ctx.p("text", i)); let r; let via = "api"; let preview;
        if (op === "text") r = await tgCall(token, "sendMessage", { chat_id: chatId, text: need(text, "Text").slice(0, 4096), parse_mode: pm });
        else if (op === "linkPreview") {
          const link = need(ctx.p("link", i) || ctx.items[i].url || ctx.items[i].link, "Link");
          const it = ctx.items[i];
          preview = it.title && (it.url === link || it.link === link) && it.image !== undefined ? it : await getPreview(link, ctx.settings);
          preview = Object.assign({}, preview, { url: link });
          const own = text.trim() && text.trim() !== "Hello from YantraFlow 🚀";
          const capPm = own ? pm : "HTML";
          r = null;
          if (preview.image) {
            try { const f = await downloadImage(preview.image, ctx.settings); r = await tgCall(token, "sendPhoto", { chat_id: chatId, caption: own ? text.slice(0, 1024) : LP.caption(preview, 1024), parse_mode: capPm }, { field: "photo", blob: f.blob, name: f.name }); via = "photo-upload"; }
            catch (e) { ctx.log(`Preview photo could not be loaded (${e.message}) — sending text + link preview instead`); }
            if (r && !tgOk(r)) { ctx.log(`Telegram refused the photo (${tgDesc(r)}) — sending text + link preview instead`); r = null; }
          }
          if (!r) { r = await tgCall(token, "sendMessage", { chat_id: chatId, text: own ? text.slice(0, 4096) : LP.caption(preview, 4096), parse_mode: capPm, link_preview_options: { url: link, prefer_large_media: true, show_above_text: true } }); via = "message+preview"; }
        } else {
          const media = need(ctx.p("media", i), "Media URL");
          const method = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument" }[op];
          const fields = { chat_id: chatId, caption: text.slice(0, 1024) || undefined, parse_mode: pm };
          const made = window.YFVideoWeb && window.YFVideoWeb.get(media);
          if (made) { r = await tgCall(token, method, Object.assign({}, fields, op === "video" ? { supports_streaming: true } : {}), { field: op, blob: made.blob, name: `yantraflow-video.${made.ext || "mp4"}` }); via = "upload"; }
          else if (!/^https?:\/\//.test(media)) throw new Error("Web version can send media by link only (or a video made by Auto Video Maker). Local files need the full version (PC/Termux).");
          if (made) { /* sent */ } else if (mode !== "upload") { r = await tgCall(token, method, { ...fields, [op]: media }); via = "url"; }
          if (!made && (mode === "upload" || (mode === "auto" && !tgOk(r) && r.status === 400 && LP.TG_URL_FAIL.test(tgDesc(r))))) {
            const f = op === "photo" ? await downloadImage(media, ctx.settings) : await downloadDirect(media);
            r = await tgCall(token, method, fields, { field: op, blob: f.blob, name: f.name }); via = "upload";
          }
        }
        if (!tgOk(r)) {
          const d = tgDesc(r);
          if (LP.TG_URL_FAIL.test(d)) throw new Error(`Telegram answered ${r.status}: ${d}. Telegram ye link khol nahi paaya — "Media sending" = upload rakho, ya direct photo/video file ka link do (web page ka nahi).`);
          throw apiError("Telegram", r);
        }
        out.push({ ...ctx.items[i], ...(preview ? { preview } : {}), telegram: { ok: true, messageId: r.data.result && r.data.result.message_id, via } });
      }
      return one(out);
    },
    linkPreview: async (ctx) => {
      const out = [];
      for (let i = 0; i < ctx.items.length; i++) { const p = await getPreview(need(ctx.p("url", i), "Link"), ctx.settings); out.push({ ...ctx.items[i], ...p, link: p.url }); }
      return one(out);
    },
    aiPost: async (ctx) => {
      const KEY = "yf_" + (window.YF_NS || "") + "posthist";
      let all = {}; try { all = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) { all = {}; }
      const key = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${ctx.node.id}`;
      const rec = all[key] || { posts: [], mediaIndex: 0 }; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const platform = ctx.raw.platform || "telegram";
        const lang = { Hinglish: "Hinglish (Hindi in English letters, simple words)", Hindi: "Hindi (Devanagari)", English: "simple English" }[ctx.raw.language] || ctx.raw.language;
        let res; let similarity = 0; let tries = 0;
        const greeting = (ctx.raw.timeGreeting || "on") !== "off" ? Object.assign(YC.timeOfDay(new Date(), "Asia/Kolkata"), YC.pickGreeting(YC.timeOfDay(new Date(), "Asia/Kolkata").slot, rec.posts, Date.now())) : null;
        if ((ctx.raw.autoGenerate || "on") === "off") res = { text: need(ctx.p("fixedText", i), "Fixed message") };
        else {
          let avoid = "";
          for (tries = 1; tries <= 2; tries++) {
            const msgs = YC.buildMessages({ platform, seed: ctx.p("seed", i), topic: s(ctx.p("topic", i)), language: lang, tone: s(ctx.p("tone", i)), history: rec.posts, avoid, greeting });
            const ai = await aiComplete(ctx, i, msgs, { temperature: tries === 1 ? 0.9 : 1.1, maxTokens: platform === "x" ? 300 : 1200 });
            res = YC.parseOutput(platform, ai.text); res.model = ai.model;
            if (greeting && platform !== "youtube" && res.text) res.text = YC.ensureGreeting(res.text, greeting.slot, greeting);
            if (!res.text) throw new Error("AI ne khaali jawab diya — Keys page pe AI model check karo");
            similarity = YC.maxSimilarity(res.text, rec.posts);
            if (similarity < YC.REPEAT_LIMIT) break;
            avoid = res.text;
          }
        }
        const pmd = YC.pickMedia(ctx.p("mediaList", i), rec.mediaIndex); if (pmd.total) rec.mediaIndex = pmd.index + 1;
        rec.posts = YC.pushHistory(rec.posts, { text: res.text, at: new Date().toISOString() }, Number(ctx.raw.history) || 20);
        const credit = s(ctx.items[i].credit);
        if (credit && res.text && platform !== "x") { res.description = YV.addCredit(res.description || "", credit); if (platform !== "youtube") res.text = YV.addCredit(res.text, credit); }
        if (platform === "video") res.caption = res.text;
        out.push({ ...ctx.items[i], ...res, platform, topicUsed: s(ctx.p("topic", i)), timeOfDay: greeting ? greeting.slot : "", media: pmd.media || ctx.items[i].media || "", seedUsed: !!s(ctx.p("seed", i)).trim(), repeatCheck: { similarity, tries, remembered: rec.posts.length } });
      }
      all[key] = rec; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* storage full */ }
      return one(out);
    },

    /* ---- v4.3 video: free-licence finder, Auto Video Maker, Video Editor, YouTube upload from the browser */
    stockVideo: async (ctx) => {
      const KEY = "yf_" + (window.YF_NS || "") + "videohist"; let all = {}; try { all = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) { all = {}; }
      const key = `${(ctx.workflow && ctx.workflow.id) || "wf"}:${ctx.node.id}`; const rec = all[key] || { used: [] }; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const topic = s(ctx.p("topic", i)).trim() || "funny animals"; const q = YV.stockQuery(topic); const src = ctx.raw.source || "auto";
        const opt = { used: rec.used, minSeconds: Number(ctx.raw.minSeconds) || 0, maxSeconds: Number(ctx.raw.maxSeconds) || 60, orientation: ctx.raw.orientation || "portrait" };
        const found = src === "own" ? { list: [], errs: [] } : await stockSearch(ctx, q, src, opt.orientation);
        let clip = YV.pickClip(found.list, opt);
        if (!clip && found.list.length && rec.used.length) { rec.used = []; clip = YV.pickClip(found.list, Object.assign(opt, { used: [] })); }
        if (!clip) { const own = YV.ownClips(ctx.p("ownClips", i)).filter((c) => /^https?:/i.test(c.url)); clip = own.length ? own[Math.floor(Math.random() * own.length)] : null; }
        if (!clip) {
          const why = found.errs.join(" · ") || `"${q}" ke liye koi naya video nahi mila`;
          if ((ctx.raw.fallback || "maker") === "error") throw new Error(why);
          ctx.log(`No free video found (${why}) — Auto Video Maker will make one`);
          out.push({ ...ctx.items[i], topic, query: q, media: "", needsMaker: true, videoSource: "none", fallbackReason: why }); continue;
        }
        rec.used = rec.used.concat([clip.id]).slice(-300);
        out.push({ ...ctx.items[i], topic, query: q, media: clip.url, videoUrl: /^https:/i.test(clip.url) ? clip.url : "", credit: YV.creditLine(clip), videoSource: clip.source,
          videoInfo: [clip.tags, clip.author && `by ${clip.author}`].filter(Boolean).join(", "), clip: { id: clip.id, page: clip.pageUrl, author: clip.author, license: clip.license, seconds: clip.duration, width: clip.width, height: clip.height } });
      }
      all[key] = rec; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* */ }
      return one(out);
    },
    videoMaker: async (ctx) => {
      const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const it = ctx.items[i]; const mode = ctx.raw.mode || "auto"; const incoming = s(it.videoFile || it.media || it.path);
        if (mode === "off") { out.push({ ...it }); continue; }
        if (mode === "own" || (mode === "auto" && !it.needsMaker && YV.looksVideo(incoming))) { if (!incoming) throw new Error("Video source = own, par koi video link nahi mila"); out.push({ ...it, media: incoming, videoBy: "own" }); continue; }
        if (!window.YFVideoWeb) throw new Error("Video maker is page me load nahi hua — page refresh karo");
        const planInput = { script: s(ctx.p("script", i)), title: s(ctx.p("title", i)), seconds: Number(ctx.p("seconds", i)) || 0, theme: ctx.raw.theme, size: ctx.raw.size, cta: s(ctx.p("cta", i)), watermark: s(ctx.p("watermark", i)) };
        if (!YV.splitScript(planInput.script).length && !planInput.title.trim()) throw new Error("Video ke liye text khaali hai — pehle AI Post Writer step lagao ya 'Video text' bharo");
        const plan = YV.planVideo(planInput);
        let bg = { type: "gradient", urls: [] }; let credit = "";
        const bgMode = ctx.raw.background || "auto";
        const photos = YV.ownClips(ctx.p("photos", i)).map((c) => c.url).filter((u) => /^https?:|^blob:/i.test(u));
        if (/\.(jpe?g|png|webp)(\?|$)/i.test(incoming) && !photos.length) photos.push(incoming);
        if ((bgMode === "photos" || bgMode === "auto") && photos.length) bg = { type: YV.looksVideo(photos[0]) ? "video" : "image", urls: photos };
        else if (bgMode === "stock" || bgMode === "auto") {
          const f = await stockSearch(ctx, YV.stockQuery(s(ctx.p("bgQuery", i)) || plan.title || "abstract"), "auto", "portrait");
          const clip = YV.pickClip(f.list, { minSeconds: 4, maxSeconds: 120 });
          if (clip) { bg = { type: "video", urls: [clip.url] }; credit = YV.creditLine(clip); }
          else if (bgMode === "stock") throw new Error(f.errs.join(" · ") || "Stock clip nahi mila");
        }
        if (ctx.raw.voice && ctx.raw.voice !== "off") ctx.log("AI voice website pe nahi lagti (browser limit) — PC/Termux version me edge-tts voice milti hai. Music ke saath video ban rahi hai.");
        const music = ctx.raw.music === "off" ? "off" : ctx.raw.music === "file" ? s(ctx.p("musicFile", i)) || "generated" : "generated";
        ctx.log(`Video record ho rahi hai (${plan.duration}s) — tab khula rakho`);
        const r = await window.YFVideoWeb.render({ plan, bg, music });
        const ref = window.YFVideoWeb.put(r.blob, { ext: r.ext, seconds: r.seconds });
        const res = { ...it, media: ref, videoFile: ref, videoType: r.ext, videoSeconds: r.seconds, videoBytes: r.bytes, videoPreview: window.YFVideoWeb.get(ref).url, videoBy: "YantraFlow Auto Video Maker (website)", needsMaker: false };
        if (credit) { res.credit = YV.addCredit(s(it.credit), credit); res.description = YV.addCredit(s(it.description), credit); }
        if (r.ext !== "mp4") ctx.log("Is browser ne WebM banaya — Telegram + YouTube le lete hain; Instagram ke liye MP4 chahiye (PC/Termux version ya naya Chrome).");
        out.push(res);
      }
      return one(out);
    },
    videoEdit: async (ctx) => {
      const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const it = ctx.items[i]; const input = s(ctx.p("input", i)).trim();
        if (!input) { ctx.log("No video to edit — passing through"); out.push({ ...it }); continue; }
        const made = window.YFVideoWeb && window.YFVideoWeb.get(input);
        const src = made ? made.url : input;
        if (!/^https?:|^blob:/i.test(src)) throw new Error("Website pe sirf video link edit hota hai — file ke liye PC/Termux version");
        if ((ctx.raw.translate || "captions") !== "off") ctx.log("English -> Hindi captions/dub sirf PC/Termux version me (website pe awaaz sunke translate nahi hota). Baaki editing ho rahi hai.");
        let r;
        try { r = await window.YFVideoWeb.render({ edit: { clip: src, hook: s(ctx.p("hook", i)), cta: s(ctx.p("cta", i)), watermark: s(ctx.p("watermark", i)), maxSeconds: Number(ctx.raw.maxSeconds) || 59, speed: Number(ctx.raw.speed) || 1, theme: ctx.raw.theme }, music: ctx.raw.music === "generated" ? "generated" : ctx.raw.music === "file" ? s(ctx.p("musicFile", i)) : "off" }); }
        catch (e) { ctx.log(`Edit skipped (${e.message}) — original clip jayegi`); out.push({ ...it }); continue; }
        const ref = window.YFVideoWeb.put(r.blob, { ext: r.ext, seconds: r.seconds });
        out.push({ ...it, media: ref, videoFile: ref, videoType: r.ext, videoSeconds: r.seconds, videoPreview: window.YFVideoWeb.get(ref).url, edited: { web: true, captions: 0, dubbed: false } });
      }
      return one(out);
    },
    youtube: async (ctx) => {
      const st = ctx.settings.youtube || {}; const out = [];
      for (let i = 0; i < ctx.items.length; i++) {
        const file = need(ctx.p("file", i), "Video");
        const made = window.YFVideoWeb && window.YFVideoWeb.get(file);
        let blob;
        if (made) blob = made.blob;
        else if (/^https?:/i.test(file)) blob = (await downloadDirect(file)).blob;
        else throw new Error("Website se YouTube pe Auto Video Maker wali video ya direct video link hi jaata hai. Phone/PC ki file ke liye PC/Termux version.");
        const tok = await http(window.YF_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: need(st.clientId, "YouTube client ID"), client_secret: need(st.clientSecret, "YouTube client secret"), refresh_token: need(st.refreshToken, "YouTube refresh token"), grant_type: "refresh_token" }) });
        if (!tok.ok || !tok.data || !tok.data.access_token) throw apiError("Google login", tok);
        let tags = ctx.p("tags", i); tags = Array.isArray(tags) ? tags : s(tags).split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
        const meta = { snippet: { title: need(ctx.p("title", i), "Title").slice(0, 100), description: s(ctx.p("description", i)).slice(0, 5000), tags: tags.slice(0, 30), categoryId: s(ctx.raw.categoryId || "22") }, status: { privacyStatus: ctx.raw.privacy || "private", selfDeclaredMadeForKids: false } };
        const UP = window.YF_YOUTUBE_UPLOAD || "https://www.googleapis.com/upload/youtube/v3/videos";
        let init; try { init = await fetch(`${UP}?uploadType=resumable&part=snippet,status`, { method: "POST", headers: { authorization: `Bearer ${tok.data.access_token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": blob.type || "video/*", "x-upload-content-length": String(blob.size) }, body: JSON.stringify(meta) }); }
        catch (e) { throw new Error("YouTube tak browser nahi pahunch paaya: " + e.message); }
        if (!init.ok) throw apiError("YouTube (start upload)", { status: init.status, data: await init.text().then((t) => { try { return JSON.parse(t); } catch (_) { return t; } }) });
        const loc = init.headers.get("location"); if (!loc) throw new Error("YouTube did not return an upload URL (browser ko 'location' header nahi mila) — PC/Termux version se upload karo");
        const up = await http(loc, { method: "PUT", headers: { "content-type": blob.type || "video/*" }, body: blob });
        if (!up.ok) throw apiError("YouTube (upload)", up);
        const yt = { ok: true, videoId: up.data.id, url: `https://youtu.be/${up.data.id}`, privacy: meta.status.privacyStatus, from: "website" };
        const cm = s(ctx.p("firstComment", i)).trim();
        if (cm) { const r2 = await http(`${window.YF_YOUTUBE_API || "https://www.googleapis.com/youtube/v3"}/commentThreads?part=snippet`, { method: "POST", headers: { authorization: `Bearer ${tok.data.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ snippet: { videoId: up.data.id, topLevelComment: { snippet: { textOriginal: cm } } } }) }).catch((e) => ({ ok: false, data: e.message })); if (r2.ok) yt.commentId = r2.data && r2.data.id; else { yt.commentError = apiError("YouTube (comment)", r2).message; ctx.log("Upload done, first comment failed (needs youtube.force-ssl scope)"); } }
        out.push({ ...ctx.items[i], youtube: yt });
      }
      return one(out);
    },
    instagram: async (ctx) => {
      const st = ctx.settings.instagram || {}; const out = []; const G = "https://graph.facebook.com/v21.0";
      for (let i = 0; i < ctx.items.length; i++) {
        const uid = need(ctx.p("userId", i) || st.userId, "Instagram user ID"); const token = need(ctx.p("accessToken", i) || st.accessToken, "Instagram access token");
        const url = need(ctx.p("mediaUrl", i), "Media URL");
        if (/^yfvideo:/.test(url)) throw new Error("Website pe bani video Instagram ko seedha nahi ja sakti — Instagram ko PUBLIC https link chahiye. Free Video Finder wala Pexels/Pixabay link seedha jaata hai; apni banayi video ke liye PC/Termux version (wo file khud upload karta hai).");
        if (!/^https:\/\//.test(url)) throw new Error("Instagram needs a PUBLIC https:// media URL.");
        const kind = ctx.raw.kind || "REELS"; const p = new URLSearchParams({ caption: s(ctx.p("caption", i)).slice(0, 2200), access_token: token });
        if (kind === "IMAGE") p.set("image_url", url); else { p.set("media_type", "REELS"); p.set("video_url", url); }
        const c = await http(`${G}/${uid}/media`, { method: "POST", body: p }); if (!c.ok) throw apiError("Instagram (create)", c);
        for (let k = 0; k < 60; k++) { const q = await http(`${G}/${c.data.id}?fields=status_code&access_token=${encodeURIComponent(token)}`); const code = q.data && q.data.status_code; if (code === "FINISHED" || (kind === "IMAGE" && !code)) break; if (code === "ERROR") throw new Error("Instagram could not process the media"); await sleep(5000); }
        const pub = await http(`${G}/${uid}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.data.id, access_token: token }) }); if (!pub.ok) throw apiError("Instagram (publish)", pub);
        const ig = { ok: true, mediaId: pub.data.id };
        const cm = s(ctx.p("firstComment", i)).trim();
        if (cm) { const r2 = await http(`${G}/${pub.data.id}/comments`, { method: "POST", body: new URLSearchParams({ message: cm.slice(0, 2200), access_token: token }) }).catch((e) => ({ ok: false, data: e.message })); if (r2.ok) ig.commentId = r2.data && r2.data.id; else { ig.commentError = apiError("Instagram (comment)", r2).message; ctx.log("Post done, first comment failed"); } }
        out.push({ ...ctx.items[i], instagram: ig });
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
  window.YFWeb = { types, evaluate, parseCsv, getPreview, downloadImage };
})();

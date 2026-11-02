/* YantraFlow v4.5 — extra nodes shared by the browser (web edition) and Node.js (PC/Termux).
   Each node: meta (label, group, icon, fields) + run(ctx, H). H = host helpers:
   H.http(url, opts) -> { status, ok, data } · H.apiError(name, r) · H.ai(ctx, i, messages, opt) -> { text }
   H.mem -> { get(key), set(key, value) } · H.parseFeed(xml) · H.edition ("web" | "full") · H.exec(cmd, opts) (PC only)
   H.askForm(def) (browser only: shows a form and resolves with the values). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFExtraNodes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const s = (v) => (v === undefined || v === null ? "" : String(v));
  const one = (items) => [items];
  const need = (v, what) => { if (!s(v).trim()) throw new Error(`${what} is empty. Node me bharo (ya Keys page pe).`); return s(v).trim(); };
  const CRED = "(blank = use Keys page)";
  const AI_FIELDS = [
    { key: "model", label: "Model " + CRED, type: "text", default: "" },
    { key: "baseUrl", label: "Base URL " + CRED, type: "text", default: "" },
    { key: "apiKey", label: "API key " + CRED, type: "secret", default: "" },
  ];
  function getDeep(o, path) { if (!path) return o; return s(path).split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setDeep(o, key, val) { const p = s(key).split("."); for (let i = 0; i < p.length - 1; i++) { if (typeof o[p[i]] !== "object" || !o[p[i]]) o[p[i]] = {}; o = o[p[i]]; } o[p[p.length - 1]] = val; }
  const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));

  // ---------- pure helpers (exported for tests)
  function toCsv(items, cols) {
    const keys = cols && cols.length ? cols : [...new Set(items.flatMap((it) => Object.keys(it || {})))];
    const q = (v) => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return [keys.join(","), ...items.map((it) => keys.map((k) => q((it || {})[k])).join(","))].join("\n");
  }
  function parseCsvText(text) {
    const rows = []; let row = []; let cur = ""; let q = false; text = s(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; } else cur += ch; }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!clean.length) return [];
    const head = clean[0].map((h, i) => h.trim() || `col${i + 1}`);
    return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
  }
  function textOp(op, text, a, b) {
    const t = s(text);
    switch (op) {
      case "upper": return t.toUpperCase();
      case "lower": return t.toLowerCase();
      case "trim": return t.trim();
      case "title case": return t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
      case "replace": return a ? t.split(a).join(s(b)) : t;
      case "regex extract": { const m = t.match(new RegExp(a, "i")); return m ? (m[1] !== undefined ? m[1] : m[0]) : ""; }
      case "split": return t.split(a || ",").map((x) => x.trim()).filter(Boolean);
      case "length": return t.length;
      case "word count": return t.trim() ? t.trim().split(/\s+/).length : 0;
      case "truncate": { const n = Number(a) || 100; return t.length > n ? t.slice(0, Math.max(0, n - 1)).trimEnd() + "…" : t; }
      case "slug": return t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      case "remove emoji": return t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
      case "hashtags": return (t.match(/#[\p{L}\p{N}_]+/gu) || []);
      case "urls": return (t.match(/https?:\/\/[^\s"'<>]+/g) || []);
      default: throw new Error(`Unknown text operation "${op}"`);
    }
  }
  const UNIT_MS = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
  function fmtDate(d, fmt, tz) {
    const parts = {}; const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long", hourCycle: "h23" });
    for (const p of f.formatToParts(d)) parts[p.type] = p.value;
    const map = { YYYY: parts.year, MM: parts.month, DD: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second, dddd: parts.weekday };
    return s(fmt || "YYYY-MM-DD HH:mm").replace(/YYYY|dddd|MM|DD|HH|mm|ss/g, (k) => map[k]);
  }
  function dateOp(op, value, amount, unit, fmt, tz, now) {
    const base = value ? new Date(isNaN(Number(value)) ? value : Number(value)) : new Date(now || Date.now());
    if (isNaN(base.getTime())) throw new Error(`"${value}" date samajh nahi aaya. Example: 2026-11-03T09:00:00+05:30`);
    const ms = (Number(amount) || 0) * (UNIT_MS[unit] || UNIT_MS.days);
    if (op === "now" || op === "format") return { iso: base.toISOString(), text: fmtDate(base, fmt, tz), unix: Math.floor(base.getTime() / 1000) };
    if (op === "add" || op === "subtract") { const d = new Date(base.getTime() + (op === "add" ? ms : -ms)); return { iso: d.toISOString(), text: fmtDate(d, fmt, tz), unix: Math.floor(d.getTime() / 1000) }; }
    if (op === "difference") { const other = new Date(now || Date.now()); const diff = other.getTime() - base.getTime(); return { ms: diff, value: Math.round((diff / (UNIT_MS[unit] || UNIT_MS.days)) * 100) / 100, unit: unit || "days" }; }
    throw new Error(`Unknown date operation "${op}"`);
  }
  // safe calculator for the AI agent (numbers, + - * / % ^ ( ) and Math functions only)
  function calc(expr) {
    const e = s(expr).replace(/\^/g, "**");
    if (!/^[\d\s+\-*/%.()e,]*$/i.test(e.replace(/\b(sqrt|abs|round|floor|ceil|min|max|pow|log|sin|cos|tan|PI)\b/g, ""))) throw new Error("calculator: sirf numbers aur + - * / ( ) allowed");
    // eslint-disable-next-line no-new-func
    const v = Function("M", `"use strict"; const {sqrt,abs,round,floor,ceil,min,max,pow,log,sin,cos,tan,PI}=M; return (${e});`)(Math);
    if (typeof v !== "number" || !isFinite(v)) throw new Error("calculator: result is not a number");
    return v;
  }
  function parseAgentReply(text) {
    const t = s(text).trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { const j = JSON.parse(m[0]); if (j && (j.tool || j.final !== undefined)) return j; } catch (_) { /* not json */ } }
    return { final: t };
  }
  function batches(items, size) { const n = Math.max(1, Number(size) || 1); const out = []; for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n)); return out; }
  function formFields(spec) {
    return s(spec).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, label, type, req] = l.split("|").map((x) => x.trim());
      return { name: name.replace(/[^\w]/g, "_"), label: label || name, type: ["text", "number", "email", "textarea", "date", "url"].includes(type) ? type : "text", required: /^(req|required|yes|\*)$/i.test(req || "") };
    });
  }
  function waLink(phone, text) {
    const p = s(phone).replace(/[^\d]/g, "");
    return `https://wa.me/${p}${text ? "?text=" + encodeURIComponent(s(text)) : ""}`;
  }

  async function aiEach(ctx, H, build, opt) {
    const out = [];
    for (let i = 0; i < ctx.items.length; i++) {
      const msgs = build(i);
      const r = await H.ai(ctx, i, msgs, Object.assign({ temperature: 0.3, maxTokens: 700 }, opt || {}));
      out.push({ item: ctx.items[i], text: r.text, model: r.model });
    }
    return out;
  }

  const DEFS = [
    // ===================== Trigger
    {
      type: "rssTrigger", label: "RSS New Item", group: "Trigger", icon: "rss", color: "#22c55e", inputs: 0, trigger: "poll",
      description: "Feed me naya post aate hi chalta hai (blog, YouTube channel, news).",
      params: [
        { key: "url", label: "Feed URL", type: "text", default: "https://hnrss.org/frontpage", placeholder: "https://www.youtube.com/feeds/videos.xml?channel_id=…" },
        { key: "minutes", label: "Check every N minutes", type: "number", default: 10 },
      ],
      pollEverySeconds: (raw) => Math.max(60, (Number(raw.minutes) || 10) * 60),
      async poll(ctx, state, H) {
        const r = await H.http(need(ctx.raw.url, "Feed URL")); if (!r.ok) throw H.apiError("RSS", r);
        const items = H.parseFeed(typeof r.data === "string" ? r.data : "");
        const key = (it) => s(it.guid || it.link || it.title);
        const seen = new Set(state.seen || []);
        const fresh = state.initialized ? items.filter((it) => !seen.has(key(it))) : [];
        state.initialized = true; state.seen = items.map(key).concat([...seen]).slice(0, 300);
        return fresh;
      },
      async run(ctx, H) {
        if (ctx.pollItems) return one(ctx.pollItems);
        const r = await H.http(need(ctx.p("url"), "Feed URL")); if (!r.ok) throw H.apiError("RSS", r);
        return one(H.parseFeed(typeof r.data === "string" ? r.data : "").slice(0, 1));
      },
    },
    {
      type: "telegramTrigger", label: "Telegram Message", group: "Trigger", icon: "telegram", color: "#22c55e", inputs: 0, trigger: "poll",
      description: "Tumhare bot ko koi message bheje to chalta hai (auto-reply bots ke liye).",
      params: [
        { key: "botToken", label: "Bot token " + CRED, type: "secret", default: "" },
        { key: "minutes", label: "Check every N minutes (website: tab khula rahe)", type: "number", default: 1 },
        { key: "onlyText", label: "Sirf text messages", type: "boolean", default: true },
      ],
      pollEverySeconds: (raw) => Math.max(30, (Number(raw.minutes) || 1) * 60),
      async poll(ctx, state, H) {
        const token = need(ctx.raw.botToken || (ctx.settings.telegram || {}).botToken, "Telegram bot token");
        const base = H.telegramApi ? H.telegramApi() : "https://api.telegram.org";
        const r = await H.http(`${base}/bot${token}/getUpdates?timeout=0&offset=${(state.offset || 0) + 1}`);
        if (!r.ok) throw H.apiError("Telegram", r);
        const ups = (r.data && r.data.result) || [];
        const first = !state.initialized; state.initialized = true;
        for (const u of ups) state.offset = Math.max(state.offset || 0, u.update_id);
        if (first) return [];
        return ups.map(tgItem).filter((x) => x && (!(ctx.raw.onlyText !== false && ctx.raw.onlyText !== "false") || x.text));
      },
      async run(ctx, H) {
        if (ctx.pollItems) return one(ctx.pollItems);
        const token = need(ctx.p("botToken") || (ctx.settings.telegram || {}).botToken, "Telegram bot token");
        const base = H.telegramApi ? H.telegramApi() : "https://api.telegram.org";
        const r = await H.http(`${base}/bot${token}/getUpdates?timeout=0&limit=100`);
        if (!r.ok) throw H.apiError("Telegram", r);
        const ups = ((r.data && r.data.result) || []).map(tgItem).filter(Boolean);
        return one(ups.length ? ups.slice(-1) : [{ text: "hello (test — bot ko abhi koi message nahi mila)", chatId: "", from: "test", test: true }]);
      },
    },
    {
      type: "formTrigger", label: "Form Submit", group: "Trigger", icon: "clipboard-list", color: "#22c55e", inputs: 0, trigger: "form",
      description: "Form bharte hi chalta hai. Website: Run dabao to form khulta hai. PC: http://localhost:5679/form/<path> link share karo.",
      params: [
        { key: "title", label: "Form title", type: "text", default: "Contact form" },
        { key: "fields", label: "Fields (one per line: name | Label | type | required)", type: "textarea", default: "name | Aapka naam | text | required\nphone | Mobile number | text\nmessage | Message | textarea", help: "type: text, number, email, textarea, date, url" },
        { key: "path", label: "Path (PC form link)", type: "text", default: "contact" },
      ],
      async run(ctx, H) {
        if (ctx.webhook) return one([Object.assign({ submittedAt: new Date().toISOString() }, ctx.webhook.body || {})]);
        const fields = formFields(ctx.raw.fields);
        if (H.askForm) { const v = await H.askForm({ title: s(ctx.raw.title), fields }); return one([Object.assign({ submittedAt: new Date().toISOString() }, v)]); }
        return one([Object.assign({ submittedAt: new Date().toISOString(), test: true }, Object.fromEntries(fields.map((f) => [f.name, f.type === "number" ? 1 : `test ${f.name}`])))]);
      },
    },
    // ===================== Core
    {
      type: "execCommand", label: "Run Command (terminal)", group: "Core", icon: "square-terminal", color: "#3b82f6",
      fullOnly: "Command sirf PC/Termux pe chal sakta hai (browser shell nahi chala sakta).",
      description: "PC/Termux pe shell command chalao (git pull, ffmpeg, python script…). Output agle node ko milta hai.",
      params: [
        { key: "command", label: "Command", type: "text", default: "echo Hello from YantraFlow", placeholder: "python3 myscript.py {{ $json.name }}" },
        { key: "timeout", label: "Timeout (seconds)", type: "number", default: 120 },
        { key: "failOnError", label: "Exit code 0 na ho to fail", type: "boolean", default: true },
      ],
      async run(ctx, H) {
        if (!H.exec) throw new Error("Run Command sirf PC/Termux version me chalta hai.");
        const out = [];
        for (let i = 0; i < ctx.items.length; i++) {
          const r = await H.exec(need(ctx.p("command", i), "Command"), { timeoutMs: Math.min(3600, Number(ctx.raw.timeout) || 120) * 1000 });
          if (r.code !== 0 && ctx.raw.failOnError !== false && ctx.raw.failOnError !== "false") throw new Error(`Command exit code ${r.code}: ${s(r.stderr || r.stdout).slice(-400)}`);
          out.push({ stdout: r.stdout, stderr: r.stderr, code: r.code });
        }
        return one(out);
      },
    },
    // ===================== Flow
    {
      type: "merge", label: "Merge", group: "Flow", icon: "git-merge", color: "#a855f7",
      description: "Kai raste (arrows) ko jodo: sab items ek list me, ya sab fields ek item me.",
      params: [{ key: "mode", label: "Mode", type: "select", options: ["append", "combine into one item", "list in one item"], default: "append", help: "append = sab items ek ke baad ek · combine = sab fields ek object me · list = { items: [...] }" }],
      async run(ctx) {
        const m = ctx.raw.mode || "append";
        if (m === "combine into one item") return one([Object.assign({}, ...ctx.items.map(clone))]);
        if (m === "list in one item") return one([{ items: clone(ctx.items), count: ctx.items.length }]);
        return one(clone(ctx.items));
      },
    },
    {
      type: "splitItems", label: "Loop / Split Items", group: "Flow", icon: "repeat-2", color: "#a855f7",
      description: "List ko alag-alag items me todo (har item pe agle nodes chalenge), ya N-N ke batches banao.",
      params: [
        { key: "mode", label: "Mode", type: "select", options: ["split out a list field", "batches of N"], default: "split out a list field" },
        { key: "field", label: "List field (split mode)", type: "text", default: "items", placeholder: "data.results" },
        { key: "size", label: "Batch size (batch mode)", type: "number", default: 5 },
      ],
      async run(ctx) {
        if (ctx.raw.mode === "batches of N") return one(batches(ctx.items, ctx.raw.size).map((b, i) => ({ batch: clone(b), index: i, size: b.length })));
        const out = [];
        for (const it of ctx.items) {
          const v = getDeep(it, s(ctx.raw.field).trim());
          if (!Array.isArray(v)) throw new Error(`"${ctx.raw.field}" list nahi hai (mila: ${v === undefined ? "kuch nahi" : typeof v}). Pichhle node ka output dekho.`);
          v.forEach((x, i) => out.push(x && typeof x === "object" && !Array.isArray(x) ? clone(x) : { value: x, index: i }));
        }
        return one(out);
      },
    },
    {
      type: "removeDuplicates", label: "Remove Duplicates", group: "Flow", icon: "copy-x", color: "#a855f7",
      description: "Same field wale double items hatao. 'Har run me yaad rakho' ON = pehle bheja hua dobara nahi jayega.",
      params: [
        { key: "field", label: "Compare field (blank = poora item)", type: "text", default: "link" },
        { key: "remember", label: "Har run me yaad rakho (no repeat)", type: "boolean", default: false },
      ],
      async run(ctx, H) {
        const f = s(ctx.raw.field).trim(); const k = (it) => (f ? s(getDeep(it, f)) : JSON.stringify(it));
        const mk = `dedupe:${(ctx.workflow && ctx.workflow.id) || "wf"}:${(ctx.node && ctx.node.id) || "n"}`;
        const remember = ctx.raw.remember === true || ctx.raw.remember === "true";
        const old = new Set(remember ? (await H.mem.get(mk)) || [] : []);
        const out = []; const seen = new Set();
        for (const it of ctx.items) { const v = k(it); if (seen.has(v) || old.has(v)) continue; seen.add(v); out.push(it); }
        if (remember) await H.mem.set(mk, [...seen, ...old].slice(0, 2000));
        return one(out);
      },
    },
    {
      type: "errorHandler", label: "Error Handler", group: "Flow", icon: "shield-check", color: "#a855f7", outputs: 2, outputLabels: ["ok", "error"],
      description: "Pichhle node me 'Continue if it fails' ON karo — error wale items neeche (error) jaate hain, baaki upar (ok).",
      params: [{ key: "note", label: "Note", type: "text", default: "error raste pe Telegram alert ya Log lagao" }],
      async run(ctx) {
        const ok = [], bad = [];
        for (const it of ctx.items) (it && it.error ? bad : ok).push(it);
        return [ok, bad];
      },
    },
    {
      type: "stopError", label: "Stop & Error", group: "Flow", icon: "octagon-x", color: "#ef4444", outputs: 0,
      description: "Run yahin rok do aur apna error message dikhao (Error Center me aayega).",
      params: [{ key: "message", label: "Error message", type: "text", default: "Data galat hai — {{ $json.reason || 'check input' }}" }],
      async run(ctx) { throw new Error(s(ctx.p("message", 0)) || "Stopped by Stop & Error node"); },
    },
    // ===================== AI
    {
      type: "aiSummarize", label: "AI Summarise", group: "AI", icon: "scroll-text", color: "#f59e0b",
      description: "Lambe text (article, RSS, email) ka chhota summary — Hinglish ya English.",
      params: [
        { key: "text", label: "Text", type: "textarea", default: "{{ $json.content || $json.description || $json.text }}" },
        { key: "style", label: "Style", type: "select", options: ["3 bullet points", "1 line", "short paragraph", "tweet (under 260 chars)"], default: "3 bullet points" },
        { key: "language", label: "Language", type: "select", options: ["Hinglish (Roman)", "English", "Hindi"], default: "Hinglish (Roman)" },
      ].concat(AI_FIELDS),
      async run(ctx, H) {
        const r = await aiEach(ctx, H, (i) => [{ role: "system", content: `Summarise the user's text as ${ctx.raw.style}. Language: ${ctx.raw.language}. Output only the summary.` }, { role: "user", content: need(ctx.p("text", i), "Text").slice(0, 12000) }]);
        return one(r.map((x) => Object.assign({}, x.item, { summary: x.text })));
      },
    },
    {
      type: "aiClassify", label: "AI Classify", group: "AI", icon: "tags", color: "#f59e0b",
      description: "Text ko categories me baanto (jaise: sawal / shikayat / spam). Phir Switch se alag raste.",
      params: [
        { key: "text", label: "Text", type: "textarea", default: "{{ $json.text || $json.message }}" },
        { key: "categories", label: "Categories (comma)", type: "text", default: "question, complaint, order, spam, other" },
      ].concat(AI_FIELDS),
      async run(ctx, H) {
        const cats = s(ctx.raw.categories).split(",").map((c) => c.trim()).filter(Boolean);
        if (cats.length < 2) throw new Error("Kam se kam 2 categories likho (comma se).");
        const r = await aiEach(ctx, H, (i) => [{ role: "system", content: `Classify the text into exactly one of: ${cats.join(", ")}. Reply with only the category word.` }, { role: "user", content: need(ctx.p("text", i), "Text").slice(0, 6000) }], { temperature: 0, maxTokens: 300 });
        return one(r.map((x) => { const low = x.text.toLowerCase(); const c = cats.find((k) => low.includes(k.toLowerCase())) || cats[cats.length - 1]; return Object.assign({}, x.item, { category: c }); }));
      },
    },
    {
      type: "aiTranslate", label: "AI Translate", group: "AI", icon: "languages", color: "#f59e0b",
      description: "Kisi bhi bhasha me translate: English ↔ Hindi / Hinglish / Marathi…",
      params: [
        { key: "text", label: "Text", type: "textarea", default: "{{ $json.text }}" },
        { key: "to", label: "Translate to", type: "text", default: "Hinglish (Roman script)" },
      ].concat(AI_FIELDS),
      async run(ctx, H) {
        const r = await aiEach(ctx, H, (i) => [{ role: "system", content: `Translate the user's text to ${s(ctx.raw.to) || "Hindi"}. Keep meaning, names, links and hashtags. Output only the translation.` }, { role: "user", content: need(ctx.p("text", i), "Text").slice(0, 8000) }]);
        return one(r.map((x) => Object.assign({}, x.item, { translated: x.text })));
      },
    },
    {
      type: "aiImagePrompt", label: "AI Image Prompt", group: "AI", icon: "wand-sparkles", color: "#f59e0b",
      description: "Topic se ek detailed image prompt banao (thumbnail / post photo ke liye).",
      params: [
        { key: "topic", label: "Topic", type: "text", default: "{{ $json.title || 'subah ki chai aur motivation' }}" },
        { key: "style", label: "Style", type: "select", options: ["photo realistic", "3D cartoon", "flat illustration", "cinematic", "minimal poster"], default: "cinematic" },
        { key: "ratio", label: "Aspect ratio", type: "select", options: ["9:16", "1:1", "4:5", "16:9"], default: "9:16" },
      ].concat(AI_FIELDS),
      async run(ctx, H) {
        const r = await aiEach(ctx, H, (i) => [{ role: "system", content: "You write one vivid English image-generation prompt (max 70 words): subject, setting, lighting, camera, colours, mood. No text in the image. Output only the prompt." }, { role: "user", content: `Topic: ${need(ctx.p("topic", i), "Topic")}\nStyle: ${ctx.raw.style}\nAspect ratio: ${ctx.raw.ratio}` }], { temperature: 0.8 });
        return one(r.map((x) => Object.assign({}, x.item, { imagePrompt: x.text, ratio: ctx.raw.ratio })));
      },
    },
    {
      type: "aiAgent", label: "AI Agent (tools)", group: "AI", icon: "bot", color: "#f59e0b",
      description: "AI khud tools use karke kaam karta hai: calculator, date/time, web page padhna, memory. Max steps tak sochta hai.",
      params: [
        { key: "task", label: "Task", type: "textarea", default: "{{ $json.text || 'Aaj ki date kya hai aur 18% GST 2499 pe kitna hoga?' }}" },
        { key: "tools", label: "Tools", type: "text", default: "calculator, datetime, fetch_url, memory", help: "calculator, datetime, fetch_url (web page ka text), memory (yaad rakho / padho)" },
        { key: "maxSteps", label: "Max steps", type: "number", default: 5 },
      ].concat(AI_FIELDS),
      async run(ctx, H) {
        const allowed = s(ctx.raw.tools).split(",").map((t) => t.trim()).filter(Boolean);
        const tools = {
          calculator: async (x) => String(calc(x)),
          datetime: async () => fmtDate(new Date(), "dddd DD-MM-YYYY HH:mm", "Asia/Kolkata") + " IST",
          fetch_url: async (x) => { const r = await H.http(s(x).trim()); const t = typeof r.data === "string" ? r.data : JSON.stringify(r.data); return `HTTP ${r.status}: ` + t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000); },
          memory: async (x) => { const m = s(x).match(/^\s*(set|get)\s+([\w.-]+)\s*(?:=\s*([\s\S]*))?$/i); if (!m) return "use: set key = value | get key"; const k = "agent:" + m[2]; if (m[1].toLowerCase() === "set") { await H.mem.set(k, m[3] || ""); return "saved"; } const v = await H.mem.get(k); return v == null ? "(empty)" : s(v); },
        };
        const out = [];
        for (let i = 0; i < ctx.items.length; i++) {
          const sys = `You are an agent. Tools: ${allowed.join(", ")}. To use a tool reply ONLY with JSON {"tool":"<name>","input":"<text>"}. When done reply ONLY with JSON {"final":"<answer in the user's language>"}.`;
          const msgs = [{ role: "system", content: sys }, { role: "user", content: need(ctx.p("task", i), "Task") }];
          const steps = []; let final = null;
          for (let k = 0; k < Math.min(10, Number(ctx.raw.maxSteps) || 5); k++) {
            const r = await H.ai(ctx, i, msgs, { temperature: 0.2, maxTokens: 700 });
            const a = parseAgentReply(r.text);
            if (a.final !== undefined && !a.tool) { final = s(a.final); break; }
            let res;
            if (!allowed.includes(a.tool) || !tools[a.tool]) res = `tool "${a.tool}" not available`;
            else { try { res = await tools[a.tool](a.input); } catch (e) { res = "error: " + e.message; } }
            steps.push({ tool: a.tool, input: s(a.input), result: s(res).slice(0, 500) });
            msgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Tool result: ${s(res).slice(0, 3000)}` });
          }
          if (final === null) final = steps.length ? `Max steps khatam. Last tool result: ${steps[steps.length - 1].result}` : "";
          out.push(Object.assign({}, ctx.items[i], { answer: final, steps }));
        }
        return one(out);
      },
    },
    // ===================== Social
    {
      type: "whatsappLink", label: "WhatsApp Link", group: "Social", icon: "whatsapp", color: "#25d366",
      description: "Click-to-chat link banao (wa.me) message ke saath — Telegram/email/form me bhejo. (Auto WhatsApp bhejne ke liye Meta Business API chahiye.)",
      params: [
        { key: "phone", label: "Phone with country code", type: "text", default: "{{ $json.phone || '919876543210' }}" },
        { key: "text", label: "Message", type: "textarea", default: "Namaste {{ $json.name || '' }}! YantraFlow se message." },
      ],
      async run(ctx) {
        return one(ctx.items.map((it, i) => { const p = s(ctx.p("phone", i)).replace(/[^\d]/g, ""); if (p.length < 8) throw new Error("Phone number me country code ke saath kam se kam 8 digit chahiye (jaise 919876543210)."); return Object.assign({}, it, { whatsappUrl: waLink(p, ctx.p("text", i)) }); }));
      },
    },
    // ===================== Data
    {
      type: "jsonTools", label: "JSON Parse / Stringify", group: "Data", icon: "braces", color: "#06b6d4",
      description: "Text ko JSON object banao (AI ke jawab ke liye best) ya object ko text.",
      params: [
        { key: "mode", label: "Mode", type: "select", options: ["parse", "stringify"], default: "parse" },
        { key: "field", label: "Field", type: "text", default: "text" },
        { key: "into", label: "Save into field (blank = merge into item)", type: "text", default: "" },
      ],
      async run(ctx) {
        return one(ctx.items.map((it) => {
          const o = clone(it); const v = getDeep(it, s(ctx.raw.field).trim());
          if (ctx.raw.mode === "stringify") { setDeep(o, s(ctx.raw.into).trim() || (s(ctx.raw.field).trim() + "Text"), JSON.stringify(v)); return o; }
          let txt = s(v).trim(); const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) txt = fence[1].trim();
          const m = txt.match(/[[{][\s\S]*[\]}]/); let j;
          try { j = JSON.parse(m ? m[0] : txt); } catch (e) { throw new Error(`"${ctx.raw.field}" valid JSON nahi hai: ${e.message}`); }
          if (s(ctx.raw.into).trim()) { setDeep(o, s(ctx.raw.into).trim(), j); return o; }
          return j && typeof j === "object" && !Array.isArray(j) ? Object.assign(o, j) : Object.assign(o, { parsed: j });
        }));
      },
    },
    {
      type: "csvTools", label: "CSV Parse / Create", group: "Data", icon: "table", color: "#06b6d4",
      description: "CSV text ko items me badlo, ya saare items ko ek CSV text me (Sheet/Excel ke liye).",
      params: [
        { key: "mode", label: "Mode", type: "select", options: ["text to items", "items to text"], default: "items to text" },
        { key: "field", label: "CSV text field (parse mode)", type: "text", default: "csv" },
        { key: "columns", label: "Columns (create mode, comma; blank = all)", type: "text", default: "" },
      ],
      async run(ctx) {
        if (ctx.raw.mode === "text to items") return one(ctx.items.flatMap((it) => parseCsvText(getDeep(it, s(ctx.raw.field).trim()))));
        const cols = s(ctx.raw.columns).split(",").map((c) => c.trim()).filter(Boolean);
        return one([{ csv: toCsv(ctx.items, cols), rows: ctx.items.length }]);
      },
    },
    {
      type: "dateTime", label: "Date & Time", group: "Data", icon: "calendar", color: "#06b6d4",
      description: "Abhi ka time (IST), format, din jodo/ghatao, do dates ka farak.",
      params: [
        { key: "op", label: "Operation", type: "select", options: ["now", "format", "add", "subtract", "difference"], default: "now" },
        { key: "value", label: "Date (blank = now)", type: "text", default: "" },
        { key: "amount", label: "Amount (add/subtract)", type: "number", default: 1 },
        { key: "unit", label: "Unit", type: "select", options: ["minutes", "hours", "days", "weeks"], default: "days" },
        { key: "format", label: "Format", type: "text", default: "DD-MM-YYYY HH:mm", help: "YYYY MM DD HH mm ss dddd (weekday)" },
        { key: "timezone", label: "Timezone", type: "text", default: "Asia/Kolkata" },
        { key: "into", label: "Save into field", type: "text", default: "date" },
      ],
      async run(ctx) {
        return one(ctx.items.map((it, i) => { const o = clone(it); setDeep(o, s(ctx.raw.into).trim() || "date", dateOp(ctx.raw.op, ctx.p("value", i), ctx.p("amount", i), ctx.raw.unit, ctx.raw.format, ctx.raw.timezone)); return o; }));
      },
    },
    {
      type: "textTools", label: "Text Tools", group: "Data", icon: "type", color: "#06b6d4",
      description: "Upper/lower, replace, regex nikaalo, split, word count, slug, emoji hatao, hashtags/links nikaalo.",
      params: [
        { key: "op", label: "Operation", type: "select", options: ["upper", "lower", "trim", "title case", "replace", "regex extract", "split", "length", "word count", "truncate", "slug", "remove emoji", "hashtags", "urls"], default: "trim" },
        { key: "text", label: "Text", type: "textarea", default: "{{ $json.text }}" },
        { key: "a", label: "Find / regex / separator / max length", type: "text", default: "" },
        { key: "b", label: "Replace with", type: "text", default: "" },
        { key: "into", label: "Save into field", type: "text", default: "result" },
      ],
      async run(ctx) { return one(ctx.items.map((it, i) => { const o = clone(it); setDeep(o, s(ctx.raw.into).trim() || "result", textOp(ctx.raw.op, ctx.p("text", i), ctx.p("a", i), ctx.p("b", i))); return o; })); },
    },
    {
      type: "memory", label: "Memory / Store", group: "Data", icon: "hard-drive", color: "#06b6d4",
      description: "Runs ke beech value yaad rakho: counter, last post, list. Website: browser me, PC: data/memory.json.",
      params: [
        { key: "op", label: "Operation", type: "select", options: ["get", "set", "increment", "push to list", "delete"], default: "increment" },
        { key: "key", label: "Key", type: "text", default: "post_count" },
        { key: "value", label: "Value (set / push)", type: "text", default: "{{ $json.title }}" },
        { key: "into", label: "Save into field", type: "text", default: "memory" },
      ],
      async run(ctx, H) {
        const out = [];
        for (let i = 0; i < ctx.items.length; i++) {
          const k = need(ctx.p("key", i), "Key"); const op = ctx.raw.op || "get"; let v = await H.mem.get(k);
          if (op === "set") { v = ctx.p("value", i); await H.mem.set(k, v); }
          else if (op === "increment") { v = (Number(v) || 0) + 1; await H.mem.set(k, v); }
          else if (op === "push to list") { v = (Array.isArray(v) ? v : []).concat([ctx.p("value", i)]).slice(-500); await H.mem.set(k, v); }
          else if (op === "delete") { await H.mem.set(k, null); v = null; }
          const o = clone(ctx.items[i]); setDeep(o, s(ctx.raw.into).trim() || "memory", v === undefined ? null : v); out.push(o);
        }
        return one(out);
      },
    },
    {
      type: "supabase", label: "Supabase Table", group: "Data", icon: "supabase", color: "#3ecf8e",
      description: "Supabase table me rows padho / jodo / badlo / hatao (REST API).",
      params: [
        { key: "op", label: "Operation", type: "select", options: ["select", "insert", "update", "delete"], default: "select" },
        { key: "supabaseUrl", label: "Project URL", type: "text", default: "", placeholder: "https://xxxx.supabase.co" },
        { key: "supabaseKey", label: "API key (publishable / anon)", type: "secret", default: "" },
        { key: "table", label: "Table", type: "text", default: "posts" },
        { key: "filter", label: "Filter (select/update/delete)", type: "text", default: "", placeholder: "id=eq.5  ·  status=eq.new&limit=10" },
        { key: "row", label: "Row JSON (insert/update)", type: "json", default: "{\"title\": \"{{ $json.title }}\"}" },
      ],
      async run(ctx, H) {
        const out = [];
        const ops = ctx.raw.op === "select" ? [0] : ctx.items.map((_, i) => i);
        for (const i of ops) {
          const base = need(ctx.p("supabaseUrl", i), "Supabase Project URL").replace(/\/+$/, ""); const key = need(ctx.p("supabaseKey", i), "Supabase API key");
          const table = need(ctx.p("table", i), "Table"); const filter = s(ctx.p("filter", i)).trim().replace(/^\?/, "");
          const method = { select: "GET", insert: "POST", update: "PATCH", delete: "DELETE" }[ctx.raw.op || "select"];
          if ((method === "PATCH" || method === "DELETE") && !filter) throw new Error("Update/Delete ke liye Filter zaroori hai (jaise id=eq.5) — warna poori table badal jayegi.");
          let body; if (method === "POST" || method === "PATCH") { const r = ctx.p("row", i); body = typeof r === "string" ? r : JSON.stringify(r); try { JSON.parse(body); } catch (e) { throw new Error("Row JSON galat hai: " + e.message); } }
          const r = await H.http(`${base}/rest/v1/${encodeURIComponent(table)}${filter ? "?" + filter : ""}`, { method, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" }, body });
          if (!r.ok) throw H.apiError("Supabase", r);
          const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
          out.push(...rows);
        }
        return one(out.length ? out : [{ ok: true, rows: 0 }]);
      },
    },
    {
      type: "sheetAppend", label: "Google Sheet Add Row", group: "Data", icon: "googlesheets", color: "#0f9d58",
      description: "Google Sheet me row jodo — Sheet ke Apps Script 'Web app' URL se (koi Google key nahi chahiye). Guide me 5 line ka script hai.",
      params: [
        { key: "url", label: "Apps Script Web app URL", type: "text", default: "", placeholder: "https://script.google.com/macros/s/…/exec" },
        { key: "row", label: "Row JSON", type: "json", default: "{\"date\": \"{{ $today }}\", \"title\": \"{{ $json.title }}\"}" },
      ],
      async run(ctx, H) {
        const out = [];
        for (let i = 0; i < ctx.items.length; i++) {
          const url = need(ctx.p("url", i), "Apps Script URL");
          if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error("URL script.google.com/macros/s/…/exec jaisa hona chahiye (Apps Script → Deploy → Web app).");
          const r0 = ctx.p("row", i); const body = typeof r0 === "string" ? r0 : JSON.stringify(r0);
          const r = await H.http(url, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body });
          if (!r.ok) throw H.apiError("Google Sheet", r);
          out.push(Object.assign({}, ctx.items[i], { sheet: r.data }));
        }
        return one(out);
      },
    },
  ];
  function tgItem(u) {
    const m = u && (u.message || u.channel_post || u.edited_message); if (!m) return null;
    return { text: m.text || m.caption || "", chatId: m.chat && m.chat.id, chatTitle: (m.chat && (m.chat.title || m.chat.first_name)) || "", from: (m.from && (m.from.username || m.from.first_name)) || "", messageId: m.message_id, date: new Date((m.date || 0) * 1000).toISOString(), updateId: u.update_id };
  }
  // the v4.5 node picker: categories, in order
  const CATEGORIES = [
    { id: "Trigger", label: "Trigger", icon: "zap", hint: "Workflow kab shuru ho" },
    { id: "Core", label: "Core", icon: "box", hint: "HTTP, code, fields, wait" },
    { id: "Flow", label: "Flow", icon: "route", hint: "IF, switch, merge, loop, errors" },
    { id: "AI", label: "AI", icon: "sparkles", hint: "Likhna, summary, translate, agent" },
    { id: "Social", label: "Social", icon: "message-circle", hint: "Telegram, Insta, YouTube, X…" },
    { id: "Data", label: "Data", icon: "database", hint: "JSON, CSV, date, text, Sheet, Supabase" },
    { id: "Media", label: "Media & Files", icon: "clapperboard", hint: "Photo, video, files" },
  ];
  return { DEFS, CATEGORIES, helpers: { toCsv, parseCsvText, textOp, dateOp, fmtDate, calc, parseAgentReply, batches, formFields, waLink, tgItem, getDeep } };
});

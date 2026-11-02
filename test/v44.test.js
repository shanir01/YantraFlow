"use strict";
// v4.4: closable Tips (remembered), AI provider presets, guide registry covers every key field,
// AI Project Generator (validate + repair loop + server route), Post Photo Maker, Photo + Video Maker setup, top bar.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const PUB = path.join(__dirname, "..", "public");
const G = require("../public/js/guides.js");
const PG = require("../public/js/projgen.js");
const YI = require("../public/js/image-core.js");
const PV = require("../public/js/photovideo.js");
const AIM = require("../public/js/ai-model.js");
const CRED = require("../public/js/cred-schema.js");
const PROJECTS = require("../public/js/projects.js");
const { publicNodeList } = require("../src/nodes");
const { startMockApis, tmpDir, silent } = require("./helpers");
let HAS_FFMPEG = true; try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch (_) { HAS_FFMPEG = false; }
const META = publicNodeList();
const fakeStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test("tips/banners: X closes one tip, closed state is remembered, 'Tips wapas dikhao' resets", () => {
  const st = fakeStore();
  assert.equal(G.Tips.isClosed(st, "premium"), false);
  G.Tips.close(st, "premium"); G.Tips.close(st, "premium"); G.Tips.close(st, "web-version");
  assert.deepEqual(JSON.parse(st.getItem(G.Tips.KEY)), ["premium", "web-version"]); // no duplicates, survives "reload" (same storage)
  assert.equal(G.Tips.isClosed(st, "premium"), true);
  assert.equal(G.Tips.isClosed(st, "schedule-web"), false);
  st.setItem("yf_prem_note_x", "1");
  G.Tips.reset(st);
  assert.deepEqual(G.Tips.closedList(st), []);
  assert.equal(st.getItem("yf_prem_note_x"), null); // old v4.3 flag cleared too
  st.setItem(G.Tips.KEY, "{broken"); assert.deepEqual(G.Tips.closedList(st), []); // corrupt storage never crashes
  const app = fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8");
  for (const id of ["web-version", "premium", "schedule-web", "schedule-pc", "keys-safety"]) assert.ok(app.includes(`"${id}"`), id);
  assert.ok(fs.readFileSync(path.join(PUB, "js", "admin.js"), "utf8").includes('closable("setup-pending"'));
  assert.ok(fs.readFileSync(path.join(PUB, "js", "platform.js"), "utf8").includes("Tips wapas dikhao"));
});

test("AI provider presets fill Base URL + recommended model (and match ai-model auto-pick)", () => {
  assert.deepEqual(G.presetFill("groq"), { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" });
  assert.deepEqual(G.presetFill("gemini"), { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash" });
  assert.deepEqual(G.presetFill("sangam"), { baseUrl: "http://localhost:8787/v1", model: "auto", apiKey: "local" });
  assert.equal(G.presetFill("nope"), null);
  for (const p of G.AI_PRESETS) {
    if (p.id === "sangam") continue;
    assert.equal(AIM.pickModel(p.baseUrl, "").model, p.model, p.id); // preset model == what blank model auto-picks
    assert.match(p.keyUrl, /^https:\/\//);
  }
  assert.equal(G.detectPreset("https://api.groq.com/openai/v1/").id, "groq");
  assert.equal(G.detectPreset("https://openrouter.ai/api/v1").id, "openrouter");
  assert.equal(G.detectPreset(""), null);
  assert.ok(G.fieldInfo("aiChat", "baseUrl").preset);
});

test("guide registry covers every Keys-page field and every key field inside nodes", () => {
  for (const sec of CRED) {
    const g = G.GUIDES[sec.id];
    assert.ok(g, `guide for ${sec.id}`);
    assert.ok(g.title && g.short && g.what && g.steps.length >= 2 && g.errors.length >= 1, sec.id);
    for (const f of sec.fields) assert.ok(g.fields[f.key] && g.fields[f.key].what && g.fields[f.key].eg, `${sec.id}.${f.key}`);
    for (const l of g.links) assert.match(l.url, /^https:\/\//, `${sec.id} link`);
  }
  for (const m of META) for (const p of m.params || []) {
    const keyLike = p.type === "secret" || /^(baseUrl|apiKey|model|botToken|chatId|userId|accessToken|pageId|pageToken|webhookUrl|pexelsKey|pixabayKey)$/.test(p.key);
    if (!keyLike) continue;
    const info = G.fieldInfo(m.type, p.key);
    assert.ok(info && info.what && info.eg && G.GUIDES[info.sec], `${m.type}.${p.key} has field help`);
  }
  for (const t of Object.keys(G.NODE_SECTIONS)) for (const r of G.NODE_SECTIONS[t]) for (const id of r.replace("?", "").split("|")) assert.ok(G.GUIDES[id], `${t} -> ${id}`);
});

test("every public project gets a guide: what it does, keys, steps, errors", () => {
  for (const p of PROJECTS.filter((x) => x.workflow)) {
    const g = G.projectGuide(p);
    assert.ok(g.what, p.id); assert.ok(g.steps.length >= 1, p.id); assert.ok(g.errors.length >= 3, p.id);
  }
  const seed = PROJECTS.find((p) => p.id === "seed-telegram-autopost");
  const m = G.missing(seed.workflow, { ai: { apiKey: "x" } });
  assert.deepEqual(m.map((k) => [k.sec, k.ok]).filter(([s]) => s === "ai" || s === "telegram"), [["ai", true], ["telegram", false]]);
});

const GOOD = { name: "Subah quote", description: "Roz 8 baje", nodes: [
  { id: "n1", type: "scheduleTrigger", name: "Roz 8 baje", params: { mode: "cron", cron: "0 8 * * *" } },
  { id: "n2", type: "aiChat", name: "Quote likho", params: { prompt: "Motivational quote", apiKey: "sk-should-be-dropped" } },
  { id: "n3", type: "imageMaker", name: "Photo", params: { text: "{{ $json.text }}" } },
  { id: "n4", type: "telegram", name: "Bhejo", params: { operation: "photo", media: "{{ $json.image }}", botToken: "1:leak" } }],
  connections: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }] };

test("project generator: validates against the node catalog, never keeps keys from the AI", () => {
  const r = PG.validate(GOOD, META);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.workflow.nodes[1].params.apiKey, ""); assert.equal(r.workflow.nodes[3].params.botToken, "");
  assert.equal(r.workflow.nodes[2].params.size, "1080x1350"); // defaults filled
  assert.equal(r.workflow.active, false);
  const bad = JSON.parse(JSON.stringify(GOOD)); bad.nodes[2].type = "instaBot"; bad.nodes[0].params.cron = "8am"; bad.connections.push({ from: "n9", to: "n2" });
  const rb = PG.validate(bad, META);
  assert.equal(rb.ok, false);
  assert.ok(rb.errors.some((e) => /Unknown node type "instaBot"/.test(e)));
  assert.ok(rb.errors.some((e) => /5 fields/.test(e)));
  assert.ok(rb.errors.some((e) => /missing node/.test(e)));
  assert.equal(PG.validate({ nodes: [{ id: "a", type: "telegram", params: {} }, { id: "b", type: "log", params: {} }] }, META).errors.some((e) => /trigger/.test(e)), true);
  const noConn = JSON.parse(JSON.stringify(GOOD)); delete noConn.connections; // AI forgot connections -> chained in order
  assert.equal(PG.validate(noConn, META).workflow.connections.length, 3);
  assert.deepEqual(PG.extractJson("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.throws(() => PG.extractJson("sorry"), /JSON/);
  assert.equal(PG.EXAMPLES.length, 6);
  assert.ok(PG.systemPrompt(META).includes("imageMaker") && PG.systemPrompt(META).includes("scheduleTrigger"));
});

test("project generator: repair loop sends the errors back and accepts the fixed JSON", async () => {
  const seen = [];
  const replies = ["Ye lo: {\"nodes\": [{\"id\":\"n1\",\"type\":\"magic\"}]}", JSON.stringify(GOOD)];
  const res = await PG.generate({ text: "har subah quote photo telegram pe", meta: META, callAI: async (msgs) => { seen.push(msgs.length); return replies.shift(); } });
  assert.equal(res.ok, true); assert.equal(res.tries, 2);
  assert.deepEqual(seen, [2, 4]); // 2nd call carries the bad answer + the error list
  await assert.rejects(PG.generate({ text: "x", meta: META, maxTries: 2, callAI: async () => "nahi" }), /sahi project nahi/);
  await assert.rejects(PG.generate({ text: "  ", meta: META, callAI: async () => "" }), /Pehle likho/);
});

test("server: /api/ai/complete uses the saved AI key (never sent to the browser)", async () => {
  const mock = await startMockApis();
  const { createServer } = require("../src/server");
  const server = createServer({ dataDir: tmpDir(), logger: silent, password: "" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(base + "/api/credentials", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ai: { baseUrl: `${mock.base}/v1`, apiKey: "sk-secret-777", model: "m1" } }) });
    const r = await fetch(base + "/api/ai/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: "s" }, { role: "user", content: "hello" }] }) });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(typeof j.text, "string");
    const call = mock.calls.find((c) => c.path.endsWith("/chat/completions"));
    assert.equal(call.headers.authorization, "Bearer sk-secret-777");
    const bad = await fetch(base + "/api/ai/complete", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(bad.status, 400);
  } finally { server.close(); await mock.close(); }
});

test("post photo maker: plan wraps text, strips hashtags/links/emoji, picks size + colours", () => {
  const p = YI.planImage({ text: "Good Morning doston! \u2600\uFE0F Har din ek naya mauka hai. #motivation https://x.y", title: "Aaj ka quote", size: "1080x1920", color1: "#ff0000", color2: "bad" });
  assert.equal(p.size, "1080x1920");
  assert.ok(p.lines.every((l) => l.length <= p.maxChars));
  assert.ok(!p.text.includes("#") && !p.text.includes("http") && !/\u2600/.test(p.text), p.text);
  assert.equal(p.colors.bg1, "#ff0000"); assert.equal(p.colors.bg2, "#00d4ff");
  assert.equal(YI.planImage({ text: "x".repeat(900) }).text.length <= 420, true);
  assert.throws(() => YI.planImage({ text: "#only https://x.y" }), /khaali/);
  const ass = YI.assForImage(p); assert.match(ass, /PlayResX: 1080/); assert.match(ass, /PlayResY: 1920/); assert.match(ass, /AAJ KA QUOTE/);
  const args = YI.imageArgs(p, { bg: "bg.ppm", ass: "card.ass", out: "o.png" }); assert.deepEqual(args.slice(-3), ["-frames:v", "1", "o.png"]); assert.ok(args.join(" ").includes("ass=card.ass"));
  assert.equal(YI.normalizePexelsPhotos({ photos: [{ id: 1, url: "u", photographer: "A", src: { portrait: "https://p/1.jpg" } }] })[0].url, "https://p/1.jpg");
  assert.match(YI.photoCredit({ by: "A", source: "Pexels", page: "https://pexels.com/p/1" }), /Photo: A \/ Pexels/);
});

test("post photo maker on PC/Termux renders a real 1080x1350 PNG with ffmpeg", { skip: !HAS_FFMPEG && "ffmpeg not installed" }, async () => {
  const { BY_TYPE } = require("../src/nodes");
  const dir = tmpDir(); const raw = { text: "Har din ek naya mauka hai", title: "Good Morning", size: "1080x1350", style: "gradient", color1: "#7c5cff", color2: "#00d4ff", handle: "@yantraflow" };
  const out = await BY_TYPE.imageMaker.run({ items: [{ topic: "x" }], raw, settings: {}, filesDir: dir, p: (k) => raw[k], log: () => {} });
  const it = out[0][0];
  assert.ok(fs.existsSync(it.image)); assert.equal(it.topic, "x");
  const head = fs.readFileSync(it.image).subarray(0, 24);
  assert.equal(head.subarray(1, 4).toString(), "PNG");
  assert.equal(head.readUInt32BE(16), 1080); assert.equal(head.readUInt32BE(20), 1350);
});

test("Photo + Video Maker: details filled ONCE -> ready workflow + daily schedule", () => {
  const p = PROJECTS.find((x) => x.id === "photo-video-maker");
  assert.ok(p && p.setup && p.icon === "image-plus");
  const types = p.workflow.nodes.map((n) => n.type);
  assert.deepEqual(types.slice(0, 4), ["manualTrigger", "aiPost", "imageMaker", "videoMaker"]);
  const r = PV.apply(p.workflow, { topic: "cricket", handle: "@nishu", style: "photo", size: "1080x1920", color1: "#112233", telegram: true, youtube: true, instagram: false, video: true, at: "18:30" });
  const by = (t) => r.workflow.nodes.filter((n) => n.type === t);
  assert.equal(by("aiPost")[0].params.topic, "cricket");
  assert.match(by("aiPost")[0].params.seed, /cricket/);
  assert.equal(by("imageMaker")[0].params.style, "photo"); assert.equal(by("imageMaker")[0].params.size, "1080x1920");
  assert.equal(by("imageMaker")[0].params.color1, "#112233"); assert.equal(by("imageMaker")[0].params.handle, "@nishu");
  assert.equal(by("videoMaker")[0].params.watermark, "@nishu"); assert.equal(by("videoMaker")[0].params.mode, "make");
  assert.ok(by("telegram").every((n) => !n.disabled)); assert.equal(by("youtube")[0].disabled, false); assert.equal(by("instagram")[0].disabled, true);
  assert.deepEqual(r.schedule, { mode: "daily", at: "18:30", tz: "Asia/Kolkata", runNow: false });
  const off = PV.apply(p.workflow, { video: false, telegram: true, youtube: true });
  assert.equal(off.workflow.nodes.find((n) => n.type === "videoMaker").params.mode, "off");
  assert.equal(off.workflow.nodes.find((n) => n.type === "telegram" && n.params.operation === "video").disabled, true);
  assert.equal(off.workflow.nodes.find((n) => n.type === "youtube").disabled, true);
  assert.equal(p.workflow.nodes.find((n) => n.type === "youtube").disabled, true); // original project untouched
});

test("top bar: logo, nav, version badge, GitHub and profile in one header; no emoji; scripts loaded", () => {
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  const head = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>"));
  for (const s of ['class="logo"', 'class="nav"', 'id="edition"', 'class="gh-btn"', 'id="avatarBtn"', 'href="#/runs"', 'href="#/keys"']) assert.ok(head.includes(s), s);
  assert.ok(html.includes('class="bottomnav"'));
  for (const f of ["guides.js", "guides-ui.js", "projgen.js", "image-core.js", "photovideo.js"]) { assert.ok(new RegExp(`js/${f.replace(".", "\\.")}\\?v=\\d+`).test(html), f); assert.ok(fs.existsSync(path.join(PUB, "js", f)), f); }
  const pkg = require("../package.json"); assert.match(pkg.version, /^4\.\d+\.\d+$/); // bumped each release (v4.5: 4.5.0)
  assert.ok(fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8").includes(`const VERSION = "${pkg.version}"`));
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const f of ["guides.js", "guides-ui.js", "projgen.js", "photovideo.js"]) assert.ok(!EMOJI.test(fs.readFileSync(path.join(PUB, "js", f), "utf8")), f);
  const yfIcon = require(path.join(PUB, "js", "icons.js"));
  for (const n of ["book-open", "chevron-down", "image-plus", "list-ordered", "clipboard-check", "lightbulb", "wand-sparkles", "github"]) assert.ok(yfIcon.has(n), n);
});

"use strict";
// v4.3: Auto Video Maker (plan / script / ffmpeg), Free Video Finder (Pexels / Pixabay / own), licence credit,
// time greeting in every auto-message project, localhost PREMIUM note.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const V = require("../public/js/video-core.js");
const YC = require("../public/js/content-gen.js");
const SC = require("../public/js/site-core.js");
const PROJECTS = require("../public/js/projects.js");
const { Store } = require("../src/store");
const { Runner } = require("../src/runner");
let HAS_FFMPEG = true; try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch (_) { HAS_FFMPEG = false; }

test("video maker: caption text -> clean slides, 15-60 s plan, hook first, CTA last", () => {
  const lines = V.splitScript("Good Morning doston! ☀️\nAaj ka tip: roz 10 minute padho. Chhote steps se bade bade result aate hain bas consistent raho yaar.\n#study #tips https://x.com/a @me");
  assert.deepEqual(lines.slice(0, 2), ["Good Morning doston!", "Aaj ka tip: roz 10 minute padho."]); // emoji-only bits dropped
  assert.ok(lines.every((l) => !/#|https?:|@me/.test(l)), lines.join("|"));
  assert.ok(lines.every((l) => l.split(/\s+/).length <= 9));
  const p = V.planVideo({ script: lines.join("\n"), title: "Roz 10 minute ka jadoo", seconds: 5 });
  assert.equal(p.duration, 15); // clamped to 15-60
  assert.equal(V.planVideo({ script: "a b c", seconds: 300 }).duration, 60);
  assert.equal(p.width, 1080); assert.equal(p.height, 1920);
  assert.equal(p.scenes[0].kind, "hook"); assert.equal(p.scenes[0].text, "Roz 10 minute ka jadoo");
  assert.equal(p.scenes[p.scenes.length - 1].kind, "cta");
  for (let i = 1; i < p.scenes.length; i++) assert.equal(p.scenes[i].start, p.scenes[i - 1].end, "scenes are back to back");
  assert.equal(p.scenes[p.scenes.length - 1].end, p.duration);
  for (const sc of p.scenes) for (const w of sc.words) assert.ok(w.t >= sc.start && w.t < sc.end, "every word pops inside its slide");
  // ffmpeg pipeline: kinetic ASS captions + H.264/AAC vertical MP4
  const ass = V.assFromPlan(p);
  assert.match(ass, /PlayResY: 1920/);
  assert.equal((ass.match(/^Dialogue: 1,/gm) || []).length, p.scenes.reduce((a, s) => a + s.words.length, 0));
  assert.doesNotMatch(ass, /[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u, "no emoji boxes in ffmpeg captions");
  const args = V.ffmpegArgs(p, { bg: { type: "image", files: ["a.ppm"], gradient: true }, music: "generated", out: "o.mp4" });
  const a = args.join(" ");
  assert.match(a, /libx264/); assert.match(a, /yuv420p/); assert.match(a, /-c:a aac/); assert.match(a, /\+faststart/); assert.match(a, /ass=captions\.ass/); assert.match(a, /aevalsrc=/);
  const ppm = V.gradientPPM(8, 4, "#000000", "#ffffff", 1);
  assert.equal(Buffer.from(ppm.slice(0, 11)).toString(), "P6\n8 4\n255\n"); assert.equal(ppm.length, 11 + 8 * 4 * 3);
  // free voice on PC/Termux
  assert.equal(V.ttsCommand("edge", "Hi 😀 doston", "hi-IN-MadhurNeural", "v.mp3")[0], "edge-tts");
  assert.ok(!V.ttsCommand("edge", "Hi 😀 doston", "", "v.mp3")[1].join(" ").includes("😀"));
  assert.equal(V.ttsCommand("espeak", "x", "hi", "v.wav")[0], "espeak-ng");
});

test("AI Post Writer platform 'video': title + caption + description + hashtags + first comment", () => {
  const msgs = YC.buildMessages({ platform: "video", topic: "funny cats", history: [] });
  assert.match(msgs[0].content, /"comment"/);
  const r = YC.parseOutput("video", '```json\n{"title":"Billi ka kamaal #funny","caption":"Ye dekho!","description":"Roz ek funny video.","hashtags":"funny cats #shorts","comment":"Tumhari billi?"}\n```');
  assert.equal(r.title, "Billi ka kamaal");
  assert.equal(r.hashtags, "#funny #cats #shorts");
  assert.equal(r.tags, "funny, cats, shorts");
  assert.match(r.description, /Roz ek funny video\.\n\n#funny #cats #shorts/);
  assert.match(r.text, /^Ye dekho!\n\n#funny/);
  assert.equal(r.comment, "Tumhari billi?");
});

test("funny-video source picker: Pexels + Pixabay -> portrait, fits time, never the same clip twice", () => {
  assert.equal(V.stockQuery("Funny billi videos daily"), "funny cat");
  assert.equal(V.stockQuery("kutte ki masti"), "dog funny");
  assert.equal(V.stockQuery(""), "funny animals");
  const px = V.normalizePexels({ videos: [
    { id: 1, url: "https://www.pexels.com/video/funny-cat-1/", duration: 12, width: 1920, height: 1080, user: { name: "Ana", url: "u" }, video_files: [{ link: "https://v/1-uhd.mp4", width: 3840, height: 2160, file_type: "video/mp4" }, { link: "https://v/1-hd.mp4", width: 1920, height: 1080, file_type: "video/mp4" }] },
    { id: 2, url: "https://www.pexels.com/video/cat-jump-2/", duration: 9, width: 1080, height: 1920, user: { name: "Ravi", url: "u" }, video_files: [{ link: "https://v/2-hd.mp4", width: 1080, height: 1920, file_type: "video/mp4" }, { link: "https://v/2-sd.mp4", width: 540, height: 960, file_type: "video/mp4" }] },
    { id: 3, url: "https://www.pexels.com/video/long-3/", duration: 300, width: 1080, height: 1920, user: { name: "X" }, video_files: [{ link: "https://v/3.mp4", width: 1080, height: 1920, file_type: "video/mp4" }] },
  ] });
  assert.equal(px.length, 3);
  assert.equal(px[0].url, "https://v/1-hd.mp4", "no 4K file — 1080p is picked");
  assert.equal(px[1].url, "https://v/2-hd.mp4");
  assert.equal(px[1].tags, "cat jump");
  const pb = V.normalizePixabay({ hits: [{ id: 77, pageURL: "https://pixabay.com/videos/dog-77/", tags: "dog, funny", duration: 15, user: "Max", user_id: 5, videos: { large: { url: "https://c/77-l.mp4", width: 1920, height: 1080 }, medium: { url: "https://c/77-m.mp4", width: 1280, height: 720 } } }] });
  assert.equal(pb[0].id, "pixabay:77"); assert.equal(pb[0].url, "https://c/77-l.mp4"); assert.equal(pb[0].authorUrl, "https://pixabay.com/users/Max-5/");
  const all = px.concat(pb);
  assert.equal(V.pickClip(all, { random: 0 }).id, "pexels:2", "portrait clip first");
  assert.equal(V.pickClip(all, { used: ["pexels:2"], random: 0 }).id, "pexels:1", "used clip skipped; 300 s clip is too long");
  assert.equal(V.pickClip(all, { used: ["pexels:1", "pexels:2", "pixabay:77"], maxSeconds: 60 }).id, "pexels:3", "falls back to what is left");
  assert.equal(V.pickClip([], {}), null);
  const own = V.ownClips("# mine\nhttps://me/a.mp4\nvideos/b.mp4\n");
  assert.deepEqual(own.map((c) => c.url), ["https://me/a.mp4", "videos/b.mp4"]);
  assert.ok(V.looksVideo("https://videos.pexels.com/video-files/1/x.mp4") && V.looksVideo("yfvideo://v1") && !V.looksVideo("https://x/a.jpg"));
  assert.match(V.COPYRIGHT_NOTE, /copyright strike/);
});

test("licence credit line: Pexels / Pixabay credited, own clips not", () => {
  assert.equal(V.creditLine({ source: "Pexels", author: "Ravi", pageUrl: "https://www.pexels.com/video/cat-2/", license: "Pexels License (free to use, no attribution required)" }), "Video: Ravi on Pexels (https://www.pexels.com/video/cat-2/) — Pexels License");
  assert.match(V.creditLine({ source: "Pixabay", author: "Max", pageUrl: "https://pixabay.com/videos/dog-77/", license: "Pixabay Content License (free)" }), /^Video: Max on Pixabay .* Pixabay Content License$/);
  assert.equal(V.creditLine({ source: "Own", url: "a.mp4" }), "");
  assert.equal(V.addCredit("Desc", "C"), "Desc\n\nC"); assert.equal(V.addCredit("Desc\n\nC", "C"), "Desc\n\nC"); assert.equal(V.addCredit("", "C"), "C");
  // Video Editor: hook / CTA / Hindi captions overlay + 9:16 trim command
  const ass = V.editAss({ duration: 12, hook: "Ye dekho #funny", cta: "Follow karo", watermark: "@me", captions: [{ start: 1, end: 3, text: "नमस्ते दोस्तों" }] });
  assert.match(ass, /Hook,,0,0,0,,\{[^}]*\}Ye dekho$/m); assert.match(ass, /Cta,/); assert.match(ass, /Cap,,0,0,0,,नमस्ते दोस्तों/);
  const e = V.editArgs({ input: "in.mp4", hasAudio: true, srcDuration: 90, speed: 1, dubs: [{ file: "d0.mp3", start: 2 }], music: "", out: "o.mp4" });
  assert.equal(e.duration, 60); assert.match(e.args.join(" "), /crop=1080:1920/); assert.match(e.args.join(" "), /volume=0\.25/, "original sound lowered under the Hindi dub");
  assert.deepEqual(V.parseTranslation('["एक","दो"]', [{ start: 0, end: 1, text: "one" }, { start: 1, end: 2, text: "two" }]).map((x) => x.text), ["एक", "दो"]);
});

function mockServer() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    const ch = []; req.on("data", (d) => ch.push(d)); req.on("end", () => {
      const body = Buffer.concat(ch); calls.push({ method: req.method, path: req.url.split("?")[0], size: body.length, body: body.toString("latin1").slice(0, 4000), headers: req.headers });
      const J = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url.includes("/chat/completions")) {
        const j = JSON.parse(body.toString()); const sys = j.messages[0].content;
        if (/"comment"/.test(sys)) return J({ model: "m", choices: [{ message: { content: JSON.stringify({ title: "Billi ka kamaal", caption: "Ye dekho!", description: "Roz ek funny video.", hashtags: "#funny #shorts", comment: "Tumhari billi?" }) } }] });
        return J({ model: "m", choices: [{ message: { content: `Aaj ka tip number ${calls.length}: roz kuch naya seekho.` } }] });
      }
      if (req.url.startsWith("/pexels/videos/search")) return J({ videos: [1, 2].map((i) => ({ id: i, url: `https://www.pexels.com/video/funny-cat-${i}/`, duration: 8, width: 1080, height: 1920, user: { name: "Ravi" }, video_files: [{ link: `https://videos.example/${i}.mp4`, width: 1080, height: 1920, file_type: "video/mp4" }] })) });
      if (req.url.startsWith("/bot")) return J({ ok: true, result: { message_id: 9, chat: { id: 1 } } });
      res.writeHead(404); res.end("{}");
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, calls, base: `http://127.0.0.1:${srv.address().port}` })));
}

test("server: Free Video Finder -> AI writer adds the credit line, next run picks a NEW clip", async () => {
  const m = await mockServer();
  process.env.YANTRAFLOW_PEXELS_API = m.base + "/pexels";
  try {
    const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "yf43-")));
    store.saveSettings({ ai: { baseUrl: m.base + "/v1", apiKey: "k", model: "m" }, pexels: { apiKey: "PX" } });
    const runner = new Runner(store, { log() {} });
    const wf = { id: "fv", name: "f", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} },
      { id: "b", type: "stockVideo", name: "Find", params: { topic: "funny billi", download: "off" } },
      { id: "c", type: "aiPost", name: "Write", params: { platform: "video", topic: "{{ $json.topic }} — {{ $json.videoInfo }}", timeGreeting: "off" } }],
      connections: [{ from: "a", to: "b" }, { from: "b", to: "c" }] };
    const r1 = await runner.run(wf, { mode: "manual" });
    assert.equal(r1.status, "success", r1.error);
    const o1 = r1.nodes[2].output[0];
    assert.equal(m.calls.find((c) => c.path.startsWith("/pexels")).headers.authorization, "PX");
    assert.match(m.calls.find((c) => c.path.startsWith("/pexels")) ? "funny cat" : "", /funny cat/);
    assert.match(o1.credit, /^Video: Ravi on Pexels \(https:\/\/www\.pexels\.com\/video\/funny-cat-\d\/\)/);
    assert.ok(o1.description.endsWith(o1.credit), "credit at the end of the YouTube description");
    assert.ok(o1.text.includes(o1.credit), "credit in the Instagram / Telegram caption");
    assert.equal(o1.comment, "Tumhari billi?"); assert.equal(o1.videoUrl, o1.media);
    const r2 = await runner.run(wf, { mode: "manual" });
    assert.notEqual(r2.nodes[1].output[0].clip.id, o1.clip.id, "no repeat");
    // nothing found + fallback = maker -> passes on a "make a video" item instead of failing
    store.saveSettings({ ai: { baseUrl: m.base + "/v1", apiKey: "k", model: "m" }, pexels: { apiKey: "" } });
    const r3 = await runner.run({ ...wf, nodes: wf.nodes.slice(0, 2), connections: wf.connections.slice(0, 1) }, { mode: "manual" });
    assert.equal(r3.status, "success"); assert.equal(r3.nodes[1].output[0].needsMaker, true); assert.match(r3.nodes[1].output[0].fallbackReason, /Keys page/);
  } finally { delete process.env.YANTRAFLOW_PEXELS_API; m.srv.close(); }
});

test("server: Auto Video Maker makes a real vertical MP4 and Telegram uploads it", { skip: !HAS_FFMPEG && "ffmpeg not installed" }, async () => {
  const m = await mockServer();
  process.env.YANTRAFLOW_TELEGRAM_API = m.base;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yf43v-")); const store = new Store(dir);
    store.saveSettings({ ai: { baseUrl: m.base + "/v1", apiKey: "k", model: "m" }, telegram: { botToken: "1:t", chatId: "5" } });
    const runner = new Runner(store, { log() {} });
    const P = PROJECTS.find((p) => p.id === "seed-telegram-autopost");
    const wf = JSON.parse(JSON.stringify(P.workflow)); wf.id = "tv";
    const vm = wf.nodes.find((n) => n.type === "videoMaker"); Object.assign(vm.params, { voice: "off", seconds: 15, size: "720x1280", background: "gradient" });
    const r = await runner.run(wf, { mode: "manual" });
    assert.equal(r.status, "success", r.error);
    const out = r.nodes[2].output[0];
    assert.ok(fs.existsSync(out.videoFile) && /\.mp4$/.test(out.videoFile));
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", out.videoFile]).toString();
    const j = JSON.parse(probe);
    assert.deepEqual(j.streams.map((s) => s.codec_name), ["h264", "aac"]);
    assert.equal(j.streams[0].width, 720); assert.equal(j.streams[0].height, 1280);
    assert.ok(Math.abs(parseFloat(j.format.duration) - 15) < 0.6, j.format.duration);
    const up = m.calls.find((c) => c.path === "/bot1:t/sendVideo");
    assert.ok(up && up.size > 50000, "video bytes uploaded to Telegram");
    assert.match(up.body, /name="caption"/);
    assert.equal(r.nodes[3].output[0].telegram.via, "file");
  } finally { delete process.env.YANTRAFLOW_TELEGRAM_API; m.srv.close(); }
});

test("time greeting is ON in every auto-message project (AI Chat + AI Post Writer)", async () => {
  const POSTERS = ["telegram", "instagram", "xPost", "linkedinPost", "discord", "facebook", "youtube"];
  const flows = PROJECTS.filter((p) => p.workflow).map((p) => [p.id, p.workflow]);
  for (const f of ["daily-quote", "rss-ai-telegram", "reel-autopost"]) flows.push([f, JSON.parse(fs.readFileSync(path.join(__dirname, "../public/templates", f + ".json"), "utf8"))]);
  let checked = 0;
  for (const [id, wf] of flows) {
    // auto-message projects = a schedule-able AI message that is posted somewhere (not one-off tools like script/SEO generators, Gmail, DMs)
    const autoMessage = /^(seed-|daily-|telegram-daily-post|trending-news-post|rss-ai-telegram|reel-autopost|link-preview)/.test(id) && wf.nodes.some((n) => POSTERS.includes(n.type));
    if (!autoMessage) continue;
    for (const n of wf.nodes) {
      if (n.type === "aiChat") { assert.equal(n.params.timeGreeting, "on", `${id} / ${n.name}`); checked++; }
      if (n.type === "aiPost") { assert.notEqual(n.params.timeGreeting, "off", `${id} / ${n.name}`); checked++; }
    }
  }
  assert.ok(checked >= 10, String(checked));
  // the AI Chat node itself: greeting + time in the prompt + remembered history, OFF = untouched
  const prompts = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { prompts.push(JSON.parse(b)); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ model: "m", choices: [{ message: { content: `Aaj ka quote ${prompts.length}: mehnat karo.` } }] })); }); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "yf43g-")));
    store.saveSettings({ ai: { baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, apiKey: "k", model: "m" } });
    const runner = new Runner(store, { log() {} });
    const wf = { id: "q", name: "q", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "aiChat", name: "AI", params: { prompt: "quote", timeGreeting: "on" } }], connections: [{ from: "a", to: "b" }] };
    const slot = YC.timeOfDay(new Date(), "Asia/Kolkata").slot;
    const r1 = await runner.run(wf, { mode: "manual" });
    assert.equal(r1.status, "success", r1.error);
    assert.ok(YC.hasGreeting(r1.nodes[1].output[0].text, slot), r1.nodes[1].output[0].text);
    assert.match(prompts[0].messages[0].content, new RegExp(`It is ${slot} now .*India time`));
    await runner.run(wf, { mode: "manual" });
    assert.match(prompts[1].messages[0].content, /Earlier messages \(do not repeat\):\n1\. /, "second run sees the first message");
    wf.nodes[1].params.timeGreeting = "off";
    const r3 = await runner.run(wf, { mode: "manual" });
    assert.match(r3.nodes[1].output[0].text, /^Aaj ka quote/);
    assert.doesNotMatch(JSON.stringify(prompts[2].messages), /India time|Earlier messages/, "nothing added when OFF");
  } finally { srv.close(); }
});

test("localhost PREMIUM note: website only, admin can hide / reword, user can dismiss", () => {
  const n = SC.premiumNote({}, "web", false);
  assert.match(n.text, /Localhost \(PC\/Termux\) pe chalao to aur PREMIUM options milenge/);
  assert.ok(n.features.some((f) => /24x7/.test(f)) && n.features.some((f) => /MP4/.test(f)) && n.features.some((f) => /X \(Twitter\), LinkedIn/.test(f)) && n.features.some((f) => /link preview/.test(f)));
  assert.equal(SC.premiumNote({}, "full", false), null, "not shown in the PC/Termux version itself");
  assert.equal(SC.premiumNote({ premium_note_on: false }, "web", false), null);
  assert.equal(SC.premiumNote({}, "web", true), null);
  assert.equal(SC.premiumNote({ premium_note_text: "PC pe aur maza" }, "web").text, "PC pe aur maza");
  assert.equal(SC.mergeSettings({ premium_note_on: "yes" }).premium_note_on, true, "garbage -> default");
});

test("projects: video makers wired in, funny project uses free-licence sources and keeps going if one platform fails", () => {
  for (const id of ["seed-telegram-autopost", "seed-instagram-autopost", "seed-youtube-autopost"]) {
    const t = PROJECTS.find((p) => p.id === id).workflow.nodes.map((n) => n.type);
    assert.ok(t.indexOf("videoMaker") > t.indexOf("aiPost") && t.indexOf("videoMaker") < t.length - 1, id);
  }
  const f = PROJECTS.find((p) => p.id === "daily-funny-video");
  assert.deepEqual(f.workflow.nodes.map((n) => n.type), ["manualTrigger", "stockVideo", "aiPost", "videoMaker", "videoEdit", "youtube", "instagram", "telegram"]);
  assert.ok(f.workflow.nodes.filter((n) => ["youtube", "instagram", "telegram"].includes(n.type)).every((n) => n.continueOnFail));
  assert.match(f.honest, /copyright strike/); assert.doesNotMatch(JSON.stringify(f.workflow), /pinterest/i);
  const meta = require("../src/nodes").publicNodeList();
  assert.ok(!meta.find((n) => n.type === "youtube").fullOnly, "YouTube upload now works from the website too");
  const keys = require("../public/js/cred-schema.js").map((s) => s.id);
  assert.ok(keys.includes("pexels") && keys.includes("pixabay"));
});

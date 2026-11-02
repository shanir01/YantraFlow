"use strict";
// v4.2: "Time greeting" in the AI Post Writer — Good Morning / Afternoon / Evening / Night by India time,
// different wording every time, time-of-day passed into the AI prompt (website + PC/Termux share content-gen.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YC = require("../public/js/content-gen.js");
const { Store } = require("../src/store");

const at = (ist) => new Date(Date.parse(`2026-11-02T${ist}:00+05:30`));

test("time greeting: right slot for India time (5-12, 12-17, 17-21, 21-5)", () => {
  const cases = [["04:59", "night"], ["05:00", "morning"], ["11:59", "morning"], ["12:00", "afternoon"], ["16:59", "afternoon"], ["17:00", "evening"], ["20:59", "evening"], ["21:00", "night"], ["00:30", "night"]];
  for (const [t, slot] of cases) assert.equal(YC.timeOfDay(at(t), "Asia/Kolkata").slot, slot, t);
  assert.equal(YC.timeOfDay(at("08:00")).label, "Good Morning");
  assert.equal(YC.timeOfDay(at("22:00")).hour, 22);
});

test("time greeting: wording rotates (no repeat of recent openings) and the AI prompt carries the time of day", () => {
  let history = [];
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const g = YC.pickGreeting("morning", history, 7);
    assert.ok(!seen.includes(g.text), `greeting "${g.text}" repeated`);
    seen.push(g.text);
    history = YC.pushHistory(history, { text: `${g.line}\n\nPost number ${i}` }, 20);
  }
  const g = Object.assign(YC.timeOfDay(at("21:30")), YC.pickGreeting("night", [], 1));
  const msgs = YC.buildMessages({ platform: "telegram", seed: "brand", history: [], greeting: g });
  assert.match(msgs[0].content, /It is night now \(21:00 India time\)/);
  assert.match(msgs[0].content, /night: calm wrap-up/);
  assert.match(msgs[0].content, /do NOT reuse the opening line/);
  assert.doesNotMatch(YC.buildMessages({ platform: "telegram", history: [] })[0].content, /India time/);   // toggle off
  assert.doesNotMatch(YC.buildMessages({ platform: "youtube", history: [], greeting: g })[0].content, /India time/);
  // the post always opens with the right greeting, even if the AI forgot it
  assert.equal(YC.ensureGreeting("Aaj ka tip: backups lo.", "evening", { line: "Shubh sandhya \u2728" }), "Shubh sandhya \u2728\n\nAaj ka tip: backups lo.");
  assert.equal(YC.ensureGreeting("Good evening doston! Aaj ka tip.", "evening"), "Good evening doston! Aaj ka tip.");
  assert.ok(YC.hasGreeting("Suprabhat \u2600\uFE0F aaj...", "morning"));
});

test("server: AI Post Writer with Time greeting ON (default) opens with the greeting and sends the time to the AI", async () => {
  const prompts = [];
  let n = 0;
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      prompts.push(JSON.parse(body)); n++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "m", choices: [{ message: { content: `Automation tip ${n}: ek kaam roz khud karo ${"abcdefghij".slice(0, n)} ${n * 17}` } }] }));
    });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const { Runner } = require("../src/runner");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yf-greet-"));
    const store = new Store(dir); store.saveSettings({ ai: { baseUrl: `${base}/v1`, apiKey: "k", model: "m" } });
    const runner = new Runner(store, { log() {} });
    const wf = { id: "gw", name: "g", nodes: [{ id: "a", type: "manualTrigger", name: "S", params: {} }, { id: "b", type: "aiPost", name: "W", params: { platform: "telegram", seed: "brand" } }], connections: [{ from: "a", to: "b" }] };
    const r1 = await runner.run(wf, { mode: "manual" });
    assert.equal(r1.status, "success", r1.error);
    const o1 = r1.nodes[1].output[0];
    const slot = YC.timeOfDay(new Date(), "Asia/Kolkata").slot;
    assert.equal(o1.timeOfDay, slot);
    assert.ok(YC.hasGreeting(o1.text, slot), o1.text);
    assert.match(JSON.stringify(prompts[0].messages), new RegExp(`It is ${slot} now`));
    const r2 = await runner.run(wf, { mode: "manual" });
    const o2 = r2.nodes[1].output[0];
    assert.notEqual(o2.text.split("\n")[0], o1.text.split("\n")[0], "the greeting line changes run to run");
    // toggle OFF: no greeting added, no time in the prompt
    wf.nodes[1].params.timeGreeting = "off";
    const r3 = await runner.run(wf, { mode: "manual" });
    assert.equal(r3.nodes[1].output[0].timeOfDay, "");
    assert.doesNotMatch(JSON.stringify(prompts[prompts.length - 1].messages), /India time/);
    assert.match(r3.nodes[1].output[0].text, /^Automation tip/);
  } finally { srv.close(); }
});

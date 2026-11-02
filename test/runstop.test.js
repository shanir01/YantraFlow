"use strict";
// v4.1: Run button toggles to a red Stop while a schedule is ON or a run is going on.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const SCH = require("../public/js/schedule-core.js");
const engine = require("../public/js/engine-core.js");
const { BY_TYPE } = require("../src/nodes");
const { evaluate } = require("../src/expr");
const { Store } = require("../src/store");
const { Runner } = require("../src/runner");

const quiet = { log() {}, error() {}, warn() {} };
const slowWf = (id) => ({ id, name: "Slow one", nodes: [
  { id: "t", type: "manualTrigger", name: "Start", params: {} },
  { id: "d", type: "delay", name: "Wait", params: { seconds: 3 } },
  { id: "s", type: "set", name: "After", params: {} },
], connections: [{ from: "t", to: "d" }, { from: "d", to: "s" }] });

test("run button: Run -> Stop toggle state (schedule ON, one-time run, after reload)", () => {
  // nothing running, no schedule -> Run
  for (const info of [null, undefined, { schedule: null }, { schedule: { mode: "every", every: 30, unit: "minutes", enabled: false } }]) {
    const b = SCH.runButton(info, false);
    assert.equal(b.state, "run"); assert.equal(b.label, "Run"); assert.equal(b.icon, "play");
  }
  // schedule ON (read from saved state after a reload: no in-tab flag needed) -> Stop
  const on = SCH.runButton({ schedule: { mode: "every", every: 30, unit: "minutes", enabled: true } }, false);
  assert.deepEqual([on.state, on.label, on.icon, on.cls, on.reason], ["stop", "Stop", "square", "stop", "schedule"]);
  assert.match(on.title, /Har 30 minute/);
  // one-time run going on in this tab, on the PC server, or a scheduled run in progress -> Stop
  assert.equal(SCH.runButton(null, true).reason, "run");
  assert.equal(SCH.runButton({ schedule: null, manualRunning: true }, false).state, "stop");
  assert.equal(SCH.runButton({ schedule: { enabled: false }, running: true }, false).state, "stop");
  // no emoji on the button
  for (const b of [on, SCH.runButton(null, false)]) assert.doesNotMatch(b.label + b.title, /\p{Extended_Pictographic}/u);
});

test("engine: Stop cancels a run that is waiting inside a node", async () => {
  const ac = new AbortController();
  const t0 = Date.now();
  setTimeout(() => ac.abort(), 150);
  const ex = await engine.runWorkflow(slowWf("w1"), { types: BY_TYPE, evaluate, signal: ac.signal });
  assert.equal(ex.status, "stopped");
  assert.ok(Date.now() - t0 < 1500, "stopped quickly, did not wait for the 3 s delay");
  assert.equal(ex.nodes.find((n) => n.id === "d").status, "stopped");
  assert.ok(!ex.nodes.find((n) => n.id === "s"), "nodes after Stop never run");
  // already-stopped signal: nothing runs
  const ex2 = await engine.runWorkflow(slowWf("w1"), { types: BY_TYPE, evaluate, signal: AbortSignal.abort() });
  assert.equal(ex2.status, "stopped"); assert.equal(ex2.nodes.length, 0);
});

test("PC/Termux runner: cancelRun stops a manual run; stopSchedule also stops a scheduled run in progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yf-stop-"));
  const store = new Store(dir); const runner = new Runner(store, quiet);
  const wf = store.saveWorkflow(slowWf(undefined));
  // manual run -> state says running -> Stop
  const p = runner.runManual(wf);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(runner.isManualRunning(wf.id), true);
  assert.equal(SCH.runButton(runner.scheduleState(wf.id), false).state, "stop");
  assert.deepEqual(runner.cancelRun(wf.id), { stopped: true });
  const ex = await p;
  assert.equal(ex.status, "stopped");
  assert.equal(runner.isManualRunning(wf.id), false);
  assert.equal(SCH.runButton(runner.scheduleState(wf.id), false).state, "run");
  assert.deepEqual(runner.cancelRun(wf.id), { stopped: false });
  // schedule ON with a run in progress -> Stop; stopSchedule -> schedule off + run cancelled -> Run
  const started = runner.setSchedule(wf.id, { mode: "every", every: 30, unit: "minutes", runNow: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(SCH.runButton(runner.getSchedule(wf.id), false).state, "stop");
  runner.stopSchedule(wf.id);
  const res = await started;
  assert.equal(res.execution.status, "stopped");
  assert.equal(res.info.schedule.enabled, false);
  // a fresh Runner (= after restart / page reload) reads the saved state: still Run
  assert.equal(SCH.runButton(new Runner(store, quiet).getSchedule(wf.id), false).state, "run");
  fs.rmSync(dir, { recursive: true, force: true });
});

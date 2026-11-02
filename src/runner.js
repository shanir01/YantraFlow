"use strict";
// Connects the shared engine to the Node-only pieces: node definitions,
// expressions (vm), storage and the scheduler for active workflows.
const engine = require("../public/js/engine-core.js");
const { BY_TYPE } = require("./nodes");
const { evaluate } = require("./expr");
const { parseCron, cronMatches } = require("./cron");

class Runner {
  constructor(store, log = console) {
    this.store = store;
    this.log = log;
    this.timers = [];
    this.lastFire = {}; // key -> ms
    this.running = new Set();
  }
  async run(wf, { triggerNodeId, triggerData, mode } = {}) {
    const exec = await engine.runWorkflow(JSON.parse(JSON.stringify(wf)), {
      types: BY_TYPE, evaluate, triggerNodeId, triggerData, mode,
      settings: this.store.getSettings(),
      extraCtx: { filesDir: this.store.filesDir },
    });
    this.store.saveExecution(exec);
    const tag = exec.status === "success" ? "ok " : "ERR";
    this.log.log(`[run] ${tag} ${wf.name} (${exec.mode}, ${exec.durationMs} ms)${exec.error ? " — " + exec.error : ""}`);
    return exec;
  }
  activeTriggers(kind) {
    const out = [];
    for (const wf of this.store.listWorkflows()) {
      if (!wf.active) continue;
      for (const n of engine.findTriggers(wf, BY_TYPE, kind)) out.push({ wf, node: n });
    }
    return out;
  }
  findWebhook(pathName, method) {
    const clean = String(pathName).replace(/^\/+|\/+$/g, "");
    for (const { wf, node } of this.activeTriggers("webhook")) {
      const p = String((node.params || {}).path || "").replace(/^\/+|\/+$/g, "");
      const m = String((node.params || {}).method || "ANY").toUpperCase();
      if (p === clean && (m === "ANY" || m === method)) return { wf, node };
    }
    return null;
  }
  // Called every few seconds. `now` is injectable for tests.
  async tick(now = new Date()) {
    const jobs = [];
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    for (const { wf, node } of this.activeTriggers("schedule")) {
      const p = node.params || {};
      const key = `${wf.id}:${node.id}`;
      if ((p.mode || "interval") === "cron") {
        let cron; try { cron = parseCron(p.cron || "0 9 * * *"); } catch (e) { continue; }
        if (cronMatches(cron, now) && this.lastFire[key] !== minuteKey) { this.lastFire[key] = minuteKey; jobs.push({ wf, node, data: {} }); }
      } else {
        const every = Math.max(1, Number(p.minutes) || 60) * 60000;
        if (this.lastFire[key] === undefined) { this.lastFire[key] = now.getTime(); continue; }
        if (now.getTime() - this.lastFire[key] >= every) { this.lastFire[key] = now.getTime(); jobs.push({ wf, node, data: {} }); }
      }
    }
    const state = this.store.getState();
    let stateChanged = false;
    for (const { wf, node } of this.activeTriggers("poll")) {
      const def = BY_TYPE[node.type];
      const key = `${wf.id}:${node.id}`;
      const every = def.pollEverySeconds(node.params || {}) * 1000;
      if (this.lastFire[key] !== undefined && now.getTime() - this.lastFire[key] < every) continue;
      if (this.running.has(key)) continue;
      this.lastFire[key] = now.getTime();
      const st = state[key] || (state[key] = {});
      try {
        const raw = Object.assign({}, ...def.params.map((x) => ({ [x.key]: x.default })), node.params || {});
        const items = await def.poll({ raw, filesDir: this.store.filesDir, settings: this.store.getSettings() }, st);
        stateChanged = true;
        if (items.length) jobs.push({ wf, node, data: { pollItems: items } });
      } catch (e) {
        this.log.log(`[poll] ${wf.name} / ${node.name}: ${e.message}`);
      }
    }
    if (stateChanged) this.store.saveState(state);
    const results = [];
    for (const j of jobs) {
      const key = `${j.wf.id}:${j.node.id}`;
      this.running.add(key);
      results.push(this.run(j.wf, { triggerNodeId: j.node.id, triggerData: j.data, mode: j.node.type === "scheduleTrigger" ? "schedule" : "trigger" })
        .finally(() => this.running.delete(key)));
    }
    return Promise.all(results);
  }
  start(intervalMs = 5000) {
    const t = setInterval(() => { this.tick().catch((e) => this.log.log("[scheduler] " + e.message)); }, intervalMs);
    t.unref && t.unref();
    this.timers.push(t);
  }
  stop() { this.timers.forEach(clearInterval); this.timers = []; }
}
module.exports = { Runner };

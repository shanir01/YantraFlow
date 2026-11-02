"use strict";
// Connects the shared engine to the Node-only pieces: node definitions,
// expressions (vm), storage and the scheduler for active workflows.
const engine = require("../public/js/engine-core.js");
const { BY_TYPE } = require("./nodes");
const { evaluate } = require("./expr");
const { parseCron, cronMatches } = require("./cron");
const SCH = require("../public/js/schedule-core.js");

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
      extraCtx: { filesDir: this.store.filesDir, dataDir: this.store.dir },
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

  // ---------- v4 schedules (Run once / Repeat every N / Daily at HH:MM), saved in data/schedules.json
  scheduleInfo(id, e, now = Date.now()) {
    if (!e) return null;
    const next = SCH.nextRun(e.schedule, e, now);
    return { workflowId: id, schedule: e.schedule, startedAt: e.startedAt || null, lastRunAt: e.lastRunAt || null, nextRunAt: next == null ? null : new Date(Math.max(next, now)).toISOString(), running: this.running.has(`sched:${id}`), runs: e.runs || 0, log: (e.log || []).slice(-20).reverse(), describe: SCH.describe(e.schedule) };
  }
  listSchedules() {
    const all = this.store.getSchedules(); const out = {};
    for (const [id, e] of Object.entries(all)) out[id] = this.scheduleInfo(id, e);
    return out;
  }
  getSchedule(id) { return this.scheduleInfo(id, this.store.getSchedules()[id]); }
  /* input: { mode, every, unit, at, tz, runNow } -> { info, warnings, execution? } */
  async setSchedule(id, input = {}, now = Date.now()) {
    const wf = this.store.getWorkflow(id);
    if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
    const { schedule, warnings } = SCH.normalize(input);
    if (schedule.mode === "once") {
      const ex = await this.run(wf, { triggerNodeId: this.startNode(wf), mode: "manual" });
      return { info: this.getSchedule(id), warnings, execution: ex };
    }
    const all = this.store.getSchedules();
    const prev = all[id] || {};
    all[id] = { schedule, startedAt: new Date(now).toISOString(), lastRunAt: null, runs: prev.runs || 0, log: prev.log || [] };
    this.store.saveSchedules(all);
    let execution;
    if (input.runNow) execution = await this.runScheduled(id, now, "schedule");
    return { info: this.getSchedule(id), warnings, execution };
  }
  stopSchedule(id) {
    const all = this.store.getSchedules();
    if (!all[id]) return null;
    all[id].schedule.enabled = false; this.store.saveSchedules(all);
    return this.getSchedule(id);
  }
  removeSchedule(id) { const all = this.store.getSchedules(); if (all[id]) { delete all[id]; this.store.saveSchedules(all); } }
  startNode(wf) {
    const trig = engine.findTriggers(wf, BY_TYPE);
    const n = trig.find((t) => t.type === "manualTrigger" || t.type === "scheduleTrigger") || trig[0];
    return n ? n.id : undefined;
  }
  async runScheduled(id, now = Date.now(), mode = "schedule") {
    const key = `sched:${id}`;
    if (this.running.has(key)) return null;
    const wf = this.store.getWorkflow(id);
    let all = this.store.getSchedules();
    if (!wf) { delete all[id]; this.store.saveSchedules(all); return null; }
    if (!all[id]) return null;
    all[id].lastRunAt = new Date(now).toISOString(); // claim this slot first (no double runs)
    this.store.saveSchedules(all);
    this.running.add(key);
    let ex;
    try { ex = await this.run(wf, { triggerNodeId: this.startNode(wf), mode }); }
    catch (e) { ex = { id: null, status: "error", error: e.message }; }
    finally { this.running.delete(key); }
    all = this.store.getSchedules();
    if (all[id]) {
      all[id].runs = (all[id].runs || 0) + 1;
      all[id].log = (all[id].log || []).concat([{ at: new Date(now).toISOString(), status: ex.status, error: ex.error || null, executionId: ex.id }]).slice(-50);
      this.store.saveSchedules(all);
    }
    return ex;
  }
  scheduleJobs(now) {
    const jobs = [];
    for (const [id, e] of Object.entries(this.store.getSchedules())) {
      if (!e || !e.schedule || !e.schedule.enabled) continue;
      if (this.running.has(`sched:${id}`)) continue;
      if (SCH.isDue(e.schedule, e, now.getTime())) jobs.push(this.runScheduled(id, now.getTime()));
    }
    return jobs;
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
    const results = this.scheduleJobs(now);
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

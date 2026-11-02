"use strict";
// Local storage in plain JSON files (no database needed — works on Termux).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class Store {
  constructor(dir) {
    this.dir = dir;
    this.wfDir = path.join(dir, "workflows");
    this.exDir = path.join(dir, "executions");
    this.filesDir = path.join(dir, "files");
    for (const d of [dir, this.wfDir, this.exDir, this.filesDir]) fs.mkdirSync(d, { recursive: true });
    this.maxExecutions = Number(process.env.YANTRAFLOW_MAX_RUNS) || 300;
  }
  writeJson(file, obj) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  }
  readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
  }
  newId() { return crypto.randomBytes(5).toString("hex"); }

  // ---- workflows
  listWorkflows() {
    return fs.readdirSync(this.wfDir).filter((f) => f.endsWith(".json")).map((f) => this.readJson(path.join(this.wfDir, f), null)).filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  getWorkflow(id) {
    if (!/^[a-z0-9_-]+$/i.test(id)) return null;
    return this.readJson(path.join(this.wfDir, `${id}.json`), null);
  }
  saveWorkflow(wf) {
    const now = new Date().toISOString();
    if (!wf.id || !/^[a-z0-9_-]+$/i.test(wf.id)) wf.id = this.newId();
    const old = this.getWorkflow(wf.id);
    const clean = {
      id: wf.id,
      name: String(wf.name || "My workflow").slice(0, 120),
      active: !!wf.active,
      description: wf.description || "",
      nodes: Array.isArray(wf.nodes) ? wf.nodes : [],
      connections: Array.isArray(wf.connections) ? wf.connections : [],
      createdAt: (old && old.createdAt) || wf.createdAt || now,
      updatedAt: now,
    };
    this.writeJson(path.join(this.wfDir, `${clean.id}.json`), clean);
    return clean;
  }
  deleteWorkflow(id) {
    const f = path.join(this.wfDir, `${id}.json`);
    if (/^[a-z0-9_-]+$/i.test(id) && fs.existsSync(f)) { fs.unlinkSync(f); return true; }
    return false;
  }

  // ---- executions
  saveExecution(ex) {
    this.writeJson(path.join(this.exDir, `${ex.id}.json`), ex);
    this.pruneExecutions();
  }
  pruneExecutions() {
    const files = fs.readdirSync(this.exDir).filter((f) => f.endsWith(".json"));
    if (files.length <= this.maxExecutions) return;
    const withTime = files.map((f) => ({ f, t: fs.statSync(path.join(this.exDir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
    for (const x of withTime.slice(0, files.length - this.maxExecutions)) fs.unlinkSync(path.join(this.exDir, x.f));
  }
  listExecutions(workflowId) {
    return fs.readdirSync(this.exDir).filter((f) => f.endsWith(".json")).map((f) => this.readJson(path.join(this.exDir, f), null)).filter(Boolean)
      .filter((e) => !workflowId || e.workflowId === workflowId)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .map(({ nodes, logs, lastOutput, response, ...summary }) => ({ ...summary, nodeCount: (nodes || []).length, failedNode: ((nodes || []).find((n) => n.status === "error") || {}).name || null }));
  }
  getExecution(id) {
    if (!/^[a-z0-9_-]+$/i.test(id)) return null;
    return this.readJson(path.join(this.exDir, `${id}.json`), null);
  }
  clearExecutions() {
    for (const f of fs.readdirSync(this.exDir)) fs.unlinkSync(path.join(this.exDir, f));
  }

  // ---- settings (credentials) & poll state
  getSettings() { return this.readJson(path.join(this.dir, "credentials.json"), {}); }
  saveSettings(s) { this.writeJson(path.join(this.dir, "credentials.json"), s); try { fs.chmodSync(path.join(this.dir, "credentials.json"), 0o600); } catch (_) { /* windows */ } }
  // ---- v4 schedules ("Run once / every N / daily at HH:MM") — survive restarts
  getSchedules() { return this.readJson(path.join(this.dir, "schedules.json"), {}); }
  saveSchedules(o) { this.writeJson(path.join(this.dir, "schedules.json"), o); }
  getState() { return this.readJson(path.join(this.dir, "trigger-state.json"), {}); }
  saveState(s) { this.writeJson(path.join(this.dir, "trigger-state.json"), s); }
}
module.exports = { Store };

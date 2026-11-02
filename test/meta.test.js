"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { publicNodeList, NODES } = require("../src/nodes");

test("public/js/node-meta.js matches src/nodes.js (run: npm run build:meta)", () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/node-meta.js"), "utf8"), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.YF_NODE_META)), JSON.parse(JSON.stringify(publicNodeList())));
});
test("every node has label, icon, group, run and sane params", () => {
  for (const n of NODES) {
    assert.ok(n.label && n.icon && n.group && typeof n.run === "function", n.type);
    for (const p of n.params) assert.ok(p.key && p.label && p.type, `${n.type}.${p.key}`);
    if (n.trigger) assert.equal(n.inputs, 0);
  }
});
test("templates only use known nodes and connect real node ids", () => {
  const dir = path.join(__dirname, "../public/templates");
  const idx = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  assert.ok(idx.length >= 5);
  const types = new Set(NODES.map((n) => n.type));
  for (const t of idx) {
    const wf = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
    const ids = new Set(wf.nodes.map((n) => n.id));
    for (const n of wf.nodes) assert.ok(types.has(n.type), `${t.key}: ${n.type}`);
    for (const c of wf.connections) assert.ok(ids.has(c.from) && ids.has(c.to), `${t.key} connection`);
  }
});
test("no secrets or tokens committed in public files", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(__dirname, "../public")).filter((f) => /\.(js|json|html)$/.test(f) && !f.includes("vendor"))) {
    const t = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(t, /sk-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|\d{8,10}:AA[0-9A-Za-z_-]{30,}/, f);
  }
});

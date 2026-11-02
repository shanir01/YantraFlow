"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../public/js/engine-core.js");
const { BY_TYPE } = require("../src/nodes");
const { evaluate } = require("../src/expr");

const run = (wf, extra = {}) => engine.runWorkflow(wf, Object.assign({ types: BY_TYPE, evaluate, settings: {}, extraCtx: { filesDir: require("node:os").tmpdir() } }, extra));
const n = (id, type, params = {}, more = {}) => Object.assign({ id, type, name: id, params }, more);

test("set → code → IF branches; untouched branch is skipped", async () => {
  const wf = { name: "t", nodes: [
    n("t", "manualTrigger", { testData: '[{"price":50},{"price":150}]' }),
    n("s", "set", { fields: "label = item-{{ $json.price }}" }),
    n("c", "code", { code: "return items.map(i => ({...i, double: i.price * 2}))" }),
    n("if", "if", { left: "{{ $json.double }}", op: "greater than", right: "200" }),
    n("big", "log", { message: "big {{ $json.label }}" }),
    n("small", "log", { message: "small {{ $json.label }}" }),
  ], connections: [{ from: "t", to: "s" }, { from: "s", to: "c" }, { from: "c", to: "if" }, { from: "if", fromOutput: 0, to: "big" }, { from: "if", fromOutput: 1, to: "small" }] };
  const ex = await run(wf);
  assert.equal(ex.status, "success", ex.error);
  const rec = Object.fromEntries(ex.nodes.map((r) => [r.id, r]));
  assert.equal(rec.big.inputCount, 1); assert.equal(rec.small.inputCount, 1);
  assert.deepEqual(ex.logs.map((l) => l.msg).sort(), ["big item-150", "small item-50"]);
  // only false items -> true branch skipped
  wf.nodes[0].params.testData = '{"price":1}';
  const ex2 = await run(wf);
  assert.equal(ex2.nodes.find((r) => r.id === "big").status, "skipped");
});

test("switch routes, filter limits, $node lookups", async () => {
  const wf = { name: "t", nodes: [
    n("t", "manualTrigger", { testData: '[{"type":"news","t":1},{"type":"meme","t":2},{"type":"x","t":3},{"type":"news","t":4}]' }),
    n("sw", "switch", { value: "{{ $json.type }}", case1: "news", case2: "meme", case3: "" }),
    n("f", "filter", { max: 1 }),
    n("e", "set", { fields: "first = {{ $node.t.json.type }}" }),
  ], connections: [{ from: "t", to: "sw" }, { from: "sw", fromOutput: 0, to: "f" }, { from: "sw", fromOutput: 3, to: "e" }] };
  const ex = await run(wf);
  assert.equal(ex.status, "success", ex.error);
  const sw = ex.nodes.find((r) => r.id === "sw");
  assert.equal(sw.output[0].length, 2); assert.equal(sw.output[1].length, 1); assert.equal(sw.output[3].length, 1);
  assert.equal(ex.nodes.find((r) => r.id === "f").outputCount, 1);
  assert.equal(ex.nodes.find((r) => r.id === "e").output[0].first, "news");
});

test("errors stop the run, continueOnFail keeps going, loops are refused", async () => {
  const wf = { name: "t", nodes: [n("t", "manualTrigger"), n("c", "code", { code: "throw new Error('boom')" }), n("l", "log", { message: "after" })], connections: [{ from: "t", to: "c" }, { from: "c", to: "l" }] };
  const ex = await run(wf);
  assert.equal(ex.status, "error"); assert.match(ex.error, /boom/);
  wf.nodes[1].continueOnFail = true;
  const ex2 = await run(wf);
  assert.equal(ex2.status, "success"); assert.equal(ex2.logs[0].msg, "after");
  const loop = { name: "l", nodes: [n("t", "manualTrigger"), n("a", "log"), n("b", "log")], connections: [{ from: "t", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "a" }] };
  const ex3 = await run(loop);
  assert.equal(ex3.status, "error"); assert.match(ex3.error, /Loop/);
  const none = await run({ name: "x", nodes: [n("a", "log")], connections: [] });
  assert.match(none.error, /trigger/);
});

test("delay waits and disabled nodes pass data through", async () => {
  const wf = { name: "t", nodes: [n("t", "manualTrigger"), n("d", "delay", { seconds: 0.2 }), n("x", "code", { code: "throw new Error('x')" }, { disabled: true }), n("l", "log", { message: "ok" })], connections: [{ from: "t", to: "d" }, { from: "d", to: "x" }, { from: "x", to: "l" }] };
  const t0 = Date.now(); const ex = await run(wf);
  assert.equal(ex.status, "success", ex.error); assert.ok(Date.now() - t0 >= 190);
  assert.equal(ex.nodes.find((r) => r.id === "x").status, "disabled");
});

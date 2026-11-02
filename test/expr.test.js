"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate } = require("../src/expr");

test("expressions: text, raw values, nodes", () => {
  const base = { $json: { title: "Hi", n: 2, tags: ["a"] }, $node: { "AI Chat": { json: { text: "yo" } } } };
  assert.equal(evaluate("Title: {{ $json.title }}!", base), "Title: Hi!");
  assert.equal(evaluate("{{ $json.n * 2 }}", base), 4);
  assert.deepEqual(evaluate("{{ $json.tags }}", base), ["a"]);
  assert.equal(evaluate("{{ $node['AI Chat'].json.text }} + {{ $json.tags }}", base), 'yo + ["a"]');
  assert.equal(evaluate("plain", base), "plain");
  assert.match(evaluate("{{ $today }}", base), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => evaluate("{{ nope.x }}", base), /Expression/);
});
test("expressions cannot hang forever", () => {
  assert.throws(() => evaluate("{{ (() => { while(true){} })() }}", {}), /timed out|Expression/);
});

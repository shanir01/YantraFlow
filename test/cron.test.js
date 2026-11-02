"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCron, cronMatches, nextRun } = require("../src/cron");

test("cron: daily 9:00", () => {
  assert.equal(cronMatches("0 9 * * *", new Date(2026, 10, 2, 9, 0)), true);
  assert.equal(cronMatches("0 9 * * *", new Date(2026, 10, 2, 9, 1)), false);
});
test("cron: steps, ranges, lists, names", () => {
  assert.equal(cronMatches("*/15 * * * *", new Date(2026, 0, 1, 3, 45)), true);
  assert.equal(cronMatches("*/15 * * * *", new Date(2026, 0, 1, 3, 46)), false);
  assert.equal(cronMatches("30 18 * * 1-5", new Date(2026, 10, 2, 18, 30)), true); // Monday
  assert.equal(cronMatches("30 18 * * 1-5", new Date(2026, 10, 1, 18, 30)), false); // Sunday
  assert.equal(cronMatches("0 8 * * sun", new Date(2026, 10, 1, 8, 0)), true);
  assert.equal(cronMatches("0 0 1,15 * *", new Date(2026, 4, 15, 0, 0)), true);
  assert.equal(cronMatches("@daily", new Date(2026, 4, 15, 0, 0)), true);
});
test("cron: next run + bad input", () => {
  const n = nextRun("0 7 * * *", new Date(2026, 10, 2, 7, 30));
  assert.equal(n.getDate(), 3); assert.equal(n.getHours(), 7);
  assert.throws(() => parseCron("61 * * * *"));
  assert.throws(() => parseCron("* * *"));
});

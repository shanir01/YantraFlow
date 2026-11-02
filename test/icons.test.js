// Icons: every node / project / key-page icon is a real bundled SVG (no emoji as icons).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PUB = path.join(__dirname, "..", "public");
const yfIcon = require(path.join(PUB, "js", "icons.js"));
const { publicNodeList } = require("../src/nodes");
const EMOJI = /(?![\u2713\u2717\u2715])[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u; // plain ✓ ✗ ✕ text marks are fine

test("every node icon is a bundled SVG", () => {
  for (const n of publicNodeList()) {
    assert.ok(yfIcon.has(n.icon), `${n.type} -> ${n.icon}`);
    assert.match(yfIcon(n.icon, 20), /^<svg [^>]*viewBox="0 0 24 24"/);
  }
  for (const b of ["telegram", "youtube", "instagram", "facebook", "gmail", "x", "discord", "slack", "rss", "googlesheets"]) assert.ok(yfIcon.isBrand(b), b);
});

test("project, template and key-page icons are bundled SVGs", () => {
  const projects = require(path.join(PUB, "js", "projects.js"));
  assert.ok(projects.length >= 12);
  for (const p of projects) assert.ok(yfIcon.has(p.icon), `${p.id} -> ${p.icon}`);
  for (const s of require(path.join(PUB, "js", "cred-schema.js"))) assert.ok(yfIcon.has(s.icon), `${s.id} -> ${s.icon}`);
  for (const t of JSON.parse(fs.readFileSync(path.join(PUB, "templates", "index.json"), "utf8"))) assert.ok(yfIcon.has(t.icon), `${t.key} -> ${t.icon}`);
});

test("no emoji used in the app UI code", () => {
  for (const f of ["index.html", "js/app.js", "js/platform.js", "js/icons.js", "js/cred-schema.js", "js/node-meta.js"]) {
    const src = fs.readFileSync(path.join(PUB, f), "utf8").replace(/"default": "Hello from YantraFlow 🚀"/, "");
    const m = src.match(EMOJI);
    assert.equal(m, null, `${f} still has ${m && m[0]}`);
  }
});

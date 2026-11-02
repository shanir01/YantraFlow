// v4.6: frozen top bar, scroll slots, per-project Error Center (latest run only), Keys cards closed by default,
// no option in two places (top nav vs avatar popup vs profile vs footer), Videos & Tutorial in the top nav.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const PUB = path.join(__dirname, "..", "public");
const read = (...p) => fs.readFileSync(path.join(PUB, ...p), "utf8");
const C = require(path.join(PUB, "js", "v45-core.js"));

test("sticky header: body grows with the page so the top bar never scrolls away; no terminal / bug in the top bar", () => {
  const prem = read("css", "premium.css"); const v46 = prem.slice(prem.indexOf("v4.6"));
  assert.ok(v46.length > 10, "v4.6 css block");
  assert.match(v46, /body\{height:auto;min-height:100%/); // app.css had html,body{height:100%} -> sticky bar left with body's bottom edge
  assert.match(v46, /\.topbar\{position:sticky;[^}]*top:0/);
  const html = read("index.html"); assert.ok(html.indexOf("css/premium.css") > html.indexOf("css/app.css"), "premium.css loads last");
  const head = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>"));
  assert.ok(!/terminal|Termux/i.test(head), "no Terminal / Termux in the top bar");
  const ui = read("js", "ui-plus.js"); const chrome = ui.slice(ui.indexOf("function chrome()"), ui.indexOf("function chrome()") + 200);
  assert.ok(!/term-btn|errButton\("errBtn"\)|data-v="terminal"/.test(chrome), "chrome() adds nothing to the top bar");
  assert.ok(read("js", "app.js").includes('errButton("edErr")'), "bug button stays inside the editor");
});

test("top nav: Videos & Tutorial replaces Projects (top bar + phone bar); popup and footer don't repeat it", () => {
  const html = read("index.html");
  const head = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>"));
  const bottom = html.slice(html.indexOf('<nav class="bottomnav"'), html.indexOf("</nav>", html.indexOf('<nav class="bottomnav"')));
  for (const part of [head, bottom]) { assert.ok(part.includes('href="#/videos"'), "videos in nav"); assert.ok(!part.includes('href="#/projects"'), "projects not in nav"); }
  assert.ok(head.includes("Videos &amp; Tutorial"));
  const plat = read("js", "platform.js"); const menu = plat.slice(plat.indexOf("function toggleMenu()"), plat.indexOf("function cloudCheck()"));
  assert.ok(!menu.includes("#/videos"), "Videos removed from the avatar popup");
  const site = read("js", "site.js"); const foot = site.slice(site.indexOf("function footer("), site.indexOf("function syncFooter("));
  assert.ok(!foot.includes("#/videos"), "footer has no second Videos link");
});

test("no duplicate menu items: each option lives in exactly one place", () => {
  const html = read("index.html"); const plat = read("js", "platform.js");
  const hrefs = (s) => [...s.matchAll(/href="(#\/[a-z-]+)"/g)].map((m) => m[1]);
  const head = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>"));
  const topNav = hrefs(head.slice(head.indexOf('<nav class="nav"'), head.indexOf("</nav>")));
  const menu = hrefs(plat.slice(plat.indexOf("function toggleMenu()"), plat.indexOf("function cloudCheck()")));
  assert.deepStrictEqual(topNav.filter((h) => menu.includes(h)), [], "top nav vs avatar popup");
  assert.equal(new Set(menu).size, menu.length, "popup has no repeats");
  for (const h of ["#/profile", "#/projects", "#/settings", "#/about", "#/developer"]) assert.ok(menu.includes(h), "popup has " + h);
  // profile page = only the profile (no buttons list: settings/keys/projects/about/developer/generator/tips/logout)
  const prof = plat.slice(plat.indexOf("function viewProfile()"), plat.indexOf("function resizeImage("));
  for (const s of ["menu-list", "#/settings", "#/keys", "#/projects", "#/about", "#/developer", "#/generator", "ptips", "plo", "adm-entry"]) assert.ok(!prof.includes(s), "profile has no " + s);
  // settings-type things live in Settings; Settings doesn't repeat the Keys nav link
  const set = plat.slice(plat.indexOf("async function viewSettings()"), plat.indexOf("function viewAbout") > 0 ? plat.indexOf("function viewAbout") : undefined);
  assert.ok(set.includes("Tips wapas dikhao"), "tips reset is in Settings");
  assert.ok(!set.includes('href="#/keys"'), "no second Keys link");
  // AI Project Generator: only on the Workflows page (not again on Projects / profile)
  assert.ok(!plat.includes('href="#/generator"'), "generator not repeated in platform pages");
  assert.ok(read("js", "app.js").includes('href="#/generator"'));
  // phone bottom bar doesn't repeat the avatar's Profile
  const bottom = html.slice(html.indexOf('<nav class="bottomnav"'), html.indexOf("</nav>", html.indexOf('<nav class="bottomnav"')));
  assert.ok(!bottom.includes("#/profile"));
});

test("error scope: only the open project's errors, only its latest run (a new run replaces, a success clears)", () => {
  const ex = (id, wid, status, nodes) => ({ id, workflowId: wid, workflowName: wid, status, error: status === "error" ? "boom" : null, nodes });
  let list = [];
  list = C.replaceRunErrors(list, ex("r1", "A", "error", [{ id: "n1", name: "TG", type: "telegram", status: "error", error: "Bad Request: chat not found" }]));
  list = C.replaceRunErrors(list, ex("r2", "B", "error", [{ id: "n9", name: "AI", type: "aiChat", status: "error", error: "401 Unauthorized" }]));
  assert.equal(C.errorsFor(list, "A").length, 1); assert.equal(C.errorsFor(list, "B").length, 1);
  assert.equal(C.errorsFor(list, "A")[0].error, "Bad Request: chat not found");
  assert.deepStrictEqual(C.errorsFor(list, null), [], "outside a project: nothing");
  // second run of A with a different failure: A's old row is gone (no history), B untouched
  list = C.replaceRunErrors(list, ex("r3", "A", "error", [{ id: "n2", name: "HTTP", type: "httpRequest", status: "error", error: "timeout" }, { id: "n3", name: "X", type: "set", status: "error", error: "bad" }]));
  assert.deepStrictEqual(C.errorsFor(list, "A").map((e) => e.executionId), ["r3", "r3"]);
  assert.equal(C.errorsFor(list, "B").length, 1);
  // a successful run clears A
  list = C.replaceRunErrors(list, ex("r4", "A", "success", [{ id: "n1", status: "success" }]));
  assert.deepStrictEqual(C.errorsFor(list, "A"), []); assert.equal(C.errorsFor(list, "B").length, 1);
  // run without workflowId on the execution: the editor passes the workflow
  list = C.replaceRunErrors(list, { id: "r5", status: "error", error: "x", nodes: [{ id: "q", name: "Q", type: "code", status: "error", error: "x" }] }, { id: "C", name: "C" });
  assert.equal(C.errorsFor(list, "C").length, 1);
  // UI: no History tab, panel scoped to the editor's workflow
  const ui = read("js", "ui-plus.js");
  assert.ok(!ui.includes(">History<"), "no history tab");
  assert.ok(ui.includes("C.errorsFor(load()"));
});

test("Keys cards: closed by default (icon, name, n field(s), saved badge), button toggle with aria-expanded", () => {
  const app = read("js", "app.js"); const keys = app.slice(app.indexOf("async function viewKeys("), app.indexOf("// ---------- editor"));
  assert.ok(!/<details class="card cred"/.test(keys), "no <details> (its toggle re-opened cards)");
  assert.ok(!/sec\.id === "ai" \|\| sec\.id === "telegram" \? "open"/.test(keys), "AI / Telegram no longer forced open");
  assert.match(keys, /class="cred-sum" aria-expanded="false"/);
  assert.match(keys, /class="cred-body" id="cb-\$\{sec\.id\}" hidden/);
  for (const s of ["field(s)", "● saved", "chevron-down"]) assert.ok(keys.includes(s), s);
  const tg = app.slice(app.indexOf("function toggleCred("), app.indexOf("function wireCredCards("));
  assert.ok(tg.includes('getAttribute("aria-expanded") !== "true"') && tg.includes("body.hidden = true"), "second tap closes and stays closed");
  assert.ok(read("css", "premium.css").includes(".cred-body{overflow:hidden;transition:height"));
});

test("scroll slots on Run history, Keys and Public projects; Import icons are import / file-json / link", () => {
  const app = read("js", "app.js"); const plat = read("js", "platform.js");
  const runs = app.slice(app.indexOf("async function viewRuns()"), app.indexOf("async function viewRun("));
  assert.ok(runs.includes('class="yf-slot" data-slot'));
  assert.ok(app.slice(app.indexOf("async function viewKeys("), app.indexOf("// ---------- editor")).includes('class="yf-slot" data-slot'));
  assert.ok(plat.slice(plat.indexOf("function viewProjects()"), plat.indexOf("const TPL_TYPES")).includes("data-slot"));
  assert.ok(app.includes("function fitSlots()") && app.includes("sitefoot"));
  const imp = app.slice(app.indexOf("function openImportMenu("), app.indexOf("async function importFromLink("));
  assert.match(imp, /ic: "file-json", label: "From file \(\.json\)"/); assert.ok(imp.includes('I("import", 15)}<b>Import a workflow'));
  const yfIcon = require(path.join(PUB, "js", "icons.js")); for (const n of ["import", "file-json", "link", "monitor-play"]) assert.ok(yfIcon.has(n), n);
});

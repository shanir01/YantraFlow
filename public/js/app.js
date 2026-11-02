/* YantraFlow UI — vanilla JS + Drawflow (MIT). */
(function () {
  "use strict";
  const REPO = "https://github.com/shanir01/YantraFlow";
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const META = Object.fromEntries(window.YF_NODE_META.map((m) => [m.type, m]));
  const GROUPS = ["Triggers", "Core", "Logic", "AI", "Social & Messaging", "Data"];
  const isMobile = () => window.matchMedia("(max-width:820px)").matches;
  let B = null; // backend
  const view = () => $("#view");

  // ---------- helpers
  function toast(msg, kind = "") {
    const t = $("#toast"); t.textContent = msg; t.className = `toast show ${kind}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), kind === "err" ? 6000 : 2600);
  }
  function ago(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString();
  }
  function icon(type, size = 32) {
    const m = META[type] || { icon: "❔", color: "#666" };
    return `<span class="chip" style="width:${size}px;height:${size}px;background:${m.color}26;border-color:${m.color}55" title="${esc(m.label)}">${m.icon}</span>`;
  }
  function chain(types) { return `<div class="chain">${types.slice(0, 7).map((t, i) => (i ? '<span class="arrow">→</span>' : "") + icon(t)).join("")}</div>`; }
  function statusPill(st) { const m = { success: "✓ Success", error: "✗ Failed", running: "● Running", skipped: "Skipped", disabled: "Disabled" }; return `<span class="status ${st}">${m[st] || st}</span>`; }
  function download(name, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function pickFile() {
    return new Promise((resolve) => {
      const i = document.createElement("input"); i.type = "file"; i.accept = ".json,application/json";
      i.onchange = async () => resolve(i.files[0] ? await i.files[0].text() : null); i.click();
    });
  }
  async function importFlow() {
    const txt = await pickFile(); if (!txt) return;
    try { const wf = await B.importWorkflow(JSON.parse(txt)); toast("Imported ✓", "ok"); location.hash = `#/editor/${wf.id}`; }
    catch (e) { toast("Import failed: " + e.message, "err"); }
  }
  function setNav(name) { $$(".nav a, .bottomnav a").forEach((a) => a.classList.toggle("on", a.dataset.v === name)); }
  function webBanner() {
    if (B.edition !== "web") return "";
    return `<div class="banner"><span style="font-size:22px">🌐</span><div style="flex:1;min-width:220px"><b>Web version</b> — works right here in your browser, saved on this device. Webhooks, Folder Watch, YouTube upload, email &amp; file saving need the free <b>full version</b> on your PC or phone (Termux).</div><a class="btn sm primary" href="${REPO}" target="_blank" rel="noopener">⬇ Download full version</a></div>`;
  }

  // ---------- views
  async function viewWorkflows() {
    setNav("workflows");
    const list = await B.listWorkflows();
    view().innerHTML = `<div class="page">${webBanner()}
      <div class="hero-h"><div><h1 class="h">Your <span class="g">automations</span></h1><p class="sub">Build once, it runs by itself — on your PC or your phone. Free &amp; local.</p></div>
      <div class="row"><button class="btn" id="imp">⤓ Import</button><button class="btn primary" id="new">＋ New workflow</button></div></div>
      ${list.length ? `<div class="grid">${list.map((w) => `
        <div class="card" data-id="${w.id}">
          <div class="row" style="justify-content:space-between;align-items:flex-start"><h3>${esc(w.name)}</h3>
            <label class="switch" title="Active = runs by itself"><input type="checkbox" data-act="${w.id}" ${w.active ? "checked" : ""}><span class="tr"></span></label></div>
          ${chain(w.nodeTypes)}
          <div class="row" style="justify-content:space-between"><span class="meta">${w.nodeCount} nodes · ${w.lastRun ? `last run ${ago(w.lastRun.startedAt)} ${w.lastRun.status === "success" ? "✅" : "❌"}` : "never run"}</span>
          <div class="row"><button class="btn sm" data-run="${w.id}">▶ Run</button><a class="btn sm primary" href="#/editor/${w.id}">Open</a></div></div>
        </div>`).join("")}</div>`
        : `<div class="empty"><div class="big">⚡</div><h3>No workflows yet</h3><p>Start from a ready-made project — viral script generator, Reel auto-post, YouTube upload, Gmail summary…</p><p class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="#/projects">🧩 Browse public projects</a><button class="btn" id="new2">＋ Blank workflow</button></p></div>`}
    </div>`;
    $("#new") && ($("#new").onclick = () => (location.hash = "#/editor/new"));
    $("#new2") && ($("#new2").onclick = () => (location.hash = "#/editor/new"));
    $("#imp").onclick = importFlow;
    $$("[data-act]").forEach((el) => (el.onchange = async () => {
      try { await B.setActive(el.dataset.act, el.checked); toast(el.checked ? "Active — it will run by itself ⚡" : "Paused", "ok"); }
      catch (e) { el.checked = !el.checked; toast(e.message, "err"); }
    }));
    $$("[data-run]").forEach((el) => (el.onclick = async () => {
      el.disabled = true; el.textContent = "Running…";
      try { const ex = await B.runWorkflow(el.dataset.run); toast(ex.status === "success" ? `Done in ${ex.durationMs} ms ✅` : `Failed: ${ex.error}`, ex.status === "success" ? "ok" : "err"); }
      catch (e) { toast(e.message, "err"); }
      viewWorkflows();
    }));
  }

  async function viewTemplates() {
    setNav("templates");
    const list = await B.templates();
    view().innerHTML = `<div class="page">${webBanner()}<div class="hero-h"><div><h1 class="h">Ready <span class="g">templates</span></h1><p class="sub">One tap to copy, then add your keys and press Run.</p></div></div>
      <div class="grid">${list.map((t) => `<div class="card"><div style="font-size:26px">${t.icon || "✨"}</div><h3 style="margin-top:6px">${esc(t.title)}</h3><p>${esc(t.description)}</p>${chain(t.nodes)}
        <div class="row" style="justify-content:space-between"><span class="meta">${t.nodes.some((n) => META[n] && META[n].fullOnly) && B.edition === "web" ? "🔒 some steps need the full version" : `${t.nodes.length} nodes`}</span><button class="btn sm primary" data-use="${t.key}">Use template</button></div></div>`).join("")}</div></div>`;
    $$("[data-use]").forEach((b) => (b.onclick = async () => { const wf = await B.useTemplate(b.dataset.use); toast("Template copied ✓", "ok"); location.hash = `#/editor/${wf.id}`; }));
  }

  async function viewRuns() {
    setNav("runs");
    const list = await B.listRuns();
    view().innerHTML = `<div class="page"><div class="hero-h"><div><h1 class="h">Run <span class="g">history</span></h1><p class="sub">Every run, every node, every output.</p></div>${list.length ? '<button class="btn sm danger" id="clr">Clear all</button>' : ""}</div>
      ${list.length ? `<div class="list">${list.map((r) => `<a class="run-row" href="#/runs/${r.id}">${statusPill(r.status)}<span class="nm">${esc(r.workflowName)}</span><span class="meta hide-m">${esc(r.mode)}</span><span class="meta">${ago(r.startedAt)} · ${r.durationMs} ms</span></a>`).join("")}</div>`
        : `<div class="empty"><div class="big">🧾</div><p>No runs yet. Open a workflow and press ▶ Run.</p></div>`}</div>`;
    $("#clr") && ($("#clr").onclick = async () => { if (confirm("Delete all run history?")) { await B.clearRuns(); viewRuns(); } });
  }

  async function viewRun(id) {
    setNav("runs");
    const r = await B.getRun(id);
    view().innerHTML = `<div class="page"><a href="#/runs" class="meta">← All runs</a>
      <div class="hero-h" style="margin-top:8px"><div><h1 class="h">${esc(r.workflowName)}</h1><p class="sub">${statusPill(r.status)} &nbsp; ${new Date(r.startedAt).toLocaleString()} · ${r.durationMs} ms · ${esc(r.mode)}</p></div>${r.workflowId && r.workflowId !== "credential-test" ? `<a class="btn sm" href="#/editor/${r.workflowId}">Open workflow</a>` : ""}</div>
      ${r.error ? `<div class="note warn"><b>Error:</b> ${esc(r.error)}</div>` : ""}
      <div class="list" style="margin-top:14px">${r.nodes.map((n) => `<div class="card"><div class="row">${icon(n.type, 30)}<b style="flex:1">${esc(n.name)}</b>${statusPill(n.status)}<span class="meta">${n.ms} ms</span></div>
        <div class="meta" style="margin-top:6px">in: ${n.inputCount} item(s) · out: ${n.outputCount} item(s)</div>
        ${n.error ? `<div class="note warn">${esc(n.error)}</div>` : ""}
        ${n.output ? `<details><summary class="meta" style="cursor:pointer;margin-top:8px">Show output</summary><pre class="json">${esc(JSON.stringify(n.output, null, 2))}</pre></details>` : ""}</div>`).join("")}</div>
      ${r.logs && r.logs.length ? `<h3 style="margin-top:22px">Logs</h3><pre class="json">${esc(r.logs.map((l) => `${l.t.slice(11, 19)}  [${l.node}]  ${l.msg}`).join("\n"))}</pre>` : ""}</div>`;
  }

  async function viewKeys() {
    setNav("keys");
    const { schema, values } = await B.getCreds();
    const filled = (id) => Object.values(values[id] || {}).some((v) => v);
    view().innerHTML = `<div class="page">${webBanner()}<div class="hero-h"><div><h1 class="h">Keys &amp; <span class="g">accounts</span></h1><p class="sub">Saved only on ${B.edition === "web" ? "this browser" : "this device (data/credentials.json)"} — never uploaded anywhere. Nodes use these when their own key field is blank.</p></div></div>
      ${schema.map((sec) => `<details class="card cred" ${sec.id === "ai" || sec.id === "telegram" ? "open" : ""}><summary><span class="ic">${sec.icon}</span><div><b>${esc(sec.title)}</b><div class="meta">${sec.fields.length} field(s)</div></div><span class="st ${filled(sec.id) ? "on" : "off"}">${filled(sec.id) ? "● saved" : "not set"}</span></summary>
        <p class="help" style="margin-top:12px">${esc(sec.help)}</p>
        <div class="two">${sec.fields.map((f) => `<div><label class="lb" for="c-${sec.id}-${f.key}">${esc(f.label)}</label><input class="inp" id="c-${sec.id}-${f.key}" data-sec="${sec.id}" data-key="${f.key}" type="${f.secret ? "password" : "text"}" autocomplete="off" spellcheck="false" placeholder="${esc(f.placeholder || "")}" value="${esc(values[sec.id][f.key])}"></div>`).join("")}</div>
        <div class="row" style="margin-top:14px"><button class="btn sm primary" data-save="${sec.id}">Save</button>${sec.test ? `<button class="btn sm" data-test="${sec.id}">Test ${sec.id === "ai" ? "AI" : "Telegram"}</button>` : ""}<span class="meta" id="tr-${sec.id}"></span></div></details>`).join("")}
      <div class="note">🔐 Tip: never share screenshots of this page with keys visible. In the full version you can set a password: <code>YANTRAFLOW_PASSWORD=yourpass</code>.</div></div>`;
    const collect = (secId) => { const o = { [secId]: {} }; $$(`[data-sec="${secId}"]`).forEach((i) => (o[secId][i.dataset.key] = i.value)); return o; };
    $$("[data-save]").forEach((b) => (b.onclick = async () => { await B.saveCreds(collect(b.dataset.save)); toast("Saved on this device ✓", "ok"); viewKeys(); }));
    $$("[data-test]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.test; await B.saveCreds(collect(id)); const out = $(`#tr-${id}`); out.textContent = "Testing…";
      try { const r = await B.testCred(id); out.innerHTML = r.ok ? `<span style="color:#7dffb0">✅ Works!</span>` : `<span style="color:#ff9aac">❌ ${esc(r.error)}</span>`; }
      catch (e) { out.innerHTML = `<span style="color:#ff9aac">❌ ${esc(e.message)}</span>`; }
    }));
  }

  // ---------- editor
  let ED = null; // current editor state
  async function viewEditor(id) {
    let wf;
    if (id === "new") wf = { name: "My workflow", nodes: [{ id: "n1", type: "manualTrigger", name: "Start", params: {}, position: [80, 160] }], connections: [] };
    else wf = await B.getWorkflow(id);
    document.body.style.overflow = "hidden";
    view().innerHTML = `<div class="editor" id="editor">
      <div class="ed-top">
        <a class="btn icon ghost" href="#/workflows" id="back" aria-label="Back">←</a>
        <input class="name" id="wfname" value="${esc(wf.name)}" aria-label="Workflow name"><span class="dirty-dot" title="Unsaved changes"></span>
        <label class="switch" title="Active = runs by itself (schedule, webhook, folder…)"><input type="checkbox" id="active" ${wf.active ? "checked" : ""}><span class="tr"></span><span class="lbl-txt">Active</span></label>
        <button class="btn sm" id="save"><span>💾</span><span class="lbl-txt">Save</span></button>
        <button class="btn sm run" id="run">▶ <span class="lbl-txt">Run</span></button>
        <button class="btn sm icon" id="more" aria-label="More">⋯</button>
      </div>
      <div class="ed-body">
        <aside class="palette" id="palette"><input class="inp search" id="psearch" placeholder="Search nodes…" aria-label="Search nodes"><div id="plist"></div></aside>
        <div id="drawflow"></div>
        <div class="sheet-backdrop" id="backdrop"></div>
        <aside class="panel hidden" id="panel"></aside>
        <button class="fab" id="fab" aria-label="Add node">＋</button>
        <div class="zoomctl"><button class="btn" id="zin" aria-label="Zoom in">＋</button><button class="btn" id="zout" aria-label="Zoom out">－</button><button class="btn" id="zfit" aria-label="Fit">⤢</button></div>
        <div class="runbar" id="runbar"></div>
        <div class="drawer hidden" id="drawer"></div>
      </div>
      <div class="menu hidden" id="menu">
        <button data-m="export">⬇ Export JSON</button><button data-m="import">⤓ Import JSON</button><button data-m="dup">⧉ Duplicate workflow</button><button data-m="runs">🧾 Run history</button><hr><button data-m="del" style="color:#ff9aac">🗑 Delete workflow</button>
      </div></div>`;
    const el = $("#drawflow");
    const ed = new Drawflow(el);
    ed.reroute = false; ed.zoom_min = 0.3; ed.zoom_max = 1.6; ed.zoom_value = 0.1;
    ed.start();
    ED = { wf, ed, map: {}, byNodeId: {}, selected: null, dirty: false, lastExec: null, focusField: null, layoutLocked: false };
    const pos = isMobile() ? mobileLayout(wf) : null;
    for (const n of wf.nodes) { const p = pos ? pos[n.id] : n.position || [80, 160]; addNode(n, p[0], p[1]); }
    for (const c of wf.connections) {
      const a = ED.byNodeId[c.from], b = ED.byNodeId[c.to];
      if (a && b) { try { ed.addConnection(a, b, `output_${(c.fromOutput || 0) + 1}`, "input_1"); } catch (_) { /* skip */ } }
    }
    ED.layoutLocked = !!pos; // phone zig-zag view: keep the saved (desktop) positions unless you move nodes
    setDirty(false);
    ed.on("nodeMoved", () => { ED.layoutLocked = false; setDirty(true); });
    ed.on("connectionCreated", () => setDirty(true));
    ed.on("connectionRemoved", () => setDirty(true));
    ed.on("nodeRemoved", (dfId) => { delete ED.map[dfId]; rebuildIndex(); if (ED.selected == dfId) closePanel(); setDirty(true); });
    ed.on("nodeSelected", (dfId) => { ED.selected = dfId; if (!isMobile()) openPanel(dfId); });
    ed.on("nodeUnselected", () => { ED.selected = null; });
    el.addEventListener("dblclick", (e) => { const n = e.target.closest(".drawflow-node"); if (n) openPanel(n.id.replace("node-", "")); });
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) { e.stopPropagation(); openPanel(b.closest(".drawflow-node").id.replace("node-", "")); } });
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => { e.preventDefault(); const t = e.dataTransfer.getData("text/yf-type"); if (t) { const p = toCanvas(e.clientX, e.clientY); createNode(t, p.x - 100, p.y - 30, false); } });
    renderPalette("");
    $("#psearch").oninput = (e) => renderPalette(e.target.value);
    $("#wfname").oninput = () => setDirty(true);
    $("#save").onclick = () => save(true);
    $("#run").onclick = runNow;
    $("#active").onchange = toggleActive;
    $("#zin").onclick = () => ed.zoom_in();
    $("#zout").onclick = () => ed.zoom_out();
    $("#zfit").onclick = fit;
    $("#fab").onclick = () => { $("#palette").classList.add("open"); $("#backdrop").classList.add("on"); };
    $("#backdrop").onclick = () => { $("#palette").classList.remove("open"); closePanel(); };
    $("#more").onclick = (e) => { e.stopPropagation(); $("#menu").classList.toggle("hidden"); };
    document.addEventListener("click", hideMenu);
    $$("#menu [data-m]").forEach((b) => (b.onclick = () => menuAction(b.dataset.m)));
    setTimeout(fit, 30);
    if (wf.nodes.length <= 1 && isMobile()) toast("Tap ＋ to add a node 👇");
  }
  // On phones a long left→right flow becomes tiny, so lay it out top→bottom (zig-zag).
  function mobileLayout(wf) {
    const xs = wf.nodes.map((n) => (n.position || [0])[0]);
    if (!wf.nodes.length || Math.max(...xs) - Math.min(...xs) < 300) return null;
    const depth = {}; const ins = {};
    for (const c of wf.connections) (ins[c.to] = ins[c.to] || []).push(c.from);
    const d = (id, seen = new Set()) => { if (depth[id] !== undefined) return depth[id]; if (seen.has(id)) return 0; seen.add(id); const ps = ins[id] || []; depth[id] = ps.length ? 1 + Math.max(...ps.map((p) => d(p, seen))) : 0; return depth[id]; };
    wf.nodes.forEach((n) => d(n.id));
    const layers = {}; const pos = {};
    for (const n of wf.nodes) (layers[depth[n.id]] = layers[depth[n.id]] || []).push(n);
    for (const [k, list] of Object.entries(layers)) list.forEach((n, i) => { pos[n.id] = [20 + i * 225 + (list.length === 1 ? (k % 2) * 70 : 0), 30 + Number(k) * 125]; });
    return pos;
  }
  function hideMenu() { const m = $("#menu"); if (m) m.classList.add("hidden"); }
  function rebuildIndex() { ED.byNodeId = {}; for (const [df, n] of Object.entries(ED.map)) ED.byNodeId[n.id] = Number(df); }
  function setDirty(v) { ED.dirty = v; $("#editor") && $("#editor").classList.toggle("dirty", v); }
  function nodeHtml(n) {
    const m = META[n.type] || { icon: "❔", color: "#666", label: n.type };
    return `<div class="nf"><div class="nf-ic" style="background:${m.color}26;color:${m.color}">${m.icon}</div><div class="nf-tx"><b>${esc(n.name)}</b><small>${esc(m.label)}${m.fullOnly && B.edition === "web" ? ' <span class="lock">PC</span>' : ""}</small></div><button class="nf-edit" data-edit aria-label="Edit">⚙</button></div><span class="nf-badge"></span>`;
  }
  function addNode(n, x, y) {
    const m = META[n.type] || { inputs: 1, outputs: 1 };
    const dfId = ED.ed.addNode(n.type, m.inputs, m.outputs, x, y, `t-${n.type}${m.trigger ? " t-trigger" : ""}${n.disabled ? " is-disabled" : ""}`, {}, nodeHtml(n));
    ED.map[dfId] = n; ED.byNodeId[n.id] = dfId;
    return dfId;
  }
  function uniqueName(base) { const names = new Set(Object.values(ED.map).map((n) => n.name)); if (!names.has(base)) return base; let i = 2; while (names.has(`${base} ${i}`)) i++; return `${base} ${i}`; }
  function createNode(type, x, y, autoConnect) {
    const m = META[type];
    const n = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, name: uniqueName(m.label), params: Object.fromEntries((m.params || []).map((p) => [p.key, p.default])) };
    const from = autoConnect && ED.selected && ED.map[ED.selected] ? ED.selected : null;
    if (from) { const d = ED.ed.getNodeFromId(from); x = d.pos_x + 270; y = d.pos_y; }
    const dfId = addNode(n, x, y);
    if (from && m.inputs > 0 && META[ED.map[from].type].outputs > 0) { try { ED.ed.addConnection(from, dfId, "output_1", "input_1"); } catch (_) { /* */ } }
    setDirty(true);
    $("#palette").classList.remove("open"); $("#backdrop").classList.remove("on");
    ED.selected = dfId;
    $$(".drawflow-node.selected").forEach((e) => e.classList.remove("selected"));
    const ne = $(`#node-${dfId}`); if (ne) ne.classList.add("selected");
    openPanel(dfId);
    return dfId;
  }
  function toCanvas(cx, cy) { const r = ED.ed.precanvas.getBoundingClientRect(); return { x: (cx - r.x) / ED.ed.zoom, y: (cy - r.y) / ED.ed.zoom }; }
  function renderPalette(q) {
    q = q.toLowerCase();
    const list = Object.values(META).filter((m) => !q || (m.label + m.description + m.group).toLowerCase().includes(q));
    $("#plist").innerHTML = GROUPS.map((g) => {
      const items = list.filter((m) => m.group === g); if (!items.length) return "";
      return `<div class="pg">${g}</div>` + items.map((m) => `<div class="pnode" draggable="true" data-type="${m.type}" title="${esc(m.description)}"><span class="pi" style="background:${m.color}26">${m.icon}</span><div><div class="pt">${esc(m.label)}${m.fullOnly && B.edition === "web" ? '<span class="lock">PC</span>' : ""}</div><div class="pd">${esc(m.description)}</div></div></div>`).join("");
    }).join("");
    $$(".pnode").forEach((p) => {
      p.ondragstart = (e) => e.dataTransfer.setData("text/yf-type", p.dataset.type);
      p.onclick = () => { const r = $("#drawflow").getBoundingClientRect(); const c = toCanvas(r.x + r.width / 2, r.y + r.height / 2.6); createNode(p.dataset.type, c.x - 100, c.y - 30, true); };
    });
  }
  function fit() {
    const ed = ED.ed; const data = ed.export().drawflow.Home.data; const ids = Object.keys(data);
    const el = $("#drawflow"); if (!ids.length || !el) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const k of ids) { const d = data[k]; const ne = $(`#node-${k}`); const w = ne ? ne.offsetWidth : 210, h = ne ? ne.offsetHeight : 64; x1 = Math.min(x1, d.pos_x); y1 = Math.min(y1, d.pos_y); x2 = Math.max(x2, d.pos_x + w); y2 = Math.max(y2, d.pos_y + h); }
    const W = el.clientWidth, H = el.clientHeight, pad = isMobile() ? 34 : 70;
    const z = Math.max(0.3, Math.min(1.05, (W - pad * 2) / (x2 - x1), (H - pad * 2 - (isMobile() ? 90 : 40)) / (y2 - y1)));
    ed.zoom = z; ed.zoom_last_value = z;
    ed.canvas_x = (W - (x2 - x1) * z) / 2 - x1 * z;
    ed.canvas_y = (H - (y2 - y1) * z) / 2 - y1 * z - (isMobile() ? 30 : 0);
    ed.precanvas.style.transform = `translate(${ed.canvas_x}px, ${ed.canvas_y}px) scale(${z})`;
  }
  function collect() {
    const data = ED.ed.export().drawflow.Home.data;
    const nodes = [], connections = [];
    for (const k of Object.keys(data)) {
      const d = data[k]; const n = ED.map[k]; if (!n) continue;
      nodes.push(Object.assign({}, n, { position: ED.layoutLocked && n.position ? n.position : [Math.round(d.pos_x), Math.round(d.pos_y)] }));
      for (const [ok, o] of Object.entries(d.outputs || {})) for (const c of o.connections) if (ED.map[c.node]) connections.push({ from: n.id, fromOutput: Number(ok.split("_")[1]) - 1, to: ED.map[c.node].id });
    }
    return { id: ED.wf.id, name: $("#wfname").value.trim() || "My workflow", active: $("#active").checked, description: ED.wf.description || "", nodes, connections };
  }
  async function save(showToast) {
    try {
      const saved = await B.saveWorkflow(collect());
      const isNew = !ED.wf.id; ED.wf = saved; setDirty(false);
      if (isNew) history.replaceState(null, "", `#/editor/${saved.id}`);
      if (showToast) toast("Saved ✓", "ok");
      return saved;
    } catch (e) { toast("Save failed: " + e.message, "err"); throw e; }
  }
  async function toggleActive() {
    const el = $("#active");
    try { await save(false); await B.setActive(ED.wf.id, el.checked); ED.wf.active = el.checked; toast(el.checked ? "Active ⚡ it will run by itself" : "Paused", "ok"); }
    catch (e) { el.checked = !el.checked; toast(e.message, "err"); }
  }
  async function runNow() {
    const btn = $("#run"); btn.disabled = true; btn.innerHTML = "⏳ <span class='lbl-txt'>Running…</span>";
    $$(".drawflow-node").forEach((n) => n.classList.remove("run-success", "run-error", "run-skipped", "run-disabled"));
    try {
      const wf = await save(false);
      const trig = ED.selected && ED.map[ED.selected] && META[ED.map[ED.selected].type].trigger ? ED.map[ED.selected].id : undefined;
      const ex = await B.runWorkflow(wf.id, collect(), trig);
      showExec(ex);
    } catch (e) { toast(e.message, "err"); }
    btn.disabled = false; btn.innerHTML = "▶ <span class='lbl-txt'>Run</span>";
  }
  function showExec(ex) {
    ED.lastExec = ex;
    for (const r of ex.nodes) {
      const df = ED.byNodeId[r.id]; const ne = df && $(`#node-${df}`); if (!ne) continue;
      ne.classList.add(`run-${r.status}`);
      $(".nf-badge", ne).textContent = r.status === "success" ? `✓ ${r.outputCount} item${r.outputCount === 1 ? "" : "s"}` : r.status === "error" ? "✗ error" : r.status;
    }
    toast(ex.status === "success" ? `Done ✅ ${ex.nodes.filter((n) => n.status === "success").length} nodes in ${ex.durationMs} ms` : `Failed ❌ ${ex.error}`, ex.status === "success" ? "ok" : "err");
    const d = $("#drawer");
    d.innerHTML = `<h4>${statusPill(ex.status)} Run log <span class="meta">${ex.durationMs} ms</span><span class="spacer"></span><button class="btn sm ghost" id="dclose">✕</button></h4>
      ${ex.error ? `<div class="note warn" style="margin:0 0 10px">${esc(ex.error)}</div>` : ""}
      <div class="list">${ex.nodes.map((n) => `<div class="run-row" data-open="${n.id}">${icon(n.type, 28)}<span class="nm">${esc(n.name)}</span>${statusPill(n.status)}<span class="meta">${n.outputCount} out</span></div>`).join("")}</div>`;
    d.classList.remove("hidden");
    $("#dclose").onclick = () => d.classList.add("hidden");
    $$("[data-open]", d).forEach((r) => (r.onclick = () => { d.classList.add("hidden"); openPanel(ED.byNodeId[r.dataset.open]); }));
    if (ED.selected && !$("#panel").classList.contains("hidden")) openPanel(ED.selected);
  }
  function closePanel() { $("#panel").classList.add("hidden"); $("#backdrop").classList.remove("on"); }
  function parentFields(n) {
    if (!ED.lastExec) return null;
    const wf = collect(); const parents = wf.connections.filter((c) => c.to === n.id).map((c) => c.from);
    const keys = new Set();
    for (const p of parents) {
      const rec = ED.lastExec.nodes.find((r) => r.id === p); if (!rec || !rec.output) continue;
      let first = Array.isArray(rec.output) ? rec.output : [];
      if (Array.isArray(first[0])) first = first.find((x) => x.length) || [];
      if (first[0] && typeof first[0] === "object") Object.keys(first[0]).forEach((k) => keys.add(k));
    }
    return [...keys];
  }
  function openPanel(dfId) {
    const n = ED.map[dfId]; if (!n) return;
    const m = META[n.type];
    const p = $("#panel"); p.classList.remove("hidden");
    if (isMobile()) $("#backdrop").classList.add("on");
    const rec = ED.lastExec && ED.lastExec.nodes.find((r) => r.id === n.id);
    const fields = parentFields(n);
    const field = (f) => {
      const v = n.params[f.key] !== undefined ? n.params[f.key] : f.default;
      const id = `f-${f.key}`;
      let input;
      if (f.type === "select") input = `<select class="inp" id="${id}" data-k="${f.key}">${f.options.map((o) => `<option ${String(o) === String(v) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      else if (f.type === "boolean") input = `<label class="switch"><input type="checkbox" id="${id}" data-k="${f.key}" data-bool ${v === true || v === "true" ? "checked" : ""}><span class="tr"></span></label>`;
      else if (["textarea", "json", "code"].includes(f.type)) input = `<textarea class="inp ${f.type === "code" || f.type === "json" ? "code" : ""}" id="${id}" data-k="${f.key}" spellcheck="false" ${f.type === "json" ? 'style="min-height:80px"' : ""}>${esc(v)}</textarea>`;
      else input = `<input class="inp" id="${id}" data-k="${f.key}" type="${f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}" step="any" autocomplete="off" spellcheck="false" placeholder="${esc(f.placeholder || (f.type === "secret" ? "blank = use Keys page" : ""))}" value="${esc(v)}">`;
      return `<label class="lb" for="${id}">${esc(f.label)}</label>${input}${f.help ? `<div class="help">${esc(f.help)}</div>` : ""}`;
    };
    const hookUrl = n.type === "webhookTrigger" ? B.webhookBase() + encodeURIComponent(n.params.path || "my-hook") : "";
    p.innerHTML = `<div class="panel-h"><div class="nf-ic" style="background:${m.color}26">${m.icon}</div><input class="nm" id="pname" value="${esc(n.name)}" aria-label="Node name"><button class="btn sm ghost" id="pclose" aria-label="Close">✕</button></div>
      <div class="panel-b">
        <p class="help" style="font-size:13px;margin-top:12px">${esc(m.description)}</p>
        ${m.fullOnly && B.edition === "web" ? `<div class="note">🔒 ${esc(m.fullOnly)} <a href="${REPO}" target="_blank" rel="noopener">Download</a></div>` : ""}
        ${hookUrl ? `<label class="lb">Webhook URL (when workflow is Active)</label><div class="hookurl"><code id="hook">${esc(hookUrl)}</code><button class="btn sm" id="copyhook">Copy</button></div>` : ""}
        ${(m.params || []).map(field).join("")}
        ${m.inputs ? `<label class="lb">Data from previous node</label>${fields && fields.length ? `<div class="fields-chips">${fields.map((k) => `<span class="fchip" data-ins="{{ $json.${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `["${k}"]`} }}">${esc(k)}</span>`).join("")}</div><div class="help">Tap a field to insert it where your cursor is.</div>` : `<div class="help">Run the workflow once — then the fields from the previous node show here. Or type <code>{{ $json.fieldName }}</code></div>`}` : ""}
        <div class="row" style="margin-top:16px;gap:16px"><label class="switch"><input type="checkbox" id="pcof" ${n.continueOnFail ? "checked" : ""}><span class="tr"></span>Continue if it fails</label><label class="switch"><input type="checkbox" id="pdis" ${n.disabled ? "checked" : ""}><span class="tr"></span>Disable</label></div>
        <div class="row" style="margin-top:16px"><button class="btn sm run" id="prun">▶ Run workflow</button><button class="btn sm" id="pdup">⧉ Duplicate</button><button class="btn sm danger" id="pdel">🗑 Delete</button></div>
        ${rec ? `<h4 style="margin:20px 0 6px">Last run ${statusPill(rec.status)} <span class="meta">${rec.ms} ms · in ${rec.inputCount} · out ${rec.outputCount}</span></h4>${rec.error ? `<div class="note warn">${esc(rec.error)}</div>` : ""}${rec.output ? `<pre class="json">${esc(JSON.stringify(rec.output, null, 2))}</pre>` : ""}` : ""}
      </div>`;
    $("#pclose").onclick = closePanel;
    $("#pname").oninput = (e) => { n.name = e.target.value || m.label; const b = $(`#node-${dfId} .nf-tx b`); if (b) b.textContent = n.name; setDirty(true); };
    $$("[data-k]", p).forEach((inp) => {
      inp.addEventListener("focus", () => (ED.focusField = inp));
      const upd = () => { n.params[inp.dataset.k] = inp.hasAttribute("data-bool") ? inp.checked : inp.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value; setDirty(true); if (inp.dataset.k === "path" && $("#hook")) $("#hook").textContent = B.webhookBase() + encodeURIComponent(inp.value); };
      inp.addEventListener("input", upd); inp.addEventListener("change", upd);
    });
    $$("[data-ins]", p).forEach((c) => (c.onclick = () => {
      const f = ED.focusField && document.body.contains(ED.focusField) && ED.focusField.tagName !== "SELECT" ? ED.focusField : $$("textarea[data-k], input[data-k][type=text]", p)[0];
      if (!f) return; const s = f.selectionStart ?? f.value.length, e2 = f.selectionEnd ?? f.value.length;
      f.value = f.value.slice(0, s) + c.dataset.ins + f.value.slice(e2); f.focus(); f.dispatchEvent(new Event("input"));
    }));
    $("#copyhook") && ($("#copyhook").onclick = () => { navigator.clipboard && navigator.clipboard.writeText($("#hook").textContent); toast("Copied ✓", "ok"); });
    $("#pcof").onchange = (e) => { n.continueOnFail = e.target.checked; setDirty(true); };
    $("#pdis").onchange = (e) => { n.disabled = e.target.checked; $(`#node-${dfId}`).classList.toggle("is-disabled", e.target.checked); setDirty(true); };
    $("#prun").onclick = () => { if (isMobile()) closePanel(); runNow(); };
    $("#pdup").onclick = () => { const d = ED.ed.getNodeFromId(dfId); const c = JSON.parse(JSON.stringify(n)); c.id = "n" + Date.now().toString(36); c.name = uniqueName(n.name); const nid = addNode(c, d.pos_x + 30, d.pos_y + 110); setDirty(true); openPanel(nid); };
    $("#pdel").onclick = () => { ED.ed.removeNodeId(`node-${dfId}`); closePanel(); };
  }
  async function menuAction(a) {
    hideMenu();
    if (a === "export") { const wf = collect(); delete wf.id; wf.active = false; download(`${wf.name.replace(/[^\w-]+/g, "_")}.yantraflow.json`, wf); }
    if (a === "import") importFlow();
    if (a === "dup") { const wf = collect(); delete wf.id; wf.name += " (copy)"; wf.active = false; const s = await B.saveWorkflow(wf); location.hash = `#/editor/${s.id}`; }
    if (a === "runs") location.hash = "#/runs";
    if (a === "del") { if (!ED.wf.id) { location.hash = "#/workflows"; return; } if (confirm(`Delete "${ED.wf.name}"?`)) { await B.deleteWorkflow(ED.wf.id); ED.dirty = false; location.hash = "#/workflows"; } }
  }

  // ---------- router
  let current = "";
  async function route() {
    if (!started) return;
    const h = location.hash || "#/workflows";
    if (ED && ED.dirty && !h.startsWith("#/editor/" + (ED.wf.id || "new")) && current.startsWith("#/editor")) {
      if (!confirm("You have unsaved changes. Leave without saving?")) { history.replaceState(null, "", current); return; }
    }
    if (!h.startsWith("#/editor")) { ED = null; document.body.style.overflow = ""; document.removeEventListener("click", hideMenu); }
    current = h;
    const [, v, id] = h.split("/");
    const PV = window.YFPlatform.views;
    try {
      if (v === "editor") await viewEditor(id || "new");
      else if (v === "templates") await viewTemplates();
      else if (v === "projects") await PV.projects();
      else if (v === "project" && id) await PV.project(id);
      else if (v === "profile") await PV.profile();
      else if (v === "settings") await PV.settings();
      else if (v === "about") await PV.about();
      else if (v === "developer") await PV.developer();
      else if (v === "runs" && id) await viewRun(id);
      else if (v === "runs") await viewRuns();
      else if (v === "keys") await viewKeys();
      else await viewWorkflows();
    } catch (e) {
      if (e && e.locked) return;
      view().innerHTML = `<div class="page"><div class="empty"><div class="big">😕</div><p>${esc(e.message)}</p><a class="btn" href="#/workflows">Back</a></div></div>`;
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s" && ED) { e.preventDefault(); save(true); } });
  window.addEventListener("beforeunload", (e) => { if (ED && ED.dirty) { e.preventDefault(); e.returnValue = ""; } });

  let started = false, schedulerOn = false;
  // called once the person is logged in (website) or unlocked (local full version)
  async function start() {
    started = true;
    document.body.classList.remove("auth-on");
    window.YFPlatform.applyChrome();
    window.YFPlatform.hookCloud(B);
    if (B.edition === "web") {
      if (!schedulerOn) { schedulerOn = true; B.startScheduler((ex) => toast(`⏰ ${ex.workflowName}: ${ex.status === "success" ? "ran ✅" : "failed ❌"}`, ex.status === "success" ? "ok" : "err")); }
      const seedKey = "yf_" + (window.YF_NS || "") + "seeded";
      if (!localStorage.getItem(seedKey)) {
        localStorage.setItem(seedKey, "1");
        try { await B.useTemplate("daily-quote"); } catch (_) { /* */ }
      }
    }
    route();
  }
  window.YFApp = { get B() { return B; }, toast, esc, chain, view, setNav, download, META, REPO, start, refresh: () => route() };

  async function boot() {
    window.YFPlatform.splash(true, "Starting YantraFlow…");
    const want = window.YF_EDITION || "auto";
    if (want === "web") B = YFBackends.LocalBackend;
    else if (want === "full") B = YFBackends.ServerBackend;
    else {
      try { const c = new AbortController(); setTimeout(() => c.abort(), 1500); const r = await fetch("api/health", { signal: c.signal }); const j = await r.json(); B = j && j.edition === "full" ? YFBackends.ServerBackend : YFBackends.LocalBackend; }
      catch (_) { B = YFBackends.LocalBackend; }
    }
    $("#edition").textContent = B.edition === "full" ? "● Full · local" : "● Web version";
    $("#edition").className = `pill ${B.edition}`;
    if (await window.YFPlatform.gate(B)) start();
  }
  boot();
})();

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
  const I = (name, size = 18, cls) => window.yfIcon(name, size, cls);
  const nodeMeta = (type) => META[type] || { icon: "circle-help", color: "#64748b", label: type };
  function icon(type, size = 32) {
    const m = nodeMeta(type);
    return `<span class="chip" style="width:${size}px;height:${size}px;background:${m.color}26;border-color:${m.color}55;color:${m.color}" title="${esc(m.label)}">${I(m.icon, Math.round(size * 0.56))}</span>`;
  }
  function chain(types) { return `<div class="chain">${types.slice(0, 7).map((t, i) => (i ? `<span class="arrow">${I("chevron-right", 14)}</span>` : "") + icon(t)).join("")}</div>`; }
  function statusPill(st) { const m = { success: [I("circle-check", 13), "Success"], error: [I("circle-x", 13), "Failed"], running: [I("loader-circle", 13, "spin"), "Running"], skipped: ["", "Skipped"], disabled: ["", "Disabled"] }; const v = m[st] || ["", st]; return `<span class="status ${st}">${v[0]}${esc(v[1])}</span>`; }
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
    return `<div class="banner"><span class="bn-ic">${I("globe", 22)}</span><div style="flex:1;min-width:220px"><b>Web version</b> — works right here in your browser, saved on this device. Webhooks, Folder Watch, YouTube upload, email &amp; file saving need the free <b>full version</b> on your PC or phone (Termux).</div><a class="btn sm primary" href="${REPO}" target="_blank" rel="noopener">${I("download", 16)} Download full version</a></div>`;
  }

  // ---------- views
  async function viewWorkflows() {
    setNav("workflows");
    const list = await B.listWorkflows();
    view().innerHTML = `<div class="page">${webBanner()}
      <div class="hero-h"><div><h1 class="h">Your <span class="g">automations</span></h1><p class="sub">Build once, it runs by itself — on your PC or your phone. Free &amp; local.</p></div>
      <div class="row"><button class="btn" id="imp">${I("upload", 16)} Import</button><button class="btn primary" id="new">${I("plus", 16)} New workflow</button></div></div>
      ${list.length ? `<div class="grid">${list.map((w) => `
        <div class="card wf-card" data-id="${w.id}">
          <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><h3 style="flex:1;min-width:0">${esc(w.name)}</h3>
            <label class="switch" title="Active = runs by itself"><input type="checkbox" data-act="${w.id}" ${w.active ? "checked" : ""}><span class="tr"></span></label>
            <button class="kebab" data-kebab="${w.id}" aria-label="More actions for ${esc(w.name)}" title="More (or right-click / long-press)">${I("ellipsis-vertical", 18)}</button></div>
          ${chain(w.nodeTypes)}${schedPill(w.schedule)}
          <div class="row" style="justify-content:space-between"><span class="meta">${w.nodeCount} nodes · ${w.lastRun ? `last run ${ago(w.lastRun.startedAt)} ${w.lastRun.status === "success" ? `<span class="ok-c">${I("circle-check", 13)}</span>` : `<span class="err-c">${I("circle-x", 13)}</span>`}` : "never run"}</span>
          <div class="row"><button class="btn sm" data-run="${w.id}">${I("play", 14)} Run</button><a class="btn sm primary" href="#/editor/${w.id}">Open</a></div></div>
        </div>`).join("")}</div>`
        : `<div class="empty"><div class="big">${I("workflow", 44)}</div><h3>No workflows yet</h3><p>Start from a ready-made project — viral script generator, Reel auto-post, YouTube upload, Gmail summary…</p><p class="row" style="justify-content:center;margin-top:14px"><a class="btn primary" href="#/projects">${I("layout-grid", 16)} Browse public projects</a><button class="btn" id="new2">${I("plus", 16)} Blank workflow</button></p></div>`}
    </div>`;
    $("#new") && ($("#new").onclick = () => (location.hash = "#/editor/new"));
    $("#new2") && ($("#new2").onclick = () => (location.hash = "#/editor/new"));
    $("#imp").onclick = (e) => { e.stopPropagation(); openImportMenu(e.currentTarget); };
    wireCardMenus();
    $$("[data-act]").forEach((el) => (el.onchange = async () => {
      try { await B.setActive(el.dataset.act, el.checked); toast(el.checked ? "Active — it will run by itself" : "Paused", "ok"); }
      catch (e) { el.checked = !el.checked; toast(e.message, "err"); }
    }));
    $$("[data-run]").forEach((el) => (el.onclick = () => openRunSheet(el.dataset.run, {
      runOnce: async () => {
        el.disabled = true; el.textContent = "Running…";
        try { const ex = await B.runWorkflow(el.dataset.run); toast(ex.status === "success" ? `Done in ${ex.durationMs} ms ✓` : `Failed: ${ex.error}`, ex.status === "success" ? "ok" : "err"); }
        catch (e) { toast(e.message, "err"); }
        viewWorkflows();
      },
      onExec: (ex) => toast(ex.status === "success" ? `First run done ✓` : `First run failed: ${ex.error}`, ex.status === "success" ? "ok" : "err"),
      after: () => viewWorkflows(),
    })));
    if (list.some((w) => w.schedule && w.schedule.schedule && w.schedule.schedule.enabled) && !B.alwaysOn) $(".page").insertAdjacentHTML("afterbegin", alwaysOnNote());
  }


  // ---------- workflow card actions: right-click (desktop), long-press (phone) or the ⋮ button
  const b64u = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  async function packWorkflow(wf) {
    const bytes = new TextEncoder().encode(JSON.stringify(wf));
    if (window.CompressionStream) { try { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")); return "z" + b64u(new Uint8Array(await new Response(st).arrayBuffer())); } catch (_) { /* fall through */ } }
    return "j" + b64u(bytes);
  }
  async function unpackWorkflow(code) {
    const kind = code[0], bytes = unb64u(code.slice(1));
    if (kind === "z") { if (!window.DecompressionStream) throw new Error("This browser is too old to open share links — use Import → file."); const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return JSON.parse(await new Response(st).text()); }
    if (kind === "j") return JSON.parse(new TextDecoder().decode(bytes));
    throw new Error("Not a YantraFlow share link");
  }
  const SHARE_BASE = "https://yantraflow.sites.tab.bot/";
  function shareCodeFrom(text) { const m = String(text || "").match(/#\/share\/([A-Za-z0-9_-]+)/); return m ? m[1] : (/^[zj][A-Za-z0-9_-]{20,}$/.test(String(text).trim()) ? String(text).trim() : null); }
  function cleanForShare(wf) { const c = JSON.parse(JSON.stringify(wf)); delete c.id; delete c.createdAt; delete c.updatedAt; delete c.lastRun; c.active = false; return c; }
  const fileName = (wf) => `${String(wf.name || "workflow").replace(/[^\w-]+/g, "_")}.yantraflow.json`;

  function closePop() { const p = $("#ctxm"); if (p) p.remove(); const b = $("#ctxb"); if (b) b.remove(); document.removeEventListener("keydown", popKey); }
  function popKey(e) { if (e.key === "Escape") closePop(); }
  // items: [{ ic, label, act, danger }] or "hr"; at: {x,y} | element
  function openPop(items, at, title) {
    closePop();
    const sheet = isMobile();
    const bd = document.createElement("div"); bd.id = "ctxb"; bd.className = "ctx-back" + (sheet ? " on" : "");
    bd.addEventListener("click", closePop); bd.addEventListener("contextmenu", (e) => { e.preventDefault(); closePop(); });
    const p = document.createElement("div"); p.id = "ctxm"; p.className = "ctx " + (sheet ? "sheet" : "pop"); p.setAttribute("role", "menu");
    p.innerHTML = (title ? `<div class="ctx-h">${title}</div>` : "") + items.map((it, i) => it === "hr" ? "<hr>" : `<button role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""}">${I(it.ic, 18)}<span>${esc(it.label)}</span></button>`).join("") + (sheet ? `<button class="ctx-cancel" data-cancel>${esc("Cancel")}</button>` : "");
    document.body.appendChild(bd); document.body.appendChild(p);
    p.addEventListener("contextmenu", (e) => e.preventDefault());
    $$("[data-i]", p).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const it = items[+b.dataset.i]; closePop(); it.act(); }));
    const c = $("[data-cancel]", p); if (c) c.onclick = closePop;
    if (!sheet) {
      let x, y; if (at instanceof Element) { const r = at.getBoundingClientRect(); x = r.right; y = r.bottom + 4; } else { x = at.x; y = at.y; }
      const w = p.offsetWidth, h = p.offsetHeight;
      if (at instanceof Element) x -= w;
      p.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px"; p.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px";
    }
    document.addEventListener("keydown", popKey);
    const first = $("[data-i]", p); if (first && !sheet) first.focus({ preventScroll: true });
  }

  async function cardMenu(id, at) {
    let wf; try { wf = await B.getWorkflow(id); } catch (e) { toast(e.message, "err"); return; }
    openPop([
      { ic: "square-pen", label: "Open in editor", act: () => (location.hash = `#/editor/${id}`) },
      { ic: "pencil", label: "Rename", act: () => renameFlow(wf) },
      { ic: "copy", label: "Duplicate", act: () => duplicateFlow(wf) },
      { ic: "download", label: "Export (.json)", act: () => { download(fileName(wf), cleanForShare(wf)); toast("Exported ✓", "ok"); } },
      { ic: "share-2", label: "Share / send to others", act: () => shareFlow(wf) },
      "hr",
      { ic: "trash-2", label: "Delete", danger: true, act: () => deleteFlow(wf) },
    ], at, `${I("workflow", 15)}<b>${esc(wf.name)}</b>`);
  }
  async function renameFlow(wf) {
    const name = prompt("New name", wf.name); if (name == null || !name.trim() || name.trim() === wf.name) return;
    try { await B.saveWorkflow(Object.assign({}, wf, { name: name.trim() })); toast("Renamed ✓", "ok"); refreshList(); } catch (e) { toast(e.message, "err"); }
  }
  async function duplicateFlow(wf) {
    try { const c = cleanForShare(wf); c.name = wf.name + " (copy)"; await B.saveWorkflow(c); toast("Duplicated ✓", "ok"); refreshList(); } catch (e) { toast(e.message, "err"); }
  }
  async function deleteFlow(wf) {
    if (!confirm(`Delete "${wf.name}"? This can't be undone.`)) return;
    try { await B.deleteWorkflow(wf.id); toast("Deleted", "ok"); refreshList(); } catch (e) { toast(e.message, "err"); }
  }
  function refreshList() { if (/^#\/workflows|^#?\/?$/.test(location.hash) || !location.hash) viewWorkflows(); }

  async function shareFlow(wf) {
    const clean = cleanForShare(wf);
    const link = SHARE_BASE + "#/share/" + (await packWorkflow(clean));
    const canShare = !!navigator.share;
    closePop();
    const bd = document.createElement("div"); bd.id = "ctxb"; bd.className = "ctx-back on"; bd.onclick = closePop;
    const p = document.createElement("div"); p.id = "ctxm"; p.className = "ctx dialog";
    p.innerHTML = `<div class="ctx-h">${I("share-2", 16)}<b>Share “${esc(wf.name)}”</b></div>
      <p class="sub" style="margin:4px 4px 10px">Anyone with this link can add a copy to their YantraFlow (website or PC/Termux → Import → From link). Your API keys are <b>not</b> included.</p>
      <input class="inp mono" id="shl" readonly value="${esc(link)}" aria-label="Share link">
      <div class="row" style="margin-top:12px;flex-wrap:wrap">
        <button class="btn primary sm" id="shc">${I("copy", 15)} Copy link</button>
        ${canShare ? `<button class="btn sm" id="shs">${I("send-horizontal", 15)} Send…</button>` : ""}
        <button class="btn sm" id="shf">${I("download", 15)} .json file</button>
        <button class="btn sm ghost" id="shx">Close</button>
      </div>
      ${link.length > 6000 ? `<p class="help">Big workflow — if the link is too long for your chat app, send the .json file instead.</p>` : ""}`;
    document.body.appendChild(bd); document.body.appendChild(p);
    document.addEventListener("keydown", popKey);
    const inp = $("#shl"); inp.onclick = () => inp.select();
    $("#shc").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied ✓", "ok"); } catch (_) { inp.select(); document.execCommand && document.execCommand("copy"); toast("Link selected — copy it", "ok"); } };
    $("#shs") && ($("#shs").onclick = async () => {
      try {
        const file = new File([JSON.stringify(clean, null, 2)], fileName(wf), { type: "application/json" });
        const data = { title: `YantraFlow: ${wf.name}`, text: `Open this to add my YantraFlow automation “${wf.name}”:`, url: link };
        await navigator.share(data).catch(async (e) => { if (e && e.name === "AbortError") return; if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: data.title }); else throw e; });
      } catch (e) { toast("Sharing not available here — use Copy link", "err"); }
    });
    $("#shf").onclick = () => download(fileName(wf), clean);
    $("#shx").onclick = closePop;
  }


  // ---------- v4: Run sheet — Run once / Repeat every N / Daily at HH:MM (min 30 min)
  const TZS = ["Asia/Kolkata", "Asia/Dubai", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
  function alwaysOnNote() {
    if (B.alwaysOn) return `<div class="sched-note ok">${I("circle-check", 15)}<span><b>PC/Termux version</b> — schedule 24x7 chalega jab tak YantraFlow on hai (restart ke baad bhi apne aap resume). Termux me pehle <code>termux-wake-lock</code> chalao.</span></div>`;
    return `<div class="sched-note warn">${I("triangle-alert", 15)}<span><b>Website pe schedule tabhi chalega jab ye tab khula ho.</b> 24x7 ke liye PC/Termux pe chalao. <a href="${REPO}#-v4-auto-post--schedule-24x7" target="_blank" rel="noopener">Setup</a></span></div>`;
  }
  function schedPill(info) {
    if (!info || !info.schedule || !info.schedule.enabled) return "";
    return `<span class="sched-pill" title="Schedule ON">${I("calendar-clock", 13)} ${esc(info.describe)} · next ${esc(YFSchedule.fmt(Date.parse(info.nextRunAt), info.schedule.tz))}</span>`;
  }
  async function openRunSheet(wfId, opts = {}) {
    closePop();
    let info = null; try { info = await B.getSchedule(wfId); } catch (_) { /* */ }
    const cur = (info && info.schedule) || { mode: "every", every: 30, unit: "minutes", at: "09:00", tz: "Asia/Kolkata", enabled: false };
    const on = !!(info && info.schedule && info.schedule.enabled);
    const myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return ""; } })();
    const tzs = [...new Set([cur.tz || "Asia/Kolkata", ...TZS, myTz].filter(Boolean))];
    const bd = document.createElement("div"); bd.id = "ctxb"; bd.className = "ctx-back on"; bd.onclick = closePop;
    const p = document.createElement("div"); p.id = "ctxm"; p.className = "ctx dialog run-sheet";
    p.innerHTML = `<div class="ctx-h">${I("play", 16)}<b>Run kaise karna hai?</b><span class="spacer"></span><button class="btn sm ghost icon" id="rsx" aria-label="Close">${I("close", 16)}</button></div>
      <div id="rs-status"></div>
      <div class="rs-opts" role="radiogroup">
        <label class="rs-opt"><input type="radio" name="rsm" value="once" ${on ? "" : "checked"}><span>${I("play", 16)}<b>Run once</b><small>Abhi ek baar chalao</small></span></label>
        <label class="rs-opt"><input type="radio" name="rsm" value="every" ${on && cur.mode === "every" ? "checked" : ""}><span>${I("repeat", 16)}<b>Repeat</b><small>Har N minute / ghante / din</small></span></label>
        <label class="rs-opt"><input type="radio" name="rsm" value="daily" ${on && cur.mode === "daily" ? "checked" : ""}><span>${I("calendar-clock", 16)}<b>Daily at</b><small>Roz fixed time pe</small></span></label>
      </div>
      <div class="rs-row" id="rs-every"><span>Har</span><input class="inp" id="rse" type="number" min="1" value="${esc(cur.mode === "every" ? cur.every : 30)}" style="width:90px"><select class="inp" id="rsu" style="width:130px">${["minutes", "hours", "days"].map((u) => `<option value="${u}" ${cur.unit === u ? "selected" : ""}>${{ minutes: "minute", hours: "ghante", days: "din" }[u]}</option>`).join("")}</select></div>
      <div class="rs-row" id="rs-daily"><span>Roz</span><input class="inp" id="rsa" type="time" value="${esc(cur.at || "09:00")}" style="width:130px"><span>baje</span></div>
      <div class="rs-row" id="rs-tz"><span>Timezone</span><select class="inp" id="rst">${tzs.map((z) => `<option ${z === (cur.tz || "Asia/Kolkata") ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div>
      <label class="rs-check" id="rs-now"><input type="checkbox" id="rsn" checked> Pehla run abhi turant</label>
      <p class="help" id="rs-min">Minimum gap ${YFSchedule.MIN_MINUTES} minute hai (Telegram/LinkedIn/X pe spam ya ban se bachne ke liye).</p>
      ${alwaysOnNote()}
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="rsgo">${I("play", 15)} <span>Run now</span></button>${on ? `<button class="btn danger" id="rsstop">${I("square", 15)} Stop schedule</button>` : ""}<button class="btn ghost" id="rsclose">Close</button></div>
      <div id="rs-log"></div>`;
    document.body.appendChild(bd); document.body.appendChild(p);
    document.addEventListener("keydown", popKey);
    const mode = () => (p.querySelector("input[name=rsm]:checked") || {}).value || "once";
    const sync = () => {
      const m = mode();
      $("#rs-every").style.display = m === "every" ? "" : "none";
      $("#rs-daily").style.display = m === "daily" ? "" : "none";
      $("#rs-tz").style.display = m === "daily" ? "" : "none";
      $("#rs-now").style.display = m === "once" ? "none" : "";
      $("#rs-min").style.display = m === "every" ? "" : "none";
      $("#rsgo span").textContent = m === "once" ? "Run now" : on ? "Update schedule" : "Start schedule";
    };
    const draw = (inf) => {
      const st = $("#rs-status"); if (!st) return;
      const en = inf && inf.schedule && inf.schedule.enabled;
      st.innerHTML = en ? `<div class="sched-live">${I("loader-circle", 15, inf.running ? "spin" : "")}<div><b>Schedule ON — ${esc(inf.describe)}</b><small>Next run: <b>${esc(YFSchedule.fmt(Date.parse(inf.nextRunAt), inf.schedule.tz))}</b> · ${inf.runs || 0} runs${inf.lastRunAt ? ` · last ${esc(ago(inf.lastRunAt))}` : ""}</small></div></div>` : (inf && inf.schedule ? `<div class="sched-live off">${I("square", 15)}<div><b>Schedule stopped</b><small>${esc(inf.describe)}</small></div></div>` : "");
      const lg = $("#rs-log"); if (!lg) return;
      const rows = (inf && inf.log) || [];
      lg.innerHTML = rows.length ? `<label class="lb">Run log</label><div class="rs-loglist">${rows.slice(0, 8).map((r) => `<a class="rs-logrow" href="${r.executionId ? `#/runs/${r.executionId}` : "#/runs"}">${statusPill(r.status)}<span>${esc(YFSchedule.fmt(Date.parse(r.at), (inf.schedule || {}).tz))}</span>${r.error ? `<small class="err-c">${esc(String(r.error).slice(0, 90))}</small>` : ""}</a>`).join("")}</div>` : "";
    };
    p.querySelectorAll("input[name=rsm]").forEach((r) => (r.onchange = sync));
    sync(); draw(info);
    const timer = setInterval(async () => { if (!document.getElementById("rs-status")) return clearInterval(timer); try { draw(await B.getSchedule(wfId)); } catch (_) { /* */ } }, 10000);
    $("#rsx").onclick = closePop; $("#rsclose").onclick = closePop;
    $("#rsstop") && ($("#rsstop").onclick = async () => { try { await B.stopSchedule(wfId); toast("Schedule stopped", "ok"); closePop(); if (opts.after) opts.after(); } catch (e) { toast(e.message, "err"); } });
    $("#rsgo").onclick = async (e) => {
      const btn = e.currentTarget; const m = mode();
      try {
        if (opts.beforeSave) wfId = (await opts.beforeSave()) || wfId;
        if (m === "once") { closePop(); return opts.runOnce ? opts.runOnce() : null; }
        btn.disabled = true; btn.innerHTML = `${I("loader-circle", 15, "spin")} <span>Starting…</span>`;
        const res = await B.setSchedule(wfId, { mode: m, every: Number($("#rse").value), unit: $("#rsu").value, at: $("#rsa").value, tz: $("#rst").value, runNow: $("#rsn").checked });
        (res.warnings || []).forEach((w) => toast(w, "err"));
        if (res.execution && opts.onExec) opts.onExec(res.execution);
        const inf = res.info;
        toast(`Schedule ON — ${inf.describe}. Next: ${YFSchedule.fmt(Date.parse(inf.nextRunAt), inf.schedule.tz)}`, "ok");
        closePop(); if (opts.after) opts.after();
      } catch (err) { toast(err.message, "err"); btn.disabled = false; sync(); }
    };
  }

  function openImportMenu(anchor) {
    openPop([
      { ic: "upload", label: "From file (.json)", act: importFlow },
      { ic: "share-2", label: "From share link", act: importFromLink },
    ], anchor, `${I("upload", 15)}<b>Import a workflow</b>`);
  }
  async function importFromLink() {
    const txt = prompt("Paste the YantraFlow share link"); if (!txt) return;
    const code = shareCodeFrom(txt); if (!code) { toast("That doesn't look like a YantraFlow share link", "err"); return; }
    location.hash = "#/share/" + code;
  }
  async function viewShare(code) {
    setNav("workflows");
    let wf; try { wf = await unpackWorkflow(code); if (!wf || !Array.isArray(wf.nodes)) throw new Error("Link is broken or incomplete"); } catch (e) { view().innerHTML = `<div class="page"><div class="empty"><div class="big">${I("triangle-alert", 44)}</div><h3>Can't open this share link</h3><p>${esc(e.message)}</p><a class="btn" href="#/workflows">Back</a></div></div>`; return; }
    view().innerHTML = `<div class="page"><div class="card share-card"><div class="pj-ic big">${I("share-2", 30)}</div>
      <p class="meta">Someone shared a YantraFlow automation with you</p><h1 class="h" style="font-size:24px;margin:6px 0">${esc(wf.name || "Shared workflow")}</h1>
      ${wf.description ? `<p class="sub">${esc(wf.description)}</p>` : ""}${chain(wf.nodes.map((n) => n.type))}
      <p class="meta">${wf.nodes.length} steps · it starts paused · add your own keys on the Keys page</p>
      <div class="row" style="margin-top:14px"><button class="btn primary" id="shadd">${I("plus", 16)} Add to my workflows</button><a class="btn" href="#/workflows">Cancel</a></div></div></div>`;
    $("#shadd").onclick = async () => { try { const s = await B.importWorkflow(cleanForShare(wf)); toast("Added to your workflows ✓", "ok"); location.hash = `#/editor/${s.id}`; } catch (e) { toast("Import failed: " + e.message, "err"); } };
  }

  function wireCardMenus() {
    $$("[data-kebab]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); cardMenu(b.dataset.kebab, b); }));
    $$(".wf-card").forEach((card) => {
      const id = card.dataset.id; let t = null, sx = 0, sy = 0, fired = 0;
      card.addEventListener("contextmenu", (e) => {
        if (e.target.closest("input,textarea")) return;
        e.preventDefault(); if (Date.now() - fired < 800) return; fired = Date.now();
        cardMenu(id, { x: e.clientX, y: e.clientY });
      });
      card.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1 || e.target.closest("input,.switch,.kebab")) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; card.classList.add("pressing");
        t = setTimeout(() => { t = null; card.classList.remove("pressing"); if (Date.now() - fired < 800) return; fired = Date.now(); if (navigator.vibrate) navigator.vibrate(12); cardMenu(id, { x: sx, y: sy }); }, 520);
      }, { passive: true });
      const cancel = () => { if (t) { clearTimeout(t); t = null; } card.classList.remove("pressing"); };
      card.addEventListener("touchmove", (e) => { const q = e.touches[0]; if (Math.abs(q.clientX - sx) > 10 || Math.abs(q.clientY - sy) > 10) cancel(); }, { passive: true });
      card.addEventListener("touchend", (e) => { if (Date.now() - fired < 800 && e.cancelable) e.preventDefault(); cancel(); });
      card.addEventListener("touchcancel", cancel);
      card.addEventListener("click", (e) => { if (Date.now() - fired < 800) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
  }

  async function viewTemplates() {
    setNav("templates");
    const list = await B.templates();
    view().innerHTML = `<div class="page">${webBanner()}<div class="hero-h"><div><h1 class="h">Ready <span class="g">templates</span></h1><p class="sub">One tap to copy, then add your keys and press Run.</p></div></div>
      <div class="grid">${list.map((t) => `<div class="card"><div class="pj-ic">${I(t.icon || "sparkles", 24)}</div><h3 style="margin-top:6px">${esc(t.title)}</h3><p>${esc(t.description)}</p>${chain(t.nodes)}
        <div class="row" style="justify-content:space-between"><span class="meta">${t.nodes.some((n) => META[n] && META[n].fullOnly) && B.edition === "web" ? `${I("laptop", 13)} some steps need the full version` : `${t.nodes.length} nodes`}</span><button class="btn sm primary" data-use="${t.key}">Use template</button></div></div>`).join("")}</div></div>`;
    $$("[data-use]").forEach((b) => (b.onclick = async () => { const wf = await B.useTemplate(b.dataset.use); toast("Template copied ✓", "ok"); location.hash = `#/editor/${wf.id}`; }));
  }

  async function viewRuns() {
    setNav("runs");
    const list = await B.listRuns();
    view().innerHTML = `<div class="page"><div class="hero-h"><div><h1 class="h">Run <span class="g">history</span></h1><p class="sub">Every run, every node, every output.</p></div>${list.length ? '<button class="btn sm danger" id="clr">Clear all</button>' : ""}</div>
      ${list.length ? `<div class="list">${list.map((r) => `<a class="run-row" href="#/runs/${r.id}">${statusPill(r.status)}<span class="nm">${esc(r.workflowName)}</span><span class="meta hide-m">${esc(r.mode)}</span><span class="meta">${ago(r.startedAt)} · ${r.durationMs} ms</span></a>`).join("")}</div>`
        : `<div class="empty"><div class="big">${I("history", 44)}</div><p>No runs yet. Open a workflow and press Run.</p></div>`}</div>`;
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
      ${schema.map((sec) => `<details class="card cred" ${sec.id === "ai" || sec.id === "telegram" ? "open" : ""}><summary><span class="ic">${I(sec.icon, 22)}</span><div><b>${esc(sec.title)}</b><div class="meta">${sec.fields.length} field(s)</div></div><span class="st ${filled(sec.id) ? "on" : "off"}">${filled(sec.id) ? "● saved" : "not set"}</span></summary>
        <p class="help" style="margin-top:12px">${esc(sec.help)}</p>
        <div class="two">${sec.fields.map((f) => `<div><label class="lb" for="c-${sec.id}-${f.key}">${esc(f.label)}</label><input class="inp" id="c-${sec.id}-${f.key}" data-sec="${sec.id}" data-key="${f.key}" type="${f.secret ? "password" : "text"}" autocomplete="off" spellcheck="false" placeholder="${esc(f.placeholder || "")}" value="${esc(values[sec.id][f.key])}"></div>`).join("")}</div>
        <div class="row" style="margin-top:14px"><button class="btn sm primary" data-save="${sec.id}">Save</button>${sec.test ? `<button class="btn sm" data-test="${sec.id}">Test ${sec.id === "ai" ? "AI" : "Telegram"}</button>` : ""}<span class="meta" id="tr-${sec.id}"></span></div></details>`).join("")}
      <div class="note">${I("shield-check", 15)} Tip: never share screenshots of this page with keys visible. In the full version you can set a password: <code>YANTRAFLOW_PASSWORD=yourpass</code>.</div></div>`;
    const collect = (secId) => { const o = { [secId]: {} }; $$(`[data-sec="${secId}"]`).forEach((i) => (o[secId][i.dataset.key] = i.value)); return o; };
    $$("[data-save]").forEach((b) => (b.onclick = async () => { await B.saveCreds(collect(b.dataset.save)); toast("Saved on this device ✓", "ok"); viewKeys(); }));
    $$("[data-test]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.test; await B.saveCreds(collect(id)); const out = $(`#tr-${id}`); out.textContent = "Testing…";
      try { const r = await B.testCred(id); out.innerHTML = r.ok ? `<span style="color:#7dffb0">${I("circle-check", 15)} Works!</span>` : `<span style="color:#ff9aac">${I("circle-x", 15)} ${esc(r.error)}</span>`; }
      catch (e) { out.innerHTML = `<span style="color:#ff9aac">${I("circle-x", 15)} ${esc(e.message)}</span>`; }
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
        <a class="btn icon ghost" href="#/workflows" id="back" aria-label="Back">${I("arrow-left", 18)}</a>
        <input class="name" id="wfname" value="${esc(wf.name)}" aria-label="Workflow name"><span class="dirty-dot" title="Unsaved changes"></span>
        <label class="switch" title="Active = runs by itself (schedule, webhook, folder…)"><input type="checkbox" id="active" ${wf.active ? "checked" : ""}><span class="tr"></span><span class="lbl-txt">Active</span></label>
        <button class="btn sm" id="save">${I("save", 16)}<span class="lbl-txt">Save</span></button>
        <span id="ed-sched" class="hide-m"></span>
        <button class="btn sm run" id="run">${I("play", 16)}<span class="lbl-txt">Run</span></button>
        <button class="btn sm icon" id="more" aria-label="More">${I("ellipsis-vertical", 18)}</button>
      </div>
      <div class="ed-body">
        <aside class="palette" id="palette"><input class="inp search" id="psearch" placeholder="Search nodes…" aria-label="Search nodes"><div id="plist"></div></aside>
        <div id="drawflow"></div>
        <div class="sheet-backdrop" id="backdrop"></div>
        <aside class="panel hidden" id="panel"></aside>
        <button class="fab" id="fab" aria-label="Add node">${I("plus", 26)}</button>
        <div class="zoomctl"><button class="btn" id="zin" aria-label="Zoom in">${I("plus", 18)}</button><button class="btn" id="zout" aria-label="Zoom out">${I("minus", 18)}</button><button class="btn" id="zfit" aria-label="Fit">${I("maximize-2", 16)}</button></div>
        <div class="runbar" id="runbar"></div>
        <div class="drawer hidden" id="drawer"></div>
      </div>
      <div class="menu hidden" id="menu">
        <button data-m="export">${I("download", 16)} Export JSON</button><button data-m="import">${I("upload", 16)} Import JSON</button><button data-m="dup">${I("copy", 16)} Duplicate workflow</button><button data-m="runs">${I("history", 16)} Run history</button><hr><button data-m="del" style="color:#ff9aac">${I("trash-2", 16)} Delete workflow</button>
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
    $("#run").onclick = () => openRunSheet(ED.wf.id, { beforeSave: async () => (await save(false)).id, runOnce: runNow, onExec: (ex) => showExec(ex), after: () => refreshSchedPill() });
    refreshSchedPill();
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
    if (wf.nodes.length <= 1 && isMobile()) toast("Tap + to add a node");
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
    const m = nodeMeta(n.type);
    return `<div class="nf"><div class="nf-ic" style="background:${m.color}26;color:${m.color}">${I(m.icon, 20)}</div><div class="nf-tx"><b>${esc(n.name)}</b><small>${esc(m.label)}${m.fullOnly && B.edition === "web" ? ' <span class="lock">PC</span>' : ""}</small></div><button class="nf-edit" data-edit aria-label="Edit">${I("settings", 16)}</button></div><span class="nf-badge"></span>`;
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
      return `<div class="pg">${g}</div>` + items.map((m) => `<div class="pnode" draggable="true" data-type="${m.type}" title="${esc(m.description)}"><span class="pi" style="background:${m.color}26;color:${m.color}">${I(m.icon, 18)}</span><div><div class="pt">${esc(m.label)}${m.fullOnly && B.edition === "web" ? '<span class="lock">PC</span>' : ""}</div><div class="pd">${esc(m.description)}</div></div></div>`).join("");
    }).join("");
    $$(".pnode").forEach((p) => {
      p.ondragstart = (e) => e.dataTransfer.setData("text/yf-type", p.dataset.type);
      p.onclick = () => { const r = $("#drawflow").getBoundingClientRect(); const c = toCanvas(r.x + r.width / 2, r.y + r.height / 2.6); createNode(p.dataset.type, c.x - 100, c.y - 30, true); };
    });
  }
  function fit() {
    if (!ED || !ED.ed) return;
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
    try { await save(false); await B.setActive(ED.wf.id, el.checked); ED.wf.active = el.checked; toast(el.checked ? "Active — it will run by itself" : "Paused", "ok"); }
    catch (e) { el.checked = !el.checked; toast(e.message, "err"); }
  }
  // SEED upload: txt/md read directly; PDF text via pdf.js (loaded only when you pick a PDF)
  async function readSeedFile(file) {
    if (file.size > 15 * 1024 * 1024) throw new Error("File 15 MB se badi hai");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return await file.text();
    let pdfjs;
    try { pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"); pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"; }
    catch (_) { throw new Error("PDF reader load nahi hua (internet?). PDF ka text copy karke Seed box me paste karo."); }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) { const c = await (await doc.getPage(i)).getTextContent(); pages.push(c.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("")); }
    return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }
  async function refreshSchedPill() {
    const el = $("#ed-sched"); if (!el || !ED.wf || !ED.wf.id) return;
    try { const inf = await B.getSchedule(ED.wf.id); el.innerHTML = schedPill(inf); } catch (_) { /* */ }
  }
  async function runNow() {
    const btn = $("#run"); btn.disabled = true; btn.innerHTML = `${I("loader-circle", 16, "spin")}<span class='lbl-txt'>Running…</span>`;
    $$(".drawflow-node").forEach((n) => n.classList.remove("run-success", "run-error", "run-skipped", "run-disabled"));
    try {
      const wf = await save(false);
      const trig = ED.selected && ED.map[ED.selected] && META[ED.map[ED.selected].type].trigger ? ED.map[ED.selected].id : undefined;
      const ex = await B.runWorkflow(wf.id, collect(), trig);
      showExec(ex);
    } catch (e) { toast(e.message, "err"); }
    btn.disabled = false; btn.innerHTML = `${I("play", 16)}<span class='lbl-txt'>Run</span>`;
  }
  function showExec(ex) {
    ED.lastExec = ex;
    for (const r of ex.nodes) {
      const df = ED.byNodeId[r.id]; const ne = df && $(`#node-${df}`); if (!ne) continue;
      ne.classList.add(`run-${r.status}`);
      $(".nf-badge", ne).textContent = r.status === "success" ? `✓ ${r.outputCount} item${r.outputCount === 1 ? "" : "s"}` : r.status === "error" ? "✗ error" : r.status;
    }
    toast(ex.status === "success" ? `Done ✓ ${ex.nodes.filter((n) => n.status === "success").length} nodes in ${ex.durationMs} ms` : `Failed: ${ex.error}`, ex.status === "success" ? "ok" : "err");
    const d = $("#drawer");
    d.innerHTML = `<h4>${statusPill(ex.status)} Run log <span class="meta">${ex.durationMs} ms</span><span class="spacer"></span><button class="btn sm ghost" id="dclose" aria-label="Close">${I("close", 16)}</button></h4>
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
      else if (["textarea", "json", "code"].includes(f.type)) input = `<textarea class="inp ${f.type === "code" || f.type === "json" ? "code" : ""}" id="${id}" data-k="${f.key}" spellcheck="false" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} ${f.type === "json" ? 'style="min-height:80px"' : f.upload ? 'style="min-height:150px"' : ""}>${esc(v)}</textarea>${f.upload ? `<div class="row seed-up"><button class="btn sm" data-upload="${id}">${I("upload", 14)} Upload .txt / .md / .pdf</button><span class="meta" id="${id}-n">${esc(String(v || "").length)} chars · sirf is device / tumhare account me save</span></div>` : ""}`;
      else input = `<input class="inp" id="${id}" data-k="${f.key}" type="${f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}" step="any" autocomplete="off" spellcheck="false" placeholder="${esc(f.placeholder || (f.type === "secret" ? "blank = use Keys page" : ""))}" value="${esc(v)}">`;
      return `<label class="lb" for="${id}">${esc(f.label)}</label>${input}${f.help ? `<div class="help">${esc(f.help)}</div>` : ""}`;
    };
    const hookUrl = n.type === "webhookTrigger" ? B.webhookBase() + encodeURIComponent(n.params.path || "my-hook") : "";
    p.innerHTML = `<div class="panel-h"><div class="nf-ic" style="background:${m.color}26;color:${m.color}">${I(m.icon, 20)}</div><input class="nm" id="pname" value="${esc(n.name)}" aria-label="Node name"><button class="btn sm ghost" id="pclose" aria-label="Close">${I("close", 16)}</button></div>
      <div class="panel-b">
        <p class="help" style="font-size:13px;margin-top:12px">${esc(m.description)}</p>
        ${m.fullOnly && B.edition === "web" ? `<div class="note">${I("laptop", 15)} ${esc(m.fullOnly)} <a href="${REPO}" target="_blank" rel="noopener">Download</a></div>` : ""}
        ${hookUrl ? `<label class="lb">Webhook URL (when workflow is Active)</label><div class="hookurl"><code id="hook">${esc(hookUrl)}</code><button class="btn sm" id="copyhook">Copy</button></div>` : ""}
        ${(m.params || []).map(field).join("")}
        ${m.inputs ? `<label class="lb">Data from previous node</label>${fields && fields.length ? `<div class="fields-chips">${fields.map((k) => `<span class="fchip" data-ins="{{ $json.${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `["${k}"]`} }}">${esc(k)}</span>`).join("")}</div><div class="help">Tap a field to insert it where your cursor is.</div>` : `<div class="help">Run the workflow once — then the fields from the previous node show here. Or type <code>{{ $json.fieldName }}</code></div>`}` : ""}
        <div class="row" style="margin-top:16px;gap:16px"><label class="switch"><input type="checkbox" id="pcof" ${n.continueOnFail ? "checked" : ""}><span class="tr"></span>Continue if it fails</label><label class="switch"><input type="checkbox" id="pdis" ${n.disabled ? "checked" : ""}><span class="tr"></span>Disable</label></div>
        <div class="row" style="margin-top:16px"><button class="btn sm run" id="prun">${I("play", 14)} Run workflow</button><button class="btn sm" id="pdup">${I("copy", 14)} Duplicate</button><button class="btn sm danger" id="pdel">${I("trash-2", 14)} Delete</button></div>
        ${rec ? `<h4 style="margin:20px 0 6px">Last run ${statusPill(rec.status)} <span class="meta">${rec.ms} ms · in ${rec.inputCount} · out ${rec.outputCount}</span></h4>${rec.error ? `<div class="note warn">${esc(rec.error)}</div>` : ""}${rec.output ? `<pre class="json">${esc(JSON.stringify(rec.output, null, 2))}</pre>` : ""}` : ""}
      </div>`;
    $("#pclose").onclick = closePanel;
    $("#pname").oninput = (e) => { n.name = e.target.value || m.label; const b = $(`#node-${dfId} .nf-tx b`); if (b) b.textContent = n.name; setDirty(true); };
    $$("[data-k]", p).forEach((inp) => {
      inp.addEventListener("focus", () => (ED.focusField = inp));
      const upd = () => { n.params[inp.dataset.k] = inp.hasAttribute("data-bool") ? inp.checked : inp.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value; setDirty(true); if (inp.dataset.k === "path" && $("#hook")) $("#hook").textContent = B.webhookBase() + encodeURIComponent(inp.value); };
      inp.addEventListener("input", upd); inp.addEventListener("change", upd);
    });
    $$("[data-upload]", p).forEach((b) => (b.onclick = async () => {
      const ta = $("#" + b.dataset.upload);
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".txt,.md,.markdown,.csv,.json,.pdf,text/plain,application/pdf";
      inp.onchange = async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        b.disabled = true;
        try {
          const text = await readSeedFile(file);
          if (!text.trim()) throw new Error("File me text nahi mila (scanned PDF? text copy karke paste karo)");
          ta.value = text.slice(0, 20000); ta.dispatchEvent(new Event("input"));
          const cnt = $("#" + b.dataset.upload + "-n"); if (cnt) cnt.textContent = `${ta.value.length} chars from ${file.name}`;
          toast(`Seed loaded: ${file.name}`, "ok");
        } catch (e) { toast(e.message, "err"); }
        b.disabled = false;
      };
      inp.click();
    }));
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
    closePop();
    if (!h.startsWith("#/editor")) { ED = null; document.body.style.overflow = ""; document.removeEventListener("click", hideMenu); }
    current = h;
    const [, v, id] = h.split("/");
    const PV = window.YFPlatform.views;
    try {
      if (v === "editor") await viewEditor(id || "new");
      else if (v === "share" && id) await viewShare(id);
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
      view().innerHTML = `<div class="page"><div class="empty"><div class="big">${I("triangle-alert", 44)}</div><p>${esc(e.message)}</p><a class="btn" href="#/workflows">Back</a></div></div>`;
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
    const pendingShare = sessionStorage.getItem("yf_share");
    if (pendingShare) { sessionStorage.removeItem("yf_share"); history.replaceState(null, "", location.pathname + pendingShare); }
    if (B.edition === "web") {
      if (!schedulerOn) { schedulerOn = true; B.startScheduler((ex) => toast(`${ex.workflowName}: ${ex.status === "success" ? "ran ✓" : "failed"}`, ex.status === "success" ? "ok" : "err")); }
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
    if (location.hash.startsWith("#/share/")) sessionStorage.setItem("yf_share", location.hash);
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

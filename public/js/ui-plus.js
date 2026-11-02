/* YantraFlow v4.5 UI: dropdowns under the button, Error Center, n8n-style run toasts, Terminal, form popup, light 3D tilt. */
(function () {
  "use strict";
  const C = window.YF45;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const I = (n, z, c) => window.yfIcon(n, z, c);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = () => window.YFApp;
  const B = () => app() && app().B;
  const ago = (iso) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? "abhi" : s < 3600 ? `${Math.floor(s / 60)} min pehle` : s < 86400 ? `${Math.floor(s / 3600)} ghante pehle` : `${Math.floor(s / 86400)} din pehle`; };
  const mobile = () => matchMedia("(max-width:820px)").matches;

  // ------------------------------------------------------------------ 1) every kebab / profile menu opens directly under its button
  function anchor(menu, btn, opt) {
    if (!menu || !btn) return;
    menu.classList.add("yf-dd"); menu.style.position = "fixed"; menu.style.right = "auto"; menu.style.bottom = "auto"; menu.style.maxHeight = ""; menu.style.width = "";
    menu.style.visibility = "hidden"; menu.style.left = "0px"; menu.style.top = "0px";
    const r = btn instanceof Element ? btn.getBoundingClientRect() : { left: btn.x, right: btn.x, top: btn.y, bottom: btn.y };
    const pos = C.placeMenu({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }, { width: menu.offsetWidth, height: menu.scrollHeight }, { width: innerWidth, height: innerHeight }, opt);
    Object.assign(menu.style, { left: pos.left + "px", top: pos.top + "px", maxHeight: pos.maxHeight + "px", overflowY: "auto", visibility: "" });
    if (menu.offsetWidth > pos.width + 1) menu.style.width = pos.width + "px";
    menu.dataset.placement = pos.placement; menu.dataset.align = pos.align;
    menu.style.transformOrigin = `${pos.align === "end" ? "right" : "left"} ${pos.placement === "below" ? "top" : "bottom"}`;
    menu.classList.remove("dd-in"); void menu.offsetWidth; menu.classList.add("dd-in");
    return pos;
  }
  addEventListener("resize", () => { const m = $("#menu:not(.hidden)"); if (m && $("#more")) anchor(m, $("#more")); const p = $("#pmenu:not(.hidden)"); if (p && $("#avatarBtn")) anchor(p, $("#avatarBtn")); });

  // ------------------------------------------------------------------ 2) Error Center
  const KEY = () => "yf_" + (window.YF_NS || "") + "errors";
  function load() { try { const a = JSON.parse(localStorage.getItem(KEY()) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function store(a) { try { localStorage.setItem(KEY(), JSON.stringify(a.slice(0, 200))); } catch (_) { /* full */ } paintBadges(); }
  const E = {
    list: () => load(),
    open: () => load().filter((e) => !e.resolved),
    count: () => load().filter((e) => !e.resolved).length,
    add(row) { if (!row || !row.error) return; const a = load(); const key = row.key || `${row.workflowId}:${row.nodeId}:${row.error}:${Date.now()}`; if (a.some((x) => x.key === key)) return; a.unshift(Object.assign({ at: new Date().toISOString(), resolved: false }, row, { key })); store(a); },
    fromExec(ex, wf) { for (const r of C.fromExecution(ex, wf)) E.add(r); },
    resolve(key) { const a = load(); const x = a.find((e) => e.key === key); if (x) x.resolved = true; store(a); },
    clear() { store([]); },
    resolveAll() { store(load().map((e) => Object.assign(e, { resolved: true }))); },
    async sync() {
      const b = B(); if (!b || !b.listRuns) return;
      try {
        const runs = (await b.listRuns()) || []; const seen = new Set(load().map((e) => String(e.key).split(":")[0]));
        for (const r of runs.slice(0, 25)) {
          if (r.status !== "error" || seen.has(r.id)) continue;
          let ex = r; if (!r.nodes && b.getRun) { try { ex = await b.getRun(r.id); } catch (_) { ex = r; } }
          E.fromExec(ex);
        }
      } catch (_) { /* offline / locked */ }
    },
  };
  window.YFErrors = E;
  function paintBadges() {
    const n = E.count();
    for (const b of $$("[data-err-badge]")) { b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n; }
    for (const b of $$(".err-btn")) { b.classList.toggle("has", !!n); b.setAttribute("aria-label", `Error Center: ${n} error`); }
  }
  function errButton(id) { return `<button class="err-btn" id="${id}" type="button" title="Error Center" aria-label="Error Center">${I("bug", 18)}<span class="err-badge" data-err-badge hidden>0</span></button>`; }
  function rowHtml(e, open) {
    const h = C.explain(e.error); const meta = app() && app().META[e.nodeType];
    return `<article class="ec-row ${e.resolved ? "done" : ""} ${open ? "open" : ""}" data-key="${esc(e.key)}">
      <button class="ec-sum" type="button"><span class="ec-ic" style="${meta ? `color:${meta.color};background:${meta.color}22` : ""}">${I(meta ? meta.icon : "triangle-alert", 18)}</span>
        <span class="ec-tx"><b>${esc(h.title)}</b><small>${esc(e.workflowName || "Workflow")}${e.nodeName ? " › " + esc(e.nodeName) : ""} · ${esc(ago(e.at))}${e.source === "check" ? " · check" : e.mode ? " · " + esc(e.mode) : ""}</small></span>${I("chevron-down", 16, "ec-chev")}</button>
      <div class="ec-body">
        <pre class="ec-err">${esc(e.error)}</pre>
        <div class="ec-why"><b>Kyun aaya?</b> ${esc(h.why)}</div>
        <div class="ec-fix"><b>Kaise fix karein</b><ol>${h.fix.map((f) => `<li>${esc(f)}</li>`).join("")}</ol></div>
        <div class="ec-act">${e.workflowId && e.nodeId ? `<button class="btn sm primary" data-jump>${I("mouse-pointer-click", 15)} Node pe jao</button>` : e.workflowId ? `<button class="btn sm" data-jump>${I("square-pen", 15)} Workflow kholo</button>` : ""}${e.nodeType && window.YFGuideUI ? `<button class="btn sm" data-guide>${I("book-open", 15)} Guide</button>` : ""}<button class="btn sm ghost" data-copy>${I("copy", 15)} Copy</button>${e.resolved ? "" : `<button class="btn sm ghost" data-res>${I("check", 15)} Resolved</button>`}</div>
      </div></article>`;
  }
  let ecTab = "errors";
  async function openCenter(focusKey) {
    closeCenter();
    if (focusKey === "__check__") { ecTab = "check"; focusKey = null; } E.sync().then(() => { if ($("#errc")) render(); });
    const bd = document.createElement("div"); bd.className = "ec-back"; bd.id = "ecb"; bd.onclick = closeCenter;
    const p = document.createElement("aside"); p.className = "errc"; p.id = "errc"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Error Center");
    document.body.append(bd, p);
    const inEditor = !!(window.YFEditor && window.YFEditor.current());
    if (!inEditor && ecTab === "check") ecTab = "errors";
    function render() {
      const all = E.list(); const openN = all.filter((e) => !e.resolved).length;
      let body = "";
      if (ecTab === "check") {
        const issues = window.YFEditor.lint();
        body = issues.length ? `<p class="ec-note">${I("scan-search", 15)} Run se pehle is workflow me ${issues.length} dikkat mili:</p>` + issues.map((e) => rowHtml(e, false)).join("") : `<div class="ec-empty">${I("circle-check", 40)}<b>Sab theek dikh raha hai</b><small>Trigger hai, nodes jude hain, keys bhari hain. Ab Run dabao.</small></div>`;
      } else {
        const list = all.filter((e) => ecTab === "all" || !e.resolved);
        body = list.length ? list.map((e) => rowHtml(e, e.key === focusKey)).join("") : `<div class="ec-empty">${I("shield-check", 40)}<b>Koi error nahi</b><small>Run ya schedule me koi node fail hua to yahan dikhega — kya hua, kahan, kyun aur kaise fix karein.</small></div>`;
      }
      p.innerHTML = `<header class="ec-h"><span class="ec-hi">${I("bug", 20)}</span><div><b>Error Center</b><small>${openN ? `${openN} unresolved` : "Sab clear"}</small></div><span class="spacer"></span><button class="btn sm ghost icon" id="ecx" aria-label="Close">${I("close", 18)}</button></header>
        <nav class="ec-tabs"><button data-t="errors" class="${ecTab === "errors" ? "on" : ""}">Errors <span>${openN}</span></button>${inEditor ? `<button data-t="check" class="${ecTab === "check" ? "on" : ""}">Is workflow ko check karo</button>` : ""}<button data-t="all" class="${ecTab === "all" ? "on" : ""}">History</button></nav>
        <div class="ec-list">${body}</div>
        ${ecTab !== "check" && all.length ? `<footer class="ec-f"><button class="btn sm" id="ecres">${I("check", 15)} Sab resolved</button><button class="btn sm ghost" id="ecclr" style="color:#ff9aac">${I("trash-2", 15)} Clear all</button></footer>` : ""}`;
      $("#ecx", p).onclick = closeCenter;
      $$("[data-t]", p).forEach((b) => (b.onclick = () => { ecTab = b.dataset.t; render(); }));
      $("#ecres", p) && ($("#ecres", p).onclick = () => { E.resolveAll(); render(); });
      $("#ecclr", p) && ($("#ecclr", p).onclick = () => { if (confirm("Saare errors hata dein?")) { E.clear(); render(); } });
      const rows = ecTab === "check" ? window.YFEditor.lint() : E.list();
      $$(".ec-row", p).forEach((el) => {
        const e = rows.find((x) => x.key === el.dataset.key) || {};
        $(".ec-sum", el).onclick = () => el.classList.toggle("open");
        const j = $("[data-jump]", el); if (j) j.onclick = () => { closeCenter(); jumpTo(e.workflowId, e.nodeId); };
        const g = $("[data-guide]", el); if (g) g.onclick = () => { const t = window.YFGuides && window.YFGuides.NODE_SECTIONS[e.nodeType]; if (t && t[0] && window.YFGuideUI.open) window.YFGuideUI.open(t[0].replace("?", "").split("|")[0]); else if (app()) app().toast("Is node ki guide: node kholo → field ke paas 'Kahan milega?'", ""); };
        const c = $("[data-copy]", el); if (c) c.onclick = () => { const h = C.explain(e.error); navigator.clipboard && navigator.clipboard.writeText(`${e.workflowName} › ${e.nodeName}\n${e.error}\n\n${h.title}\n${h.fix.map((x, i) => `${i + 1}. ${x}`).join("\n")}`).then(() => app() && app().toast("Copied", "ok")); };
        const r = $("[data-res]", el); if (r) r.onclick = () => { E.resolve(e.key); render(); };
      });
      const f = focusKey && $(`.ec-row.open`, p); if (f) f.scrollIntoView({ block: "center" });
    }
    render(); requestAnimationFrame(() => p.classList.add("in"));
    document.addEventListener("keydown", ecKey);
  }
  function ecKey(e) { if (e.key === "Escape") closeCenter(); }
  function closeCenter() { const p = $("#errc"); if (p) p.remove(); const b = $("#ecb"); if (b) b.remove(); document.removeEventListener("keydown", ecKey); }
  function jumpTo(wid, nodeId) {
    if (!wid) return;
    const ed = window.YFEditor && window.YFEditor.current();
    if (ed && ed.id === wid) { if (nodeId) window.YFEditor.focusNode(nodeId); return; }
    if (nodeId) sessionStorage.setItem("yf_focus_node", nodeId);
    location.hash = `#/editor/${wid}`;
  }

  // ------------------------------------------------------------------ 3) n8n-style popup when a node fails
  function runToast(ex) {
    if (!ex || ex.status !== "error") return;
    const bad = (ex.nodes || []).find((n) => n.status === "error"); const rows = C.fromExecution(ex); const row = rows[0];
    const h = C.explain(row ? row.error : ex.error);
    let host = $("#rtoasts"); if (!host) { host = document.createElement("div"); host.id = "rtoasts"; host.setAttribute("aria-live", "assertive"); document.body.appendChild(host); }
    const t = document.createElement("div"); t.className = "rtoast";
    t.innerHTML = `<span class="rt-ic">${I("circle-x", 20)}</span><div class="rt-tx"><b>${bad ? `"${esc(bad.name)}" fail hua` : "Run fail hua"}</b><small>${esc(h.title)} — ${esc(String((row && row.error) || ex.error || "").slice(0, 140))}</small><div class="rt-act">${bad ? `<button class="btn sm" data-d>${I("eye", 14)} Details</button>` : ""}<button class="btn sm primary" data-f>${I("wrench", 14)} Fix</button></div></div><button class="rt-x" aria-label="Close">${I("close", 16)}</button>`;
    host.prepend(t); while (host.children.length > 3) host.lastChild.remove();
    const kill = () => { t.classList.add("out"); setTimeout(() => t.remove(), 250); };
    $(".rt-x", t).onclick = kill;
    const d = $("[data-d]", t); if (d) d.onclick = () => { kill(); if (window.YFEditor && window.YFEditor.current()) window.YFEditor.focusNode(bad.id, true); };
    $("[data-f]", t).onclick = () => { kill(); openCenter(row && row.key); };
    setTimeout(kill, 14000);
  }
  // every finished run (editor, schedule, console) lands here
  addEventListener("yf:run", (e) => { const ex = e.detail; if (!ex) return; E.fromExec(ex); for (const t of terms) t.runEvent(ex); });

  // ------------------------------------------------------------------ 4) Terminal (PC shell via the local server · website console)
  const terms = new Set();
  function consoleApi() {
    const b = B();
    return {
      version: app() ? app().VERSION : "", edition: b ? b.edition : "web",
      listWorkflows: () => b.listWorkflows(),
      run: async (id) => { const wf = await b.getWorkflow(id); const ex = await b.runWorkflow(id, wf); if (b.edition === "full") dispatchEvent(new CustomEvent("yf:run", { detail: ex })); return ex; },
      stop: async (id) => { try { await b.cancelRun(id); } catch (_) { /* */ } try { await b.stopSchedule(id); } catch (_) { /* */ } },
      runs: async (n) => ((await b.listRuns()) || []).slice(0, n),
      errors: async () => E.open(),
      open: (id) => (location.hash = `#/editor/${id}`),
      keys: async () => { const cr = (await b.getCreds()) || {}; return (window.YF_CRED_SCHEMA || []).map((s) => ({ title: s.title, ok: Object.values(cr[s.id] || {}).some((v) => String(v || "").trim()) })); },
      status: async () => { const l = await b.listWorkflows(); return { edition: b.edition === "full" ? "PC/Termux (full)" : "Website (browser)", workflows: l.length, schedules: l.filter((w) => w.schedule && w.schedule.schedule && w.schedule.schedule.enabled).length + " ON", "24x7": b.edition === "full" ? "haan (server chalu rahe)" : "sirf jab tab khula ho", errors: E.count() + " unresolved" }; },
    };
  }
  function terminal(el, opt) {
    opt = opt || {};
    const b = B(); const pc = b && b.edition === "full";
    el.classList.add("term"); if (opt.compact) el.classList.add("compact");
    el.innerHTML = `<div class="term-h"><span class="term-dots"><i></i><i></i><i></i></span><b>${I("square-terminal", 16)} Terminal</b><span class="term-mode ${pc ? "pc" : "web"}">${pc ? "PC shell" : "Website console"}</span><span class="term-cwd"></span><span class="spacer"></span>${pc ? `<button class="btn sm ghost" data-stop title="Ctrl+C">${I("circle-stop", 15)} Stop</button>` : ""}<button class="btn sm ghost icon" data-clear aria-label="Clear">${I("trash-2", 15)}</button>${opt.onClose ? `<button class="btn sm ghost icon" data-close aria-label="Close">${I("close", 16)}</button>` : ""}</div>
      <div class="term-out" tabindex="0" aria-live="polite"></div>
      <div class="term-chips"></div>
      <form class="term-in"><span class="term-ps">${pc ? "$" : "yf&gt;"}</span><input aria-label="Command" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${pc ? "git pull · npm install · pkg install ffmpeg · yf help" : "help · list · run 1 · logs · errors"}"><button class="btn sm primary" aria-label="Run">${I("send-horizontal", 15)}</button></form>`;
    const out = $(".term-out", el), inp = $("input", el), cwdEl = $(".term-cwd", el);
    const hist = JSON.parse(sessionStorage.getItem("yf_term_hist") || "[]"); let hi = hist.length; let busy = false; let pcOk = pc;
    const print = (t, cls) => { const d = document.createElement("div"); d.className = "tl " + (cls || ""); d.textContent = t; out.appendChild(d); while (out.children.length > 800) out.firstChild.remove(); out.scrollTop = out.scrollHeight; return d; };
    const chips = (list) => { $(".term-chips", el).innerHTML = list.map((c) => `<button type="button" data-q="${esc(c)}">${esc(c)}</button>`).join(""); $$("[data-q]", el).forEach((x) => (x.onclick = () => { inp.value = x.dataset.q; submit(); })); };
    if (pc) {
      print("YantraFlow Terminal (PC/Termux) — asli shell, YantraFlow folder me. Sirf tum (password wala login) aur isi device se.", "h");
      print("Dhyan: yahan chalaye commands tumhare PC pe sach me chalte hain. Jo samajh na aaye wo mat chalao. 'yf help' = YantraFlow commands.", "warn");
      chips(C.QUICK_PC);
      fetch("api/terminal/info", { headers: { "x-yf-terminal": "1" } }).then((r) => r.json()).then((j) => { if (j && j.cwd) cwdEl.textContent = j.cwd; if (j && j.enabled === false) { pcOk = false; print("Terminal band hai (YANTRAFLOW_TERMINAL=off). YantraFlow console chal raha hai.", "warn"); } }).catch(() => {});
    } else {
      print("YantraFlow console (website). Yahan se workflows chalao, logs aur errors dekho. 'help' likho.", "h");
      print("Asli shell (git pull, npm install, pkg install ffmpeg) website pe possible nahi — browser tumhare PC ki files/commands tak nahi pahunch sakta. Wo PC/Termux version ke Terminal me milega.", "warn");
      chips(C.QUICK_WEB);
    }
    async function runConsole(line) {
      try { const r = await C.consoleCommand(line, consoleApi()); if (r.clear) out.innerHTML = ""; for (const l of r.lines) print(l.t, l.cls); }
      catch (e) { print("Error: " + e.message, "err"); }
    }
    async function runShell(cmd) {
      busy = true; el.classList.add("busy");
      try {
        const r = await fetch("api/terminal/run", { method: "POST", headers: { "content-type": "application/json", "x-yf-terminal": "1" }, body: JSON.stringify({ cmd }) });
        if (!r.ok) { let m = `HTTP ${r.status}`; try { m = (await r.json()).error || m; } catch (_) { /* */ } print(m, "err"); if (/ffmpeg|not found/i.test(m)) E.add({ source: "terminal", workflowName: "Terminal", error: m }); return; }
        const rd = r.body.getReader(); const dec = new TextDecoder(); let line = print("", "");
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          const txt = dec.decode(value, { stream: true }); const parts = txt.split("\n");
          line.textContent += parts[0];
          for (const p of parts.slice(1)) line = print(p, /^\[exit (?!0\])/.test(p) ? "err" : /^\[exit 0\]/.test(p) ? "ok" : "");
          out.scrollTop = out.scrollHeight;
        }
        const last = [...out.children].reverse().find((d) => /^\[exit /.test(d.textContent));
        if (last) { const m = last.textContent.match(/^\[exit [^\]]+\] (.*)$/); if (m) cwdEl.textContent = m[1]; if (/command not found|not recognized|ENOENT/i.test(out.textContent.slice(-600))) print("Tip: program install nahi hai? Termux: pkg install <naam> · Windows: winget install <naam>", "dim"); }
      } catch (e) { print("Server se connection toota: " + e.message, "err"); }
      finally { busy = false; el.classList.remove("busy"); }
    }
    async function submit() {
      const line = inp.value; inp.value = ""; if (!line.trim()) return;
      hist.push(line); hi = hist.length; sessionStorage.setItem("yf_term_hist", JSON.stringify(hist.slice(-50)));
      print((pc && pcOk ? "$ " : "yf> ") + line, "cmd");
      if (pc && pcOk) {
        if (/^yf(\s|$)/.test(line.trim())) return runConsole(line.trim().replace(/^yf\s*/, "") || "help");
        if (/^(clear|cls)$/.test(line.trim())) { out.innerHTML = ""; return; }
        if (busy) { print("Pichhla command chal raha hai — Stop dabao.", "warn"); return; }
        return runShell(line);
      }
      return runConsole(line);
    }
    $(".term-in", el).onsubmit = (e) => { e.preventDefault(); submit(); };
    inp.onkeydown = (e) => {
      if (e.key === "ArrowUp") { if (hi > 0) { hi--; inp.value = hist[hi]; } e.preventDefault(); }
      else if (e.key === "ArrowDown") { if (hi < hist.length - 1) { hi++; inp.value = hist[hi]; } else { hi = hist.length; inp.value = ""; } e.preventDefault(); }
      else if (e.key === "c" && e.ctrlKey && pc) { kill(); }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
    };
    const kill = () => fetch("api/terminal/kill", { method: "POST", headers: { "x-yf-terminal": "1" } }).then(() => print("^C", "warn")).catch(() => {});
    $("[data-stop]", el) && ($("[data-stop]", el).onclick = kill);
    $("[data-clear]", el).onclick = () => (out.innerHTML = "");
    $("[data-close]", el) && ($("[data-close]", el).onclick = opt.onClose);
    out.onclick = () => { if (!getSelection().toString()) inp.focus({ preventScroll: true }); };
    const api = { el, runEvent(ex) { if (!el.isConnected) { terms.delete(api); return; } print(`[run] ${ex.workflowName}: ${ex.status}${ex.status === "success" ? ` · ${(ex.nodes || []).filter((n) => n.status === "success").length} nodes · ${ex.durationMs} ms` : ex.error ? " — " + ex.error : ""}`, ex.status === "error" ? "err" : "ok"); for (const l of (ex.logs || []).slice(-8)) print(`      ${l.node}: ${l.msg}`, "dim"); }, focus: () => inp.focus({ preventScroll: true }), print };
    terms.add(api);
    return api;
  }
  async function viewTerminal() {
    const v = $("#view"); if (app()) app().setNav("terminal");
    const pc = B() && B().edition === "full";
    v.innerHTML = `<div class="page page-in"><div class="head"><div><h1 class="h">${I("square-terminal", 26)} <span class="g">Terminal</span></h1><p class="sub">${pc ? "PC/Termux: asli shell + YantraFlow commands. git pull, npm install, pkg install ffmpeg, scripts — sab yahin se." : "Website: YantraFlow command console — workflows chalao, live run logs, errors, keys status."}</p></div></div>
      <div id="termbox"></div>
      <div class="two term-cards"><div class="card"><h3>${I("monitor", 16)} Website pe</h3><p>Command console: help, list, run, stop, logs, errors, keys, status. Live run logs yahin aate hain. Shell commands (git/npm/pkg) browser me possible nahi.</p></div><div class="card"><h3>${I("laptop", 16)} PC / Termux pe</h3><p>Asli terminal YantraFlow folder me (start-up password ke saath, sirf isi device se). Band karna ho to YANTRAFLOW_TERMINAL=off. Kuch khatarnak commands (rm -rf /, format, shutdown) block hain.</p></div></div></div>`;
    const t = terminal($("#termbox")); t.focus();
  }

  // ------------------------------------------------------------------ 5) Form Submit trigger on the website: a real form when you press Run
  window.YFAskForm = (def) => new Promise((resolve, reject) => {
    const bd = document.createElement("div"); bd.className = "fm-back";
    bd.innerHTML = `<form class="fm card" novalidate><h3>${I("clipboard-list", 18)} ${esc(def.title || "Form")}</h3><p class="sub">Form Submit trigger — ye bharke Submit karo, workflow inhi values se chalega.</p>${def.fields.map((f) => `<label class="lb" for="fm-${esc(f.name)}">${esc(f.label)}${f.required ? " *" : ""}</label>${f.type === "textarea" ? `<textarea class="inp" id="fm-${esc(f.name)}" name="${esc(f.name)}" rows="3"></textarea>` : `<input class="inp" id="fm-${esc(f.name)}" name="${esc(f.name)}" type="${esc(f.type)}">`}`).join("")}<div class="auth-msg" role="alert"></div><div class="row" style="margin-top:14px;gap:8px"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn primary">${I("send-horizontal", 15)} Submit</button></div></form>`;
    document.body.appendChild(bd);
    const f = $("form", bd); const first = $("input,textarea", f); if (first) first.focus();
    $("[data-c]", f).onclick = () => { bd.remove(); reject(new Error("Form cancel kiya — run roka gaya")); };
    f.onsubmit = (e) => {
      e.preventDefault(); const v = {};
      for (const fd of def.fields) v[fd.name] = $(`[name="${CSS.escape(fd.name)}"]`, f).value;
      const miss = def.fields.filter((x) => x.required && !String(v[x.name]).trim()).map((x) => x.label);
      if (miss.length) { $(".auth-msg", f).textContent = "Ye bharna zaroori hai: " + miss.join(", "); return; }
      bd.remove(); resolve(v);
    };
  });

  // ------------------------------------------------------------------ 6) a little 3D (5–7%): tilt on cards/logo under the mouse
  const TILT = ".wf-card, .card.pj, .pd-hero, .tilt3d";
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (fine) {
    let cur = null;
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest && e.target.closest(TILT);
      if (cur && cur !== el) { cur.style.transform = ""; cur.classList.remove("tilting"); cur = null; }
      if (!el) return; cur = el; el.classList.add("tilting");
      const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      const max = el.classList.contains("pd-hero") ? 2.5 : 5;
      el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-2px)`;
      el.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`); el.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (cur) { cur.style.transform = ""; cur = null; } });
  }

  // ------------------------------------------------------------------ chrome: bug + terminal buttons in the top bar
  function chrome() {
    const tr = $(".top-right");
    if (tr && !$("#errBtn")) {
      tr.insertAdjacentHTML("afterbegin", `<a class="term-btn" href="#/terminal" title="Terminal" aria-label="Terminal">${I("square-terminal", 18)}</a>${errButton("errBtn")}`);
      $("#errBtn").onclick = () => openCenter();
    }
    const nav = $(".topbar .nav");
    if (nav && !nav.querySelector('[data-v="terminal"]')) nav.insertAdjacentHTML("beforeend", `<a href="#/terminal" data-v="terminal">${I("square-terminal", 17)}<span>Terminal</span></a>`);
    paintBadges();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", chrome); else chrome();
  setInterval(() => { if (B() && document.visibilityState === "visible") E.sync(); }, 90000);

  window.YFUI = { anchor, openCenter, closeCenter, runToast, terminal, viewTerminal, errButton, paintBadges, jumpTo };
})();

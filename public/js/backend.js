/* Two backends with the same methods:
   - ServerBackend: talks to the YantraFlow Node server (full edition, PC/Termux)
   - LocalBackend:  runs everything inside this browser tab (web edition) */
(function () {
  "use strict";
  async function req(method, url, body) {
    const r = await fetch(url, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    let data = null; try { data = await r.json(); } catch (_) { /* */ }
    if (r.status === 401 && data && data.error === "locked") { if (window.YFPlatform) window.YFPlatform.showLocalLock("Session ended — enter the password from the terminal again."); throw Object.assign(new Error("Locked"), { locked: true }); }
    if (!r.ok) throw new Error((data && data.error) || `Server answered ${r.status}`);
    return data;
  }
  const ServerBackend = {
    edition: "full",
    health: () => req("GET", "api/health"),
    listWorkflows: () => req("GET", "api/workflows"),
    getWorkflow: (id) => req("GET", `api/workflows/${id}`),
    saveWorkflow: (wf) => (wf.id ? req("PUT", `api/workflows/${wf.id}`, wf) : req("POST", "api/workflows", wf)),
    deleteWorkflow: (id) => req("DELETE", `api/workflows/${id}`),
    importWorkflow: (wf) => req("POST", "api/import", wf),
    runWorkflow: (id, wf, triggerNodeId) => req("POST", `api/workflows/${id}/run`, { workflow: wf, triggerNodeId }),
    setActive: (id, active) => req("POST", `api/workflows/${id}/active`, { active }),
    listRuns: (wfId) => req("GET", "api/executions" + (wfId ? `?workflowId=${wfId}` : "")),
    getRun: (id) => req("GET", `api/executions/${id}`),
    clearRuns: () => req("DELETE", "api/executions"),
    templates: () => req("GET", "api/templates"),
    useTemplate: (key) => req("POST", `api/templates/${key}/use`),
    getCreds: () => req("GET", "api/credentials"),
    saveCreds: (values) => req("PUT", "api/credentials", values),
    testCred: (service) => req("POST", "api/credentials/test", { service }),
    webhookBase: () => `${location.origin}/webhook/`,
  };

  // ---------------- web edition (browser only)
  const LS = {
    // logged-in users get their own space: yf_u_<userId>_workflows, yf_u_<userId>_creds, ...
    get(k, d) { try { const v = localStorage.getItem("yf_" + (window.YF_NS || "") + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { localStorage.setItem("yf_" + (window.YF_NS || "") + k, JSON.stringify(v)); },
  };
  const id = () => Math.random().toString(36).slice(2, 12);
  let tplCache = null;
  async function loadTemplates() {
    if (tplCache) return tplCache;
    const idx = await (await fetch("templates/index.json")).json();
    tplCache = await Promise.all(idx.map(async (t) => ({ ...t, workflow: await (await fetch("templates/" + t.file)).json() })));
    return tplCache;
  }
  function wfs() { return LS.get("workflows", {}); }
  function saveRun(ex) {
    const runs = LS.get("runs", []);
    runs.unshift(ex);
    let keep = runs.slice(0, 60);
    for (;;) { try { LS.set("runs", keep); break; } catch (e) { if (keep.length <= 1) break; keep = keep.slice(0, Math.floor(keep.length / 2)); } }
  }
  async function run(wf, triggerNodeId, mode, triggerData) {
    const ex = await YFEngine.runWorkflow(JSON.parse(JSON.stringify(wf)), { types: YFWeb.types, evaluate: YFWeb.evaluate, triggerNodeId, triggerData, mode, settings: LS.get("creds", {}) });
    saveRun(ex);
    return ex;
  }
  const LocalBackend = {
    edition: "web",
    async health() { return { ok: true, edition: "web" }; },
    async listWorkflows() {
      const runs = LS.get("runs", []);
      return Object.values(wfs()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((wf) => {
        const last = runs.find((r) => r.workflowId === wf.id);
        return { id: wf.id, name: wf.name, active: wf.active, updatedAt: wf.updatedAt, nodeCount: wf.nodes.length, nodeTypes: wf.nodes.map((n) => n.type), lastRun: last ? { status: last.status, startedAt: last.startedAt } : null };
      });
    },
    async getWorkflow(wid) { const w = wfs()[wid]; if (!w) throw new Error("Workflow not found"); return w; },
    async saveWorkflow(wf) {
      YFEngine.validate(wf);
      const all = wfs(); const now = new Date().toISOString();
      if (!wf.id) wf.id = id();
      const old = all[wf.id];
      all[wf.id] = { id: wf.id, name: wf.name || "My workflow", active: !!wf.active, description: wf.description || "", nodes: wf.nodes, connections: wf.connections, createdAt: (old && old.createdAt) || now, updatedAt: now };
      LS.set("workflows", all); return all[wf.id];
    },
    async deleteWorkflow(wid) { const all = wfs(); delete all[wid]; LS.set("workflows", all); return { ok: true }; },
    async importWorkflow(wf) {
      YFEngine.validate(wf);
      const bad = wf.nodes.filter((n) => !YFWeb.types[n.type]).map((n) => n.type);
      if (bad.length) throw new Error("Unknown node types: " + [...new Set(bad)].join(", "));
      delete wf.id; wf.active = false; return LocalBackend.saveWorkflow(wf);
    },
    async runWorkflow(wid, wf, triggerNodeId) { return run(wf || wfs()[wid], triggerNodeId, "manual"); },
    async setActive(wid, active) {
      const all = wfs(); const wf = all[wid]; if (!wf) throw new Error("Save the workflow first");
      if (active && !YFEngine.findTriggers(wf, YFWeb.types).some((n) => ["scheduleTrigger", "sheetTrigger"].includes(n.type))) throw new Error("In the web version, Active works with Schedule and Sheet triggers (while this tab stays open). Webhook & Folder Watch need the full version.");
      wf.active = !!active; LS.set("workflows", all); return wf;
    },
    async listRuns(wfId) { return LS.get("runs", []).filter((r) => !wfId || r.workflowId === wfId).map(({ nodes, logs, ...r }) => ({ ...r, nodeCount: (nodes || []).length, failedNode: ((nodes || []).find((n) => n.status === "error") || {}).name || null })); },
    async getRun(rid) { const r = LS.get("runs", []).find((x) => x.id === rid); if (!r) throw new Error("Run not found"); return r; },
    async clearRuns() { LS.set("runs", []); return { ok: true }; },
    async templates() { return (await loadTemplates()).map(({ workflow, ...t }) => ({ ...t, nodes: workflow.nodes.map((n) => n.type) })); },
    async useTemplate(key) { const t = (await loadTemplates()).find((x) => x.key === key); const wf = JSON.parse(JSON.stringify(t.workflow)); delete wf.id; wf.active = false; return LocalBackend.saveWorkflow(wf); },
    async getCreds() {
      const v = LS.get("creds", {}); const values = {};
      for (const sec of YF_CRED_SCHEMA) { values[sec.id] = {}; for (const f of sec.fields) { const x = (v[sec.id] || {})[f.key]; values[sec.id][f.key] = f.secret && x ? "••••••" + String(x).slice(-4) : x || ""; } }
      return { schema: YF_CRED_SCHEMA, values };
    },
    async saveCreds(values) {
      const v = LS.get("creds", {});
      for (const sec of YF_CRED_SCHEMA) { const inc = values[sec.id]; if (!inc) continue; v[sec.id] = v[sec.id] || {}; for (const f of sec.fields) { if (!(f.key in inc)) continue; const x = String(inc[f.key] || "").trim(); if (f.secret && x.startsWith("••••••")) continue; v[sec.id][f.key] = x; } }
      LS.set("creds", v); return LocalBackend.getCreds();
    },
    async testCred(service) {
      const node = service === "ai" ? { id: "a", type: "aiChat", name: "AI test", params: { prompt: "Reply with exactly: YantraFlow connected ✅", maxTokens: 30 } } : { id: "a", type: "telegram", name: "Telegram test", params: { text: "✅ YantraFlow is connected to this chat!" } };
      const ex = await YFEngine.runWorkflow({ id: "test", name: "test", nodes: [{ id: "t", type: "manualTrigger", name: "Start", params: {} }, node], connections: [{ from: "t", fromOutput: 0, to: "a" }] }, { types: YFWeb.types, evaluate: YFWeb.evaluate, settings: LS.get("creds", {}) });
      return { ok: ex.status === "success", error: ex.error, output: (ex.nodes[1] || {}).output };
    },
    webhookBase: () => "http://localhost:5679/webhook/",
    // browser scheduler: runs Active schedule/sheet workflows while the tab is open
    startScheduler(onRun) {
      const last = {};
      const tick = async () => {
        const now = new Date();
        const mk = `${now.getHours()}:${now.getMinutes()}`;
        for (const wf of Object.values(wfs())) {
          if (!wf.active) continue;
          for (const n of wf.nodes) {
            const p = n.params || {}; const key = wf.id + n.id;
            if (n.type === "scheduleTrigger") {
              if ((p.mode || "interval") === "cron") { if (cronMatch(p.cron || "", now) && last[key] !== mk) { last[key] = mk; onRun(await run(wf, n.id, "schedule")); } }
              else { const every = Math.max(1, Number(p.minutes) || 60) * 60000; if (!last[key]) { last[key] = Date.now(); continue; } if (Date.now() - last[key] >= every) { last[key] = Date.now(); onRun(await run(wf, n.id, "schedule")); } }
            } else if (n.type === "sheetTrigger") {
              const every = Math.max(1, Number(p.minutes) || 5) * 60000;
              if (last[key] && Date.now() - last[key] < every) continue; last[key] = Date.now();
              try {
                const st = LS.get("poll", {}); const rows = await fetch(p.source).then((r) => r.text()).then(YFWeb.parseCsv);
                const prev = st[key]; st[key] = rows.length; LS.set("poll", st);
                if (prev !== undefined && rows.length > prev) onRun(await run(wf, n.id, "trigger", { pollItems: rows.slice(prev) }));
              } catch (_) { /* ignore */ }
            }
          }
        }
      };
      setInterval(() => tick().catch(() => {}), 15000);
    },
  };
  function cronMatch(expr, d) {
    const f = expr.trim().split(/\s+/); if (f.length !== 5) return false;
    const vals = [d.getMinutes(), d.getHours(), d.getDate(), d.getMonth() + 1, d.getDay()];
    const ok = (field, v, lo, hi) => field.split(",").some((part) => {
      let [r, st] = part.split("/"); st = st ? Number(st) : 1; let a, b;
      if (r === "*") { a = lo; b = hi; } else if (r.includes("-")) { [a, b] = r.split("-").map(Number); } else { a = Number(r); b = st > 1 ? hi : a; }
      for (let x = a; x <= b; x += st) if ((x === 7 ? 0 : x) === v) return true; return false;
    });
    const R = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    return f.every((x, i) => ok(x, vals[i], R[i][0], R[i][1]));
  }
  window.YFBackends = { ServerBackend, LocalBackend };
})();

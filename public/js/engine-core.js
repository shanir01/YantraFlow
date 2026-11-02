/* YantraFlow engine core — shared by the Node server (full edition) and the
   browser (web edition). It walks the workflow graph from a trigger node and
   runs each node with the items coming out of its parents. MIT License. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_STORED = 40000; // chars of output kept per node in the run log

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function clip(value) {
    let txt;
    try { txt = JSON.stringify(value); } catch (_) { return "[unserializable]"; }
    if (txt === undefined) return value;
    if (txt.length <= MAX_STORED) return JSON.parse(txt);
    return { _truncated: true, preview: txt.slice(0, MAX_STORED) };
  }

  function validate(wf) {
    if (!wf || typeof wf !== "object") throw new Error("Workflow must be an object");
    if (!Array.isArray(wf.nodes)) throw new Error("Workflow has no nodes list");
    if (!Array.isArray(wf.connections)) wf.connections = [];
    const ids = new Set();
    for (const n of wf.nodes) {
      if (!n.id || !n.type) throw new Error("Every node needs an id and a type");
      if (ids.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
      ids.add(n.id);
      if (!n.name) n.name = n.type;
      if (!n.params) n.params = {};
    }
    wf.connections = wf.connections.filter((c) => ids.has(c.from) && ids.has(c.to));
    return wf;
  }

  function findTriggers(wf, types, kind) {
    return wf.nodes.filter((n) => types[n.type] && types[n.type].trigger && !n.disabled && (!kind || types[n.type].trigger === kind));
  }

  function plan(wf, startId) {
    const out = {};
    for (const c of wf.connections) (out[c.from] = out[c.from] || []).push(c);
    const reach = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      for (const c of out[id] || []) if (!reach.has(c.to)) { reach.add(c.to); stack.push(c.to); }
    }
    const indeg = {};
    for (const id of reach) indeg[id] = 0;
    for (const c of wf.connections) if (reach.has(c.from) && reach.has(c.to)) indeg[c.to]++;
    const order = [];
    const q = [startId];
    if (indeg[startId] !== 0) throw new Error("The trigger node cannot have inputs");
    while (q.length) {
      const id = q.shift();
      order.push(id);
      for (const c of out[id] || []) if (reach.has(c.to) && --indeg[c.to] === 0) q.push(c.to);
    }
    if (order.length !== reach.size) throw new Error("Loop detected: a node connects back to an earlier node. Remove the loop.");
    return order;
  }

  /**
   * opts: {
   *   types: { [type]: nodeDef with async run(ctx) },
   *   evaluate(value, exprContext) -> value,
   *   triggerNodeId, triggerData: { webhook?, pollItems? }, mode, settings,
   *   extraCtx: object merged into each node ctx (e.g. filesDir),
   *   onUpdate(execution)  (optional, called after every node)
   * }
   */
  async function runWorkflow(wf, opts) {
    validate(wf);
    const types = opts.types;
    const byId = Object.fromEntries(wf.nodes.map((n) => [n.id, n]));
    const exec = {
      id: opts.executionId || uid(),
      workflowId: wf.id || null,
      workflowName: wf.name || "Untitled",
      mode: opts.mode || "manual",
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: 0,
      nodes: [],
      logs: [],
      error: null,
      response: null,
    };
    const t0 = Date.now();
    let start = opts.triggerNodeId ? byId[opts.triggerNodeId] : findTriggers(wf, types)[0];
    try {
      if (!start) throw new Error("Add a trigger node (Manual Trigger, Schedule, Webhook…) to start the workflow");
      if (!types[start.type] || !types[start.type].trigger) throw new Error(`"${start.name}" is not a trigger node`);
      const order = plan(wf, start.id);
      const results = {}; // id -> outputs [[items],[items]]
      const nodeData = {}; // name -> { json, items }
      for (const id of order) {
        const node = byId[id];
        const def = types[node.type];
        const rec = { id, name: node.name, type: node.type, status: "running", startedAt: new Date().toISOString(), ms: 0, inputCount: 0, outputCount: 0, output: null, error: null };
        let items = [];
        if (id !== start.id) {
          for (const c of wf.connections) {
            if (c.to !== id || !results[c.from]) continue;
            const port = results[c.from][c.fromOutput || 0];
            if (port && port.length) items = items.concat(port);
          }
          if (!items.length) { rec.status = "skipped"; exec.nodes.push(rec); continue; }
        }
        rec.inputCount = items.length;
        if (node.disabled) {
          results[id] = [items];
          rec.status = "disabled"; rec.outputCount = items.length; exec.nodes.push(rec);
          continue;
        }
        if (!def) throw new Error(`Unknown node type "${node.type}" (node "${node.name}")`);
        const raw = node.params || {};
        const exprBase = (i) => ({
          $json: items[i] || {}, $item: i, $items: items, $input: { all: () => items, first: () => items[0] || {}, item: items[i] || {} },
          $node: nodeData, $workflow: { id: wf.id, name: wf.name }, $execution: { id: exec.id, mode: exec.mode },
        });
        const evalFor = (value, i) => opts.evaluate(value, exprBase(i || 0));
        const ctx = Object.assign({}, opts.extraCtx || {}, {
          node, raw, items, settings: opts.settings || {}, nodeData, workflow: { id: wf.id || null, name: wf.name || "" },
          p: (key, i) => evalFor(raw[key] !== undefined ? raw[key] : defaultOf(def, key), i || 0),
          evalFor,
          log: (msg) => exec.logs.push({ t: new Date().toISOString(), node: node.name, msg: String(msg) }),
          respond: (r) => { exec.response = r; },
          webhook: id === start.id ? (opts.triggerData || {}).webhook : undefined,
          pollItems: id === start.id ? (opts.triggerData || {}).pollItems : undefined,
        });
        // fill missing params with defaults so raw.* is always meaningful
        for (const pdef of def.params || []) if (raw[pdef.key] === undefined) raw[pdef.key] = pdef.default;
        const n0 = Date.now();
        exec.nodes.push(rec);
        if (opts.onUpdate) opts.onUpdate(exec);
        try {
          let outs = await def.run(ctx);
          if (!Array.isArray(outs)) outs = [[]];
          outs = outs.map((o) => (Array.isArray(o) ? o : []).map((it) => (it && typeof it === "object" && !Array.isArray(it) ? it : { value: it })));
          results[id] = outs;
          rec.status = "success";
          rec.outputCount = outs.reduce((a, o) => a + o.length, 0);
          rec.output = clip(outs.length === 1 ? outs[0] : outs);
          const firstNonEmpty = outs.find((o) => o.length) || [];
          nodeData[node.name] = { json: firstNonEmpty[0] || {}, items: firstNonEmpty, outputs: outs };
        } catch (e) {
          rec.error = e && e.message ? e.message : String(e);
          rec.status = "error";
          if (node.continueOnFail) {
            const errItems = items.map((it) => Object.assign({}, it, { error: rec.error }));
            results[id] = [errItems];
            nodeData[node.name] = { json: errItems[0] || {}, items: errItems };
            rec.outputCount = errItems.length;
          } else {
            rec.ms = Date.now() - n0;
            throw Object.assign(new Error(`${node.name}: ${rec.error}`), { nodeFailed: true });
          }
        }
        rec.ms = Date.now() - n0;
        if (opts.onUpdate) opts.onUpdate(exec);
      }
      exec.status = "success";
      // default webhook response = last node that produced data
      if (!exec.response) {
        for (let i = exec.nodes.length - 1; i >= 0; i--) {
          const r = exec.nodes[i];
          if (r.status === "success" && r.outputCount) { const o = results[r.id].find((x) => x.length); exec.lastOutput = o.length === 1 ? o[0] : o; break; }
        }
      }
    } catch (e) {
      exec.status = "error";
      exec.error = e && e.message ? e.message : String(e);
    }
    exec.finishedAt = new Date().toISOString();
    exec.durationMs = Date.now() - t0;
    if (opts.onUpdate) opts.onUpdate(exec);
    return exec;
  }

  function defaultOf(def, key) {
    const p = (def.params || []).find((x) => x.key === key);
    return p ? p.default : undefined;
  }

  return { runWorkflow, validate, findTriggers, plan, uid };
});

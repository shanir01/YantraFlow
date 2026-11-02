/* YantraFlow v4.4 — AI Project Generator (logic only; shared by browser + tests).
   User writes in Hinglish -> AI (user's OWN key from the Keys page) returns workflow JSON
   -> validated against the node catalog -> repair loop -> preview -> save. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFProjGen = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const EXAMPLES = [
    "Har subah 8 baje Telegram pe motivational quote photo ke saath bhejo",
    "Roz shaam 6 baje funny video dhundh ke YouTube Shorts aur Telegram pe daalo",
    "Har ghante meri website check karo, down ho to Telegram pe alert bhejo",
    "Har 2 ghante tech news padh ke AI summary Telegram channel pe post karo",
    "Roz 9 baje mere topic pe AI post likh ke Instagram pe photo ke saath daalo",
    "Webhook pe aaye customer message ka AI se Hinglish jawab do",
  ];
  const SKIP = new Set(["respondWebhook"]);
  /* compact catalog for the prompt: type, what it does, its param keys (select options listed) */
  function catalog(meta) {
    return meta.filter((m) => !SKIP.has(m.type) || true).map((m) => {
      const ps = (m.params || []).map((p) => p.type === "select" ? `${p.key}(${(p.options || []).slice(0, 8).join("|")})` : p.key).join(", ");
      return `- ${m.type}${m.trigger ? " [TRIGGER]" : ""}: ${String(m.description || m.label).slice(0, 140)} | params: ${ps}${m.outputs > 1 ? ` | outputs: ${m.outputs}` : ""}`;
    }).join("\n");
  }
  function systemPrompt(meta) {
    return `You design automations for YantraFlow (an n8n-style tool). Reply with ONLY one JSON object, no markdown, no explanation.
Shape: {"name":"short Hinglish name","description":"one line Hinglish","nodes":[{"id":"n1","type":"<type>","name":"<Hinglish step name>","params":{...}}],"connections":[{"from":"n1","to":"n2","fromOutput":0}]}
Rules:
- Use ONLY these node types and param keys (anything else is rejected):
${catalog(meta)}
- Exactly one trigger node, first (id n1). "har roz / har subah / har ghante" = scheduleTrigger with mode "cron" and a 5-field cron (e.g. "0 8 * * *" = roz 8 baje, "0 */2 * * *" = har 2 ghante). Otherwise manualTrigger.
- 2 to 10 nodes, ids n1..nN, connected in order (n1->n2->n3...). if/switch nodes may use fromOutput 0/1.
- Leave every API key, token, chat id, base URL and model EMPTY ("") — the user fills them on the Keys page.
- Text params may use {{ $json.field }} from the previous node (aiChat/aiPost output field: text).
- Prefer: aiChat for writing text, imageMaker for a post photo, videoMaker for a short video, telegram (operation text|photo|video) to send, stockVideo for free clips, rss for news, httpRequest + if for website checks.
- Hinglish (Roman Hindi) for names, prompts and messages.`;
  }
  function userPrompt(text) { return `Automation chahiye: ${String(text || "").slice(0, 800)}\nSirf JSON do.`; }
  function extractJson(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("AI ne JSON nahi diya");
    t = t.slice(a, b + 1);
    try { return JSON.parse(t); } catch (e) { throw new Error("AI ka JSON toota hua hai: " + e.message.slice(0, 80)); }
  }
  /* -> { ok, errors[], workflow } ; workflow is normalised (defaults filled, unknown params dropped, positions set) */
  function validate(wf, meta) {
    const errors = [];
    const M = Object.fromEntries(meta.map((m) => [m.type, m]));
    if (!wf || typeof wf !== "object" || Array.isArray(wf)) return { ok: false, errors: ["Top level must be a JSON object"], workflow: null };
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    if (nodes.length < 2) errors.push("Need at least 2 nodes (a trigger + one action)");
    if (nodes.length > 15) errors.push("Too many nodes (max 15)");
    const ids = new Set(); const out = [];
    nodes.forEach((n, i) => {
      if (!n || typeof n !== "object") { errors.push(`nodes[${i}] is not an object`); return; }
      const id = String(n.id || "").trim();
      if (!id) errors.push(`nodes[${i}] has no id`);
      else if (ids.has(id)) errors.push(`Duplicate node id "${id}"`);
      ids.add(id);
      const m = M[n.type];
      if (!m) { errors.push(`Unknown node type "${n.type}" (allowed: ${Object.keys(M).join(", ")})`); return; }
      const params = {}; const given = n.params && typeof n.params === "object" ? n.params : {};
      for (const p of m.params || []) {
        let v = given[p.key];
        if (v === undefined || v === null) v = p.default !== undefined ? p.default : "";
        if (p.type === "select" && p.options && !p.options.map(String).includes(String(v))) { errors.push(`${id}.${p.key} = "${v}" is not one of ${p.options.join("|")}`); v = p.default !== undefined ? p.default : p.options[0]; }
        if (p.type === "number" && v !== "" && isNaN(Number(v))) { errors.push(`${id}.${p.key} must be a number`); v = p.default; }
        if (p.type === "json" && typeof v === "object") v = JSON.stringify(v);
        if (p.type === "secret") v = ""; // never accept keys from the AI
        params[p.key] = v;
      }
      const unknown = Object.keys(given).filter((k) => !(m.params || []).some((p) => p.key === k));
      if (unknown.length > 3) errors.push(`${id} (${n.type}) has unknown params: ${unknown.join(", ")}`);
      if (n.type === "scheduleTrigger" && params.mode === "cron" && !/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(String(params.cron).trim())) errors.push(`${id}.cron must have 5 fields, e.g. "0 8 * * *"`);
      out.push({ id, type: n.type, name: String(n.name || m.label).slice(0, 60), params, position: [40 + i * 270, 140 + (i % 2) * 40] });
    });
    const triggers = out.filter((n) => M[n.type] && M[n.type].trigger);
    if (!triggers.length) errors.push("Need one trigger node (manualTrigger or scheduleTrigger) first");
    if (triggers.length > 1) errors.push("Only one trigger node allowed");
    if (triggers.length && out[0] && out[0].id !== triggers[0].id) errors.push("Trigger must be the first node");
    let conns = Array.isArray(wf.connections) ? wf.connections : [];
    const okIds = new Set(out.map((n) => n.id));
    const cleaned = [];
    conns.forEach((c, i) => {
      if (!c || !okIds.has(String(c.from)) || !okIds.has(String(c.to))) { errors.push(`connections[${i}] points to a missing node`); return; }
      const from = out.find((n) => n.id === String(c.from)); const outs = (M[from.type] || {}).outputs || 1;
      const fo = Number(c.fromOutput || 0);
      if (!(fo >= 0 && fo < outs)) { errors.push(`connections[${i}].fromOutput ${fo} — ${from.type} has ${outs} output(s)`); return; }
      if (String(c.from) === String(c.to)) { errors.push(`connections[${i}] connects a node to itself`); return; }
      cleaned.push({ from: String(c.from), fromOutput: fo, to: String(c.to) });
    });
    if (!cleaned.length && out.length > 1 && !conns.length) { // AI forgot connections: chain in order
      for (let i = 1; i < out.length; i++) cleaned.push({ from: out[i - 1].id, fromOutput: 0, to: out[i].id });
    }
    const reach = new Set(triggers.length ? [triggers[0].id] : []); let grew = true;
    while (grew) { grew = false; for (const c of cleaned) if (reach.has(c.from) && !reach.has(c.to)) { reach.add(c.to); grew = true; } }
    out.forEach((n) => { if (!reach.has(n.id) && triggers.length) errors.push(`Node ${n.id} (${n.name}) is not connected to the trigger`); });
    const workflow = { name: String(wf.name || "AI project").slice(0, 80), description: String(wf.description || "").slice(0, 240), active: false, nodes: out, connections: cleaned, generatedBy: "ai-project-generator" };
    return { ok: errors.length === 0, errors, workflow };
  }
  function repairPrompt(errors) { return `Ye JSON galat hai:\n- ${errors.slice(0, 12).join("\n- ")}\nIn galtiyon ko theek karke POORA JSON dobara do. Sirf JSON.`; }
  /* callAI(messages) -> Promise<string>. onStep(msg) for progress. */
  async function generate({ text, meta, callAI, maxTries = 3, onStep }) {
    if (!String(text || "").trim()) throw new Error("Pehle likho kaisa automation chahiye");
    const messages = [{ role: "system", content: systemPrompt(meta) }, { role: "user", content: userPrompt(text) }];
    let last = null;
    for (let t = 1; t <= maxTries; t++) {
      onStep && onStep(t === 1 ? "AI project bana raha hai…" : `Galtiyan theek kar raha hai (try ${t}/${maxTries})…`);
      const reply = await callAI(messages);
      let parsed, res;
      try { parsed = extractJson(reply); res = validate(parsed, meta); }
      catch (e) { res = { ok: false, errors: [e.message], workflow: null }; }
      last = res;
      if (res.ok) return Object.assign({ tries: t }, res);
      messages.push({ role: "assistant", content: String(reply).slice(0, 6000) }, { role: "user", content: repairPrompt(res.errors) });
    }
    const err = new Error("AI sahi project nahi bana paaya: " + (last ? last.errors.slice(0, 3).join("; ") : "")); err.result = last; throw err;
  }
  return { EXAMPLES, catalog, systemPrompt, userPrompt, extractJson, validate, repairPrompt, generate };
});

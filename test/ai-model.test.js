"use strict";
// AI Chat: blank / "auto" model is replaced by a model the provider at Base URL serves.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const AIM = require("../public/js/ai-model.js");

test("ai model picker: default by Base URL when Model is blank or auto", () => {
  const cases = [
    ["https://api.groq.com/openai/v1", "", "openai/gpt-oss-120b"],
    ["https://api.groq.com/openai/v1", "auto", "openai/gpt-oss-120b"],
    ["https://api.groq.com/openai/v1", "  AUTO ", "openai/gpt-oss-120b"],
    ["https://generativelanguage.googleapis.com/v1beta/openai", "", "gemini-3.8-flash"],
    ["https://openrouter.ai/api/v1", undefined, "openrouter/auto"],
    ["https://api.openai.com/v1", null, "gpt-4o-mini"],
    ["http://localhost:8787/v1", "", "auto"],
    ["http://127.0.0.1:8787/v1", "auto", "auto"],
    ["https://sangamai.sites.tab.bot/v1", "", "auto"],
    ["not a url", "", "auto"],
  ];
  for (const [base, model, want] of cases) assert.equal(AIM.pickModel(base, model).model, want, `${base} + ${JSON.stringify(model)}`);
  // a model the user typed is always kept, and gets no extra fields
  const typed = AIM.pickModel("https://api.groq.com/openai/v1", "qwen/qwen3.8-27b");
  assert.equal(typed.model, "qwen/qwen3.8-27b"); assert.deepEqual(typed.extra, {}); assert.equal(typed.picked, false);
  // look-alike hosts do not match
  assert.equal(AIM.pickModel("https://api.groq.com.evil.example/v1", "").model, "auto");
  assert.equal(AIM.pickModel("https://notgroq.com/v1", "").model, "auto");
});

test("ai model picker: friendly error when the model name is wrong", () => {
  const m = AIM.modelError("https://api.groq.com/openai/v1", "auto", 404, "The model `auto` does not exist or you do not have access to it.");
  assert.match(m, /Model naam galat hai/); assert.match(m, /openai\/gpt-oss-120b/); assert.match(m, /404/);
  assert.match(AIM.modelError("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", 400, "The model `llama-3.3-70b-versatile` has been decommissioned and is no longer supported."), /gpt-oss-120b/);
  assert.match(AIM.modelError("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash", 404, "This model models/gemini-2.5-flash is no longer available to new users."), /gemini-3\.8-flash/);
  assert.equal(AIM.modelError("https://api.groq.com/openai/v1", "x", 401, "Invalid API Key"), null);
  assert.equal(AIM.modelError("https://api.groq.com/openai/v1", "x", 429, "Rate limit reached"), null);
});

test("ai model picker: catches a project name / key / URL pasted into Model", () => {
  const G = "https://generativelanguage.googleapis.com/v1beta/openai";
  const pj = AIM.badModel(G, "gen-lang-client-0173423227");
  assert.match(pj, /project ka naam hai, model nahi/); assert.match(pj, /gemini-3\.8-flash/);
  assert.match(AIM.badModel(G, "AIzaSyD3x4mpleKeyValue1234567890abcdEFG"), /API key/);
  assert.match(AIM.badModel("https://api.groq.com/openai/v1", "gsk_abc123"), /API key/);
  assert.match(AIM.badModel(G, "https://generativelanguage.googleapis.com/v1beta/openai"), /Base URL/);
  for (const ok of ["", "auto", "gemini-3.8-flash", "models/gemini-3.8-flash", "openai/gpt-oss-120b", "meta-llama/llama-3.3-70b-instruct:free", "llama3.2:latest", "gpt-4o-mini", "qwen/qwen3.8-27b"]) assert.equal(AIM.badModel(G, ok), null, ok);
});

test("web edition AI Chat sends the picked model to Groq and explains a 404 model error", async () => {
  const calls = [];
  let answer = { status: 200, body: { model: "openai/gpt-oss-120b", choices: [{ message: { content: "Namaste" } }] } };
  const fakeFetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { status: answer.status, ok: answer.status < 400, text: async () => JSON.stringify(answer.body) }; };
  const win = {};
  const ctx = vm.createContext({ window: win, self: win, fetch: fakeFetch, URL, URLSearchParams, FormData, Blob, console, setTimeout });
  for (const f of ["js/node-meta.js", "js/ai-model.js", "js/engine-core.js", "js/web-nodes.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", f), "utf8"), ctx);
  const wf = { name: "ai", nodes: [{ id: "t", type: "manualTrigger", name: "S", params: {} }, { id: "a", type: "aiChat", name: "AI", params: { prompt: "hi" } }], connections: [{ from: "t", to: "a" }] };
  const settings = { ai: { baseUrl: "https://api.groq.com/openai/v1/", apiKey: "gsk_test", model: "" } };
  const ex = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings });
  assert.equal(ex.status, "success", ex.error);
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].body.model, "openai/gpt-oss-120b");
  assert.equal(calls[0].body.reasoning_effort, "low");
  answer = { status: 404, body: { error: { message: "The model `nope` does not exist or you do not have access to it.", code: "model_not_found" } } };
  settings.ai.model = "nope";
  const bad = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings });
  assert.equal(calls[1].body.model, "nope"); assert.equal(calls[1].body.reasoning_effort, undefined);
  assert.match(bad.error, /Model naam galat hai/); assert.match(bad.error, /gpt-oss-120b/);
  // a Google project name in the Model box is caught before any request is sent
  settings.ai = { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "k", model: "gen-lang-client-0173423227" };
  const n = calls.length;
  const pj = await win.YFEngine.runWorkflow(wf, { types: win.YFWeb.types, evaluate: win.YFWeb.evaluate, settings });
  assert.equal(calls.length, n); assert.match(pj.error, /project ka naam hai/);
});

test("server AI Chat (PC/Termux) also picks the default model", async () => {
  const realFetch = global.fetch; const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url: String(url), body: JSON.parse(opts.body) }); return new Response(JSON.stringify({ model: "gemini-3.8-flash", choices: [{ message: { content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const nodes = require("../src/nodes.js");
    const B = nodes.BY_TYPE;
    const ai = typeof B.get === "function" ? B.get("aiChat") : B.aiChat;
    assert.ok(ai && ai.run, "aiChat node found");
    const out = await ai.run({ items: [{}], raw: {}, settings: { ai: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "k" } }, p: (k) => (k === "prompt" ? "hi" : ""), log: () => {} });
    assert.equal(calls[0].body.model, "gemini-3.8-flash");
    assert.equal(out[0][0].text, "ok");
  } finally { global.fetch = realFetch; }
});

/* AI model defaults — shared by server (PC/Termux) and browser (web edition).
   When the Model box is blank (or "auto"), pick a model the provider at Base URL
   actually serves. Model ids checked against each provider's docs on 2026-11-02:
   - Groq: llama-3.3-70b-versatile was shut down for Free/Developer plans on
     2026-08-16; Groq recommends openai/gpt-oss-120b (on the free plan).
   - Gemini: gemini-2.0-flash was shut down in June 2026, and gemini-2.5-flash
     now answers "no longer available to new users"; gemini-3.8-flash is the
     current Flash model (free tier on Google's pricing page).
   - OpenRouter: openrouter/auto (Auto Router).
   - OpenAI: gpt-4o-mini (OpenAI lists its removal on 2027-01-14).
   - FreeLLM-Router / SangamAI / localhost / anything else: "auto" (the router picks). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFAiModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const DEFAULTS = [
    { name: "Groq", test: /(^|\.)groq\.com$/i, model: "openai/gpt-oss-120b", extra: { reasoning_effort: "low" } },
    { name: "Gemini", test: /(^|\.)generativelanguage\.googleapis\.com$/i, model: "gemini-3.8-flash", extra: { reasoning_effort: "low" } },
    { name: "OpenRouter", test: /(^|\.)openrouter\.ai$/i, model: "openrouter/auto", extra: {} },
    { name: "OpenAI", test: /(^|\.)openai\.com$/i, model: "gpt-4o-mini", extra: {} },
  ];
  function host(baseUrl) {
    try { return new URL(String(baseUrl || "")).hostname.toLowerCase(); } catch (e) { return ""; }
  }
  function provider(baseUrl) {
    const h = host(baseUrl);
    return DEFAULTS.find((d) => d.test.test(h)) || null;
  }
  /* -> { model, extra, picked, provider }. extra = request fields for the auto-picked model only. */
  function pickModel(baseUrl, model) {
    const m = String(model == null ? "" : model).trim();
    if (m && m.toLowerCase() !== "auto") return { model: m, extra: {}, picked: false, provider: (provider(baseUrl) || {}).name || "" };
    const p = provider(baseUrl);
    if (!p) return { model: "auto", extra: {}, picked: false, provider: "" };
    return { model: p.model, extra: Object.assign({}, p.extra), picked: true, provider: p.name };
  }
  /* Catch things pasted into the Model box that are not a model name (checked before calling the AI). */
  function badModel(baseUrl, model) {
    const m = String(model == null ? "" : model).trim();
    if (!m || m.toLowerCase() === "auto") return null;
    const p = provider(baseUrl);
    const eg = p ? p.model : "auto";
    const tail = ` — Model box me ${eg} likho (ya khaali chhodo, apne aap sahi model lega).`;
    if (/^gen-lang-client-/i.test(m) || /^projects\//i.test(m)) return `"${m}" Google Cloud project ka naam hai, model nahi${tail}`;
    if (/^(gsk_|sk-|sk_|AIza|xai-|or-)/.test(m) || /^[A-Za-z0-9_\-]{35,}$/.test(m) && !/[.\/:]/.test(m) && /\d/.test(m) && /[A-Z]/.test(m)) return `Model box me API key daal di hai — key "API key" box me daalo${tail}`;
    if (/^https?:\/\//i.test(m)) return `Model box me URL daal diya hai — URL "Base URL" box me daalo${tail}`;
    if (/\s/.test(m)) return `"${m}" model ka naam nahi lagta (space nahi hota)${tail}`;
    return null;
  }
  /* Friendlier message when the provider says the model name is wrong. */
  function modelError(baseUrl, model, status, msg) {
    const text = String(msg || "");
    if (!/model/i.test(text)) return null;
    if (!(status === 404 || /does not exist|not found|not exist|decommissioned|deprecated|not supported|invalid model|model_not_found|unknown model|no access|no longer available/i.test(text))) return null;
    const p = provider(baseUrl);
    const eg = p ? p.model : "auto (FreeLLM-Router) ya openai/gpt-oss-120b (Groq)";
    return `Model naam galat hai ("${model}") — Keys page me Model likho, e.g. ${eg}. [AI answered ${status}: ${text}]`;
  }
  return { pickModel, badModel, modelError, provider, DEFAULTS };
});

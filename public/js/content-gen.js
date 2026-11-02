/* YantraFlow auto post writer — SEED document + "never repeat" history.
   Shared by the PC/Termux server and the website. The AI call itself is done by each edition. MIT License. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFContent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const PLATFORMS = {
    telegram: { name: "Telegram", limit: 4000, style: "a Telegram channel post: short paragraphs, 1-3 relevant emojis, a clear call to action at the end" },
    instagram: { name: "Instagram", limit: 2200, style: "an Instagram caption: strong first line (hook), 3-6 short lines, then 8-15 relevant hashtags at the end" },
    x: { name: "X (Twitter)", limit: 280, style: "ONE tweet, maximum 270 characters including hashtags, punchy, at most 2 hashtags" },
    linkedin: { name: "LinkedIn", limit: 3000, style: "a LinkedIn post: professional but friendly, hook line, 4-8 short lines with line breaks, 3-5 hashtags at the end, no clickbait" },
    youtube: { name: "YouTube", limit: 5000, style: "YouTube video metadata" },
  };
  const SEED_MAX = 6000; // characters of the seed document sent to the AI
  function words(t) { return String(t || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}\s#]/gu, " ").split(/\s+/).filter((w) => w.length > 2); }
  /* 0..1 word-overlap (Jaccard) — 1 = same post */
  function similarity(a, b) {
    const A = new Set(words(a)); const B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let inter = 0; for (const w of A) if (B.has(w)) inter++;
    return inter / (A.size + B.size - inter);
  }
  function maxSimilarity(text, history) {
    let best = 0; for (const h of history || []) best = Math.max(best, similarity(text, h && h.text !== undefined ? h.text : h));
    return Math.round(best * 100) / 100;
  }
  function pushHistory(history, entry, keep) {
    const h = (history || []).concat([entry]);
    const n = Math.max(1, Number(keep) || 20);
    return h.slice(-n);
  }
  function cleanSeed(seed) { return String(seed || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, SEED_MAX); }
  /* -> messages[] for an OpenAI-compatible /chat/completions call */
  function buildMessages(o) {
    const pf = PLATFORMS[o.platform] || PLATFORMS.telegram;
    const seed = cleanSeed(o.seed);
    const hist = (o.history || []).slice(-12).map((h, i) => `${i + 1}. ${String(h && h.text !== undefined ? h.text : h).replace(/\s+/g, " ").slice(0, 220)}`);
    const sys = [
      `You write social media posts for ${pf.name}. Format: ${pf.style}.`,
      `Language: ${o.language || "Hinglish (Hindi in English letters)"}. Tone: ${o.tone || "friendly and useful"}.`,
      seed ? "Use ONLY the facts, products, links and style in the SEED document. Never invent prices, numbers, offers or links that are not in the seed." : "No seed document was given: write a useful general post on the topic.",
      "Every post must be NEW: a different angle, hook, example and wording from the earlier posts listed. Never repeat an earlier post.",
      o.platform === "youtube"
        ? 'Reply ONLY with JSON: {"title":"max 90 characters","description":"2-4 short paragraphs + 3-6 hashtags","tags":"comma, separated, tags"}'
        : "Reply with ONLY the post text — no quotes, no preface like 'Here is your post'.",
    ].join("\n");
    const user = [
      seed ? `SEED DOCUMENT (brand info, topics, style):\n"""\n${seed}\n"""` : "",
      o.topic ? `Today's topic / instruction: ${o.topic}` : "Pick a fresh topic from the seed that is NOT covered by the earlier posts.",
      hist.length ? `EARLIER POSTS (do not repeat these):\n${hist.join("\n")}` : "",
      o.avoid ? `Your last draft was too similar to an earlier post. Write something clearly different. Too-similar draft: ${String(o.avoid).slice(0, 300)}` : "",
      `Today is ${o.today || new Date().toISOString().slice(0, 10)}. Variation code: ${o.nonce || Math.random().toString(36).slice(2, 7)}.`,
    ].filter(Boolean).join("\n\n");
    return [{ role: "system", content: sys }, { role: "user", content: user }];
  }
  function stripFence(t) { return String(t || "").replace(/^\s*```(json|text)?\s*/i, "").replace(/```\s*$/, "").trim(); }
  /* AI answer -> { text, title?, description?, tags? } */
  function parseOutput(platform, raw) {
    let t = stripFence(raw);
    if (platform === "youtube") {
      let j = null;
      try { j = JSON.parse(t); } catch (_) { const m = t.match(/\{[\s\S]*\}/); if (m) { try { j = JSON.parse(m[0]); } catch (__) { /* */ } } }
      if (j && j.title) {
        const tags = Array.isArray(j.tags) ? j.tags.join(", ") : String(j.tags || "");
        return { title: String(j.title).slice(0, 100), description: String(j.description || "").slice(0, 4900), tags, text: `${j.title}\n\n${j.description || ""}`.trim() };
      }
      const first = t.split("\n")[0].slice(0, 100);
      return { title: first, description: t.slice(0, 4900), tags: "", text: t };
    }
    t = t.replace(/^(here('| i)s|sure[,!]?)[^\n]*\n+/i, "").replace(/^"([\s\S]*)"$/, "$1").trim();
    const lim = (PLATFORMS[platform] || PLATFORMS.telegram).limit;
    if (t.length > lim) t = t.slice(0, lim - 3).replace(/\s+\S*$/, "") + "...";
    return { text: t };
  }
  /* rotating media list: one URL / file path per line -> the next one each run */
  function pickMedia(list, index) {
    const items = String(list || "").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
    if (!items.length) return { media: "", index: 0, total: 0 };
    const i = ((Number(index) || 0) % items.length + items.length) % items.length;
    return { media: items[i], index: i, total: items.length };
  }
  return { PLATFORMS, similarity, maxSimilarity, pushHistory, buildMessages, parseOutput, pickMedia, cleanSeed, SEED_MAX, REPEAT_LIMIT: 0.6 };
});

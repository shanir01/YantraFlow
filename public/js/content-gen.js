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
    video: { name: "YouTube Shorts + Instagram Reels + Telegram", limit: 2200, style: "short vertical video post (title, caption, description, hashtags, first comment)" },
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
      o.greeting && o.platform !== "youtube" ? `It is ${o.greeting.slot} now (${o.greeting.hour}:00 India time). Start the post with a ${o.greeting.slot} greeting, for example "${o.greeting.line}" — you may vary the wording and emoji, but do NOT reuse the opening line of an earlier post. Make the content fit the time of day (${o.greeting.mood}).` : "",
      o.platform === "youtube"
        ? 'Reply ONLY with JSON: {"title":"max 90 characters","description":"2-4 short paragraphs + 3-6 hashtags","tags":"comma, separated, tags"}'
        : o.platform === "video"
          ? 'Reply ONLY with JSON: {"title":"catchy title, max 80 characters, no hashtags","caption":"2-4 short fun lines for Instagram Reels / Telegram (start with the time greeting if one is asked)","description":"2-3 short lines for YouTube Shorts","hashtags":"8-12 relevant hashtags incl. #shorts #reels","comment":"one friendly first comment / question that makes people reply"}'
          : "Reply with ONLY the post text — no quotes, no preface like 'Here is your post'.",
    ].filter(Boolean).join("\n");
    const user = [
      seed ? `SEED DOCUMENT (brand info, topics, style):\n"""\n${seed}\n"""` : "",
      o.topic ? `Today's topic / instruction: ${o.topic}` : "Pick a fresh topic from the seed that is NOT covered by the earlier posts.",
      hist.length ? `EARLIER POSTS (do not repeat these):\n${hist.join("\n")}` : "",
      o.avoid ? `Your last draft was too similar to an earlier post. Write something clearly different. Too-similar draft: ${String(o.avoid).slice(0, 300)}` : "",
      `Today is ${o.today || new Date().toISOString().slice(0, 10)}. Variation code: ${o.nonce || Math.random().toString(36).slice(2, 7)}.`,
    ].filter(Boolean).join("\n\n");
    return [{ role: "system", content: sys }, { role: "user", content: user }];
  }

  /* ---- Time greeting (Asia/Kolkata by default): Good Morning 5-12, Afternoon 12-17, Evening 17-21, Night 21-5 */
  const GREET = {
    morning: { label: "Good Morning", mood: "morning: fresh start, motivation, a tip to begin the day", words: ["good morning", "suprabhat", "rise and shine", "subah", "morning", "शुभ प्रभात", "सुप्रभात"],
      variants: ["Good Morning", "Suprabhat", "Good morning doston", "Rise and shine", "Subah ki shuruaat", "Morning vibes", "Namaste, good morning", "Good morning family"], emoji: ["\u2600\uFE0F", "\u{1F305}", "\u{1F31E}", "\u2615", "\u{1F304}"] },
    afternoon: { label: "Good Afternoon", mood: "afternoon: quick useful update, energy boost for the second half of the day", words: ["good afternoon", "afternoon", "dopahar", "lunch", "दोपहर"],
      variants: ["Good Afternoon", "Good afternoon doston", "Dopahar ki chai ke saath", "Afternoon update", "Lunch break vibes", "Namaste, good afternoon"], emoji: ["\u{1F324}\uFE0F", "\u2615", "\u{1F31E}", "\u{1F371}"] },
    evening: { label: "Good Evening", mood: "evening: relaxed, reflective, recap of the day or something to try tonight", words: ["good evening", "evening", "shaam", "sandhya", "शुभ संध्या", "शाम"],
      variants: ["Good Evening", "Shubh sandhya", "Good evening doston", "Shaam ki chai ke saath", "Evening vibes", "Namaste, good evening"], emoji: ["\u{1F307}", "\u{1F306}", "\u2615", "\u2728"] },
    night: { label: "Good Night", mood: "night: calm wrap-up of the day, a thought to sleep on, plan for tomorrow", words: ["good night", "night", "shubh ratri", "raat", "sone se pehle", "शुभ रात्रि", "रात"],
      variants: ["Good Night", "Shubh ratri", "Good night doston", "Raat ka wrap-up", "Sone se pehle ek baat", "Good night family"], emoji: ["\u{1F319}", "\u2728", "\u{1F30C}", "\u{1F31F}"] },
  };
  function hourIn(date, tz) {
    try { return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz || "Asia/Kolkata" }).format(date || new Date())) % 24; }
    catch (_) { const d = new Date((date || new Date()).getTime() + 330 * 60000); return d.getUTCHours(); }
  }
  function timeOfDay(date, tz) {
    const h = hourIn(date, tz);
    const slot = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night";
    return { slot, hour: h, label: GREET[slot].label, mood: GREET[slot].mood };
  }
  const opening = (t) => String(t && t.text !== undefined ? t.text : t || "").toLowerCase().slice(0, 60);
  /* a greeting (+ emoji) for this slot whose wording was not used to open the last posts */
  function pickGreeting(slot, history, seed) {
    const g = GREET[slot] || GREET.morning;
    const recent = (history || []).slice(-Math.max(2, g.variants.length - 1)).map(opening);
    const fresh = g.variants.filter((v) => !recent.some((o) => o.startsWith(v.toLowerCase())));
    const pool = fresh.length ? fresh : g.variants;
    const n = Math.abs(Number(seed) || Date.now()) ;
    const text = pool[n % pool.length];
    const emoji = g.emoji[(n + (history || []).length) % g.emoji.length];
    return { slot, text, emoji, line: `${text} ${emoji}` };
  }
  function hasGreeting(text, slot) {
    const head = String(text || "").toLowerCase().slice(0, 80);
    return (GREET[slot] || GREET.morning).words.some((w) => head.includes(w));
  }
  /* make sure the post opens with the right greeting (AI sometimes forgets) */
  function ensureGreeting(text, slot, greet) {
    const t = String(text || "").trim();
    if (!t || hasGreeting(t, slot)) return t;
    const g = greet || pickGreeting(slot, [], 0);
    return `${g.line}\n\n${t}`;
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
    if (platform === "video") {
      let j = null;
      try { j = JSON.parse(t); } catch (_) { const m = t.match(/\{[\s\S]*\}/); if (m) { try { j = JSON.parse(m[0]); } catch (__) { /* */ } } }
      if (!j || typeof j !== "object") j = { title: t.split("\n")[0], caption: t, description: t, hashtags: "", comment: "" };
      const tagList = (Array.isArray(j.hashtags) ? j.hashtags.join(" ") : String(j.hashtags || "")).split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : "#" + h)).slice(0, 15);
      const hashtags = tagList.join(" ");
      const title = String(j.title || "").replace(/#\S+/g, "").trim().slice(0, 100);
      const caption = String(j.caption || j.description || title).trim();
      return {
        title, caption, hashtags, comment: String(j.comment || "").trim().slice(0, 500),
        description: `${String(j.description || caption).trim()}${hashtags ? "\n\n" + hashtags : ""}`.slice(0, 4900),
        tags: tagList.map((h) => h.slice(1)).join(", "),
        text: `${caption}${hashtags ? "\n\n" + hashtags : ""}`.slice(0, 2200),
      };
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
  /* AI Chat / any message node: time greeting + "be unique" instructions (same rules as AI Post Writer) */
  function greetingFor(history, now) { const tod = timeOfDay(now || new Date(), "Asia/Kolkata"); return Object.assign(tod, pickGreeting(tod.slot, history || [], (now || new Date()).getTime ? (now || new Date()).getTime() : Date.now())); }
  function greetingSystem(g, history) {
    const hist = (history || []).slice(-8).map((h, i) => `${i + 1}. ${String(h && h.text !== undefined ? h.text : h).replace(/\s+/g, " ").slice(0, 160)}`);
    return [
      g ? `It is ${g.slot} now (${g.hour}:00 India time). Start the message with a ${g.slot} greeting, for example "${g.line}" (vary the wording, never reuse an earlier opening). Fit the content to the time of day (${g.mood}).` : "",
      "Every message must be NEW and different from the earlier ones (new idea, new words).",
      hist.length ? `Earlier messages (do not repeat):\n${hist.join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }
  return { greetingFor, greetingSystem, PLATFORMS, similarity, maxSimilarity, pushHistory, buildMessages, parseOutput, pickMedia, cleanSeed, SEED_MAX, REPEAT_LIMIT: 0.6, GREET, timeOfDay, pickGreeting, hasGreeting, ensureGreeting };
});

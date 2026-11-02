/* YantraFlow v4.4 — field help, AI provider presets and step-by-step guides (Roman Hinglish).
   Shared by browser and tests. Every link here was opened and checked on 2026-11-02. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFGuides = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- AI provider presets: pick one -> Base URL + recommended model fill by themselves
  const AI_PRESETS = [
    { id: "groq", name: "Groq (free, sabse fast)", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyUrl: "https://console.groq.com/keys", keyEg: "gsk_xxxxxxxxxxxxxxxx", note: "Free plan me kaafi requests milti hain. Card nahi chahiye." },
    { id: "gemini", name: "Google Gemini (free tier)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", keyUrl: "https://aistudio.google.com/apikey", keyEg: "AIzaSyxxxxxxxxxxxxxxxx", note: "Google account se login karke free key." },
    { id: "openrouter", name: "OpenRouter (bahut saare models)", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", keyUrl: "https://openrouter.ai/keys", keyEg: "sk-or-v1-xxxxxxxx", note: "Kuch models free (\":free\" wale), baaki paid credits se." },
    { id: "openai", name: "OpenAI (paid)", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyUrl: "https://platform.openai.com/api-keys", keyEg: "sk-proj-xxxxxxxx", note: "Paid — billing me credit daalna padta hai." },
    { id: "sangam", name: "SangamAI / FreeLLM-Router (apne PC pe)", baseUrl: "http://localhost:8787/v1", model: "auto", keyUrl: "https://sangamai.sites.tab.bot/", keyEg: "local", fixedKey: "local", note: "Sirf PC/Termux pe jahan router chal raha ho. Website (https) se localhost tak nahi pahunchta." },
  ];
  function preset(id) { return AI_PRESETS.find((p) => p.id === id) || null; }
  function detectPreset(baseUrl) {
    const b = String(baseUrl || "").trim().replace(/\/+$/, "").toLowerCase();
    if (!b) return null;
    return AI_PRESETS.find((p) => b === p.baseUrl.toLowerCase()) || AI_PRESETS.find((p) => { try { return new URL(b).hostname === new URL(p.baseUrl).hostname; } catch (_) { return false; } }) || null;
  }
  /* -> the values to write into the form. Key is only touched for the local router ("local"). */
  function presetFill(id) {
    const p = preset(id); if (!p) return null;
    const out = { baseUrl: p.baseUrl, model: p.model };
    if (p.fixedKey) out.apiKey = p.fixedKey;
    return out;
  }

  const L = (label, url) => ({ label, url });
  // ---------- one guide per connector (same ids as the Keys page sections)
  const GUIDES = {
    ai: {
      short: "AI key",
      title: "AI key (Groq / Gemini / OpenRouter / OpenAI / SangamAI)",
      what: "AI wale steps (post likhna, script, caption, project generator) isi key se chalte hain.",
      steps: [
        "Upar \"Provider chuno\" me Groq ya Gemini chuno (dono free) — Base URL aur Model apne aap bhar jayenge.",
        "Groq: console.groq.com/keys kholo → login → \"Create API Key\" → naam YantraFlow → key copy (gsk_… se shuru).",
        "Gemini: aistudio.google.com/apikey kholo → Google se login → \"Create API key\" → copy (AIza… se shuru).",
        "Key ko \"API key\" box me paste karo → Save → \"Test AI\" dabao. \"Works!\" aaye to ho gaya.",
      ],
      links: [L("Groq key banao", "https://console.groq.com/keys"), L("Gemini key banao", "https://aistudio.google.com/apikey"), L("OpenRouter key", "https://openrouter.ai/keys"), L("OpenAI key (paid)", "https://platform.openai.com/api-keys"), L("SangamAI (local router)", "https://sangamai.sites.tab.bot/")],
      errors: [
        ["401 / Invalid API Key", "Key galat copy hui ya delete ho gayi. Nayi key banao, aage-peeche space na ho."],
        ["404 / model not found / decommissioned", "Model box khaali chhod do (auto) ya provider dobara chuno — recommended model bhar jayega."],
        ["429 / rate limit", "Free limit khatam. 1 min ruko, ya dusra provider (Gemini/Groq) chuno."],
        ["Could not reach the AI / Failed to fetch", "Base URL galat hai, ya website pe localhost daala hai. Website pe Groq/Gemini use karo."],
      ],
      fields: {
        baseUrl: { what: "AI company ka address. Provider chuno to apne aap bharega.", eg: "https://api.groq.com/openai/v1" },
        apiKey: { what: "Tumhari secret AI key (sirf tumhare device pe save hoti hai).", eg: "gsk_xxxxxxxx (Groq) · AIza… (Gemini) · local (SangamAI)" },
        model: { what: "Kaunsa AI model. Khaali = provider ka recommended model.", eg: "openai/gpt-oss-120b (Groq) · gemini-3.8-flash (Gemini)" },
      },
    },
    telegram: {
      short: "Telegram bot",
      title: "Telegram bot",
      what: "Tumhara bot tumhare chat / group / channel me message, photo, video bhejta hai.",
      steps: [
        "Telegram me @BotFather kholo → /newbot → bot ka naam aur username (…bot pe khatam) do.",
        "BotFather ek token dega (123456789:AAH…) → copy → \"Bot token\" me paste.",
        "Chat ID: @userinfobot kholo → Start → wo tumhara \"Id\" number batayega → \"Chat ID\" me daalo.",
        "Apne naye bot ko ek baar \"Hi\" bhejo (warna bot tumhe message nahi kar sakta).",
        "Channel pe bhejna hai? Bot ko channel ka admin banao aur Chat ID me @channelname likho.",
        "Save → \"Test Telegram\" dabao — Telegram pe test message aayega.",
      ],
      links: [L("@BotFather (token)", "https://t.me/BotFather"), L("@userinfobot (chat id)", "https://t.me/userinfobot")],
      errors: [
        ["401 Unauthorized", "Token galat hai. BotFather → /mybots → bot → API Token se dobara copy karo."],
        ["400 chat not found", "Chat ID galat, ya tumne bot ko abhi tak \"Hi\" nahi bheja. Channel ho to bot ko admin banao."],
        ["403 bot was blocked by the user", "Tumne bot ko block kiya hai — bot kholo → Restart/Unblock."],
      ],
      fields: {
        botToken: { what: "@BotFather se mila bot token.", eg: "123456789:AAHxxxxxxxxxxxxxxxxxxxx" },
        chatId: { what: "Kis chat me bhejna hai — tumhara Id (@userinfobot) ya @channelname.", eg: "987654321 ya @mychannel" },
      },
    },
    instagram: {
      short: "Instagram",
      title: "Instagram (Graph API)",
      what: "Reels / photo apne aap Instagram pe post karne ke liye.",
      steps: [
        "Instagram app → Settings → Account type → Professional (Creator ya Business) banao.",
        "Ek Facebook Page banao aur Instagram ko us Page se link karo (Page settings → Linked accounts).",
        "developers.facebook.com/apps → Create app → \"Instagram\" use case add karo.",
        "Graph API Explorer me apni app chuno → permissions: instagram_basic, instagram_content_publish, pages_show_list → Generate token.",
        "Token ko long-lived (60 din) banao (Access Token Debugger → Extend) → \"Access token\" me paste.",
        "Explorer me GET me/accounts?fields=instagram_business_account chalao → jo id aaye wo \"Instagram user ID\" (1784… se shuru).",
      ],
      links: [L("Meta developer apps", "https://developers.facebook.com/apps/"), L("Graph API Explorer", "https://developers.facebook.com/tools/explorer/")],
      errors: [
        ["(#10) / permission error", "Token me instagram_content_publish permission nahi hai — naya token banao."],
        ["Media URL / could not fetch", "Photo/video ka link public hona chahiye. Google Drive / localhost link nahi chalega."],
        ["Token expired (190)", "Token 60 din me khatam hota hai — naya long-lived token banao."],
      ],
      fields: {
        userId: { what: "Instagram Business account ki ID (username nahi).", eg: "17841400000000000" },
        accessToken: { what: "Meta Graph API ka long-lived token.", eg: "EAAGxxxxxxxx…" },
      },
    },
    facebook: {
      short: "Facebook Page",
      title: "Facebook Page",
      what: "Facebook Page pe text / photo post.",
      steps: [
        "developers.facebook.com/apps → Create app.",
        "Graph API Explorer → app chuno → \"Get Page Access Token\" → permission pages_manage_posts, pages_read_engagement.",
        "Apna Page chuno → token copy → \"Page access token\" me paste.",
        "Page ID: Page → About → Page transparency (ya Explorer me GET me/accounts) → number copy.",
      ],
      links: [L("Graph API Explorer", "https://developers.facebook.com/tools/explorer/"), L("Meta developer apps", "https://developers.facebook.com/apps/")],
      errors: [["(#200) permission", "Token Page ka hona chahiye (User token nahi) aur pages_manage_posts zaroori hai."], ["Token expired", "Naya token banao ya long-lived banao."]],
      fields: { pageId: { what: "Facebook Page ka number ID.", eg: "102345678901234" }, pageToken: { what: "Page access token (pages_manage_posts ke saath).", eg: "EAAGxxxxxxxx…" } },
    },
    youtube: {
      short: "YouTube",
      title: "YouTube upload",
      what: "Video apne aap YouTube (Shorts) pe upload karne ke liye.",
      steps: [
        "console.cloud.google.com → naya project → \"YouTube Data API v3\" Enable karo.",
        "APIs & Services → OAuth consent screen → External → apna email test user me daalo.",
        "Credentials → Create credentials → OAuth client ID → Web application → Redirect URI: https://developers.google.com/oauthplayground → Client ID + Secret copy.",
        "developers.google.com/oauthplayground → settings (gear) → \"Use your own OAuth credentials\" → ID/Secret daalo.",
        "Scope likho: https://www.googleapis.com/auth/youtube.upload → Authorize → apna channel chuno → \"Exchange authorization code\" → Refresh token copy.",
        "Teeno (Client ID, Secret, Refresh token) Keys page pe YouTube me paste → Save.",
      ],
      links: [L("YouTube Data API enable", "https://console.cloud.google.com/apis/library/youtube.googleapis.com"), L("Google credentials", "https://console.cloud.google.com/apis/credentials"), L("OAuth Playground", "https://developers.google.com/oauthplayground/")],
      errors: [
        ["invalid_grant", "Refresh token expire/revoke ho gaya (Testing mode me 7 din). Playground se naya banao, ya app ko Publish karo."],
        ["quotaExceeded", "Free quota ≈ 6 upload/din. Kal tak ruko."],
        ["redirect_uri_mismatch", "OAuth client me redirect URI exactly https://developers.google.com/oauthplayground daalo."],
      ],
      fields: { clientId: { what: "Google OAuth client ID.", eg: "1234-abc.apps.googleusercontent.com" }, clientSecret: { what: "Google OAuth client secret.", eg: "GOCSPX-xxxxxxxx" }, refreshToken: { what: "OAuth Playground se mila refresh token (youtube.upload scope).", eg: "1//0gxxxxxxxx" } },
    },
    x: {
      short: "X / Twitter",
      title: "X / Twitter",
      what: "X pe post (sirf PC/Termux se).",
      steps: [
        "developer.x.com → login → Developer portal → Projects & Apps → apni app.",
        "User authentication settings → App permissions: Read and write → Save.",
        "Keys and tokens → API Key + Secret aur Access Token + Secret generate → copy.",
        "Dhyan: X API se post karna ab paid hai — free account pe post fail ho sakta hai.",
      ],
      links: [L("X developer portal", "https://developer.x.com/en/portal/dashboard")],
      errors: [["403 / not permitted", "App permission Read and write nahi hai ya plan me posting allowed nahi. Permission badal ke tokens dobara banao."], ["401", "Chaaron keys dobara copy karo (permission badalne ke baad naye tokens chahiye)."]],
      fields: { apiKey: { what: "Consumer API key.", eg: "xxxxxxxxxxxxxxxxxxxxxxxxx" }, apiSecret: { what: "Consumer API key secret.", eg: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }, accessToken: { what: "Access token (Read and write).", eg: "1234567890-xxxxxxxx" }, accessSecret: { what: "Access token secret.", eg: "xxxxxxxxxxxxxxxx" } },
    },
    linkedin: {
      short: "LinkedIn",
      title: "LinkedIn",
      what: "LinkedIn profile pe post (sirf PC/Termux se).",
      steps: [
        "linkedin.com/developers/apps → Create app (ek Company Page chahiye, apna bana sakte ho).",
        "Products tab → \"Share on LinkedIn\" + \"Sign In with LinkedIn using OpenID Connect\" add karo.",
        "linkedin.com/developers/tools/oauth (OAuth token tool) → app chuno → scopes w_member_social openid profile → token banao.",
        "Token \"Access token\" me paste. Author URN khaali chhod do (auto). Token ~60 din chalta hai.",
      ],
      links: [L("LinkedIn apps", "https://www.linkedin.com/developers/apps"), L("OAuth token tool", "https://www.linkedin.com/developers/tools/oauth")],
      errors: [["401 / expired", "60 din baad token khatam — naya banao."], ["403 / ACCESS_DENIED", "\"Share on LinkedIn\" product add nahi hai ya w_member_social scope missing."]],
      fields: { accessToken: { what: "LinkedIn OAuth token (w_member_social).", eg: "AQXxxxxxxxx…" }, authorUrn: { what: "Khaali chhodo — apne aap mil jayega.", eg: "urn:li:person:AbC123" }, version: { what: "LinkedIn API version (YYYYMM). Khaali = default.", eg: "202610" } },
    },
    pexels: {
      short: "Pexels",
      title: "Pexels (free photo + video)",
      what: "Video Maker / Photo Maker ke background aur Funny Video project ke free-licence clips.",
      steps: [
        "pexels.com/api kholo → \"Get Started\" / \"Your API Key\" → login ya free account.",
        "App ka naam: YantraFlow, use: personal automation → submit.",
        "API key copy → Keys page → Pexels → paste → Save.",
      ],
      links: [L("Pexels API key", "https://www.pexels.com/api/")],
      errors: [["401 / unauthorized", "Key galat copy hui. Pexels → Your API key se dobara copy."], ["429", "Free limit: 200/ghanta. Thoda ruko."]],
      fields: { apiKey: { what: "Pexels se mili free API key.", eg: "563492ad6f91700001000001xxxxxxxx" } },
    },
    pixabay: {
      short: "Pixabay",
      title: "Pixabay (free photo + video)",
      what: "Pexels ki jagah ya saath me — free-licence photos / clips.",
      steps: [
        "pixabay.com pe free account banao / login.",
        "pixabay.com/api/docs kholo → \"Parameters\" me key=… ke saamne tumhari key dikhegi → copy.",
        "Keys page → Pixabay → paste → Save.",
      ],
      links: [L("Pixabay API docs (key yahin)", "https://pixabay.com/api/docs/")],
      errors: [["[ERROR 400] Invalid or missing API key", "Login karke docs page dobara kholo, key wahin se copy karo."], ["429", "100 request/minute limit — ruko."]],
      fields: { apiKey: { what: "Pixabay API key (docs page pe login ke baad).", eg: "12345678-abcdef0123456789abcdef012" } },
    },
    linkpreview: {
      short: "Link preview",
      title: "Link preview (sirf website)",
      what: "Website pe link ka title/photo padhne ke liye. Khaali = free public service.",
      steps: ["Kuch mat daalo — free service (microlink.io, ~50 links/din) chalega.", "Zyada chahiye to README → Link preview proxy se apna Supabase function banao aur uska URL yahan daalo.", "PC/Termux version ko iski zaroorat nahi."],
      links: [L("Microlink (free service)", "https://microlink.io/")],
      errors: [["429 / limit", "Aaj ki free limit khatam — kal, ya apna proxy URL daalo, ya PC/Termux se chalao."]],
      fields: { proxyUrl: { what: "Tumhara apna preview proxy (optional).", eg: "https://<project>.supabase.co/functions/v1/link-preview" } },
    },
    smtp: {
      short: "Email (Gmail)",
      title: "Email (Gmail SMTP)",
      what: "Email bhejne ke liye (sirf PC/Termux se).",
      steps: [
        "Google account me 2-Step Verification ON karo.",
        "myaccount.google.com/apppasswords kholo → naam YantraFlow → 16 letter ka App password copy.",
        "Host smtp.gmail.com, Port 465, Username = tumhara Gmail, Password = App password → Save.",
      ],
      links: [L("Gmail App passwords", "https://myaccount.google.com/apppasswords")],
      errors: [["535 Username and Password not accepted", "Normal Gmail password nahi chalega — App password use karo."], ["ETIMEDOUT", "Port 465 + host smtp.gmail.com check karo; kuch Wi-Fi SMTP block karte hain."]],
      fields: { host: { what: "SMTP server.", eg: "smtp.gmail.com" }, port: { what: "Port (Gmail: 465).", eg: "465" }, user: { what: "Tumhara email.", eg: "me@gmail.com" }, pass: { what: "Gmail App password (16 letter).", eg: "abcd efgh ijkl mnop" }, from: { what: "Bhejne wale ka naam (optional).", eg: "Nishu <me@gmail.com>" } },
    },
    discord: {
      short: "Discord",
      title: "Discord webhook",
      what: "Discord channel me message.",
      steps: ["Discord channel → Edit Channel (gear) → Integrations → Webhooks → New Webhook.", "Naam do → \"Copy Webhook URL\" → yahan paste → Save."],
      links: [],
      errors: [["404 Unknown Webhook", "Webhook delete ho gaya — naya banao."]],
      fields: { webhookUrl: { what: "Discord webhook URL.", eg: "https://discord.com/api/webhooks/123/abc" } },
    },
    slack: {
      short: "Slack",
      title: "Slack webhook",
      what: "Slack channel me message.",
      steps: ["api.slack.com/apps → Create New App → From scratch.", "Incoming Webhooks → ON → \"Add New Webhook to Workspace\" → channel chuno.", "Webhook URL copy → yahan paste → Save."],
      links: [L("Slack apps", "https://api.slack.com/apps")],
      errors: [["invalid_token / no_service", "Webhook hata diya gaya — naya banao."]],
      fields: { webhookUrl: { what: "Slack incoming webhook URL.", eg: "https://hooks.slack.com/services/T000/B000/XXXX" } },
    },
  };

  // ---------- node field -> connector field (so the editor shows the same help + guide)
  const NODE_FIELDS = {
    "aiChat.baseUrl": "ai.baseUrl", "aiChat.apiKey": "ai.apiKey", "aiChat.model": "ai.model",
    "aiPost.baseUrl": "ai.baseUrl", "aiPost.apiKey": "ai.apiKey", "aiPost.model": "ai.model",
    "videoEdit.baseUrl": "ai.baseUrl", "videoEdit.apiKey": "ai.apiKey", "videoEdit.model": "ai.model",
    "telegram.botToken": "telegram.botToken", "telegram.chatId": "telegram.chatId",
    "instagram.userId": "instagram.userId", "instagram.accessToken": "instagram.accessToken",
    "facebook.pageId": "facebook.pageId", "facebook.pageToken": "facebook.pageToken",
    "stockVideo.pexelsKey": "pexels.apiKey", "stockVideo.pixabayKey": "pixabay.apiKey",
    "videoMaker.pexelsKey": "pexels.apiKey", "videoMaker.pixabayKey": "pixabay.apiKey",
    "imageMaker.pexelsKey": "pexels.apiKey", "imageMaker.pixabayKey": "pixabay.apiKey",
    "discord.webhookUrl": "discord.webhookUrl", "slack.webhookUrl": "slack.webhookUrl",
  };
  const NODE_SECTIONS = {
    aiChat: ["ai"], aiPost: ["ai"], videoEdit: ["ai?"], videoMaker: ["ai?", "pexels?"], imageMaker: ["pexels?"], stockVideo: ["pexels|pixabay"],
    telegram: ["telegram"], instagram: ["instagram"], facebook: ["facebook"], youtube: ["youtube"], xPost: ["x"], linkedinPost: ["linkedin"],
    email: ["smtp"], discord: ["discord"], slack: ["slack"], linkPreview: ["linkpreview?"],
  };
  function fieldInfo(nodeType, key) {
    const ref = NODE_FIELDS[nodeType + "." + key]; if (!ref) return null;
    const [sec, field] = ref.split(".");
    const g = GUIDES[sec]; const f = g && g.fields[field]; if (!f) return null;
    return { sec, field, what: f.what, eg: f.eg, title: g.title, preset: sec === "ai" && field === "baseUrl" };
  }
  /* which connectors a workflow needs -> [{ sec, title, optional, any? }] */
  function needs(wf) {
    const out = new Map();
    for (const n of (wf && wf.nodes) || []) {
      if (n.disabled) continue;
      for (const raw of NODE_SECTIONS[n.type] || []) {
        const optional = raw.endsWith("?"); const ids = raw.replace("?", "").split("|");
        const sec = ids[0]; const prev = out.get(sec);
        if (!prev || (prev.optional && !optional)) out.set(sec, { sec, alt: ids.slice(1), title: GUIDES[sec].short || GUIDES[sec].title, optional });
      }
    }
    return [...out.values()];
  }
  /* creds = raw (or masked) Keys-page values -> needs() with filled flags */
  function missing(wf, creds) {
    const filled = (sec) => Object.values((creds || {})[sec] || {}).some((v) => String(v || "").trim());
    // a node's own field also counts (e.g. bot token typed inside the node)
    const ownFilled = (sec) => ((wf && wf.nodes) || []).some((n) => !n.disabled && Object.keys(n.params || {}).some((k) => { const r = NODE_FIELDS[n.type + "." + k]; return r && r.startsWith(sec + ".") && String(n.params[k] || "").trim() && !/\{\{/.test(String(n.params[k])); }));
    return needs(wf).map((x) => Object.assign({}, x, { ok: filled(x.sec) || x.alt.some(filled) || ownFilled(x.sec) || (x.sec === "linkpreview") }));
  }
  const COMMON_ERRORS = [
    ["Run dabaya, kuch nahi hua", "Runs page kholo — har step ka status aur error wahan dikhta hai."],
    ["Schedule nahi chala", "Website pe schedule tab khula hone par hi chalta hai. 24x7 ke liye PC/Termux pe chalao."],
    ["{{ $json.x }} khaali aaya", "Pichhla step wo field nahi de raha — ek baar Run karke node kholo, fields ke chips se sahi naam chuno."],
  ];
  /* project -> full guide */
  function projectGuide(p) {
    const wf = p.workflow || { nodes: [] };
    const keys = needs(wf);
    const steps = [];
    keys.filter((k) => !k.optional).forEach((k) => steps.push(`Keys page → ${k.title} bharo (neeche "Kahan milega?" guide).`));
    (p.howTo || []).forEach((s) => steps.push(s));
    if (!steps.length) steps.push("\"Use this project\" dabao → Run.");
    const errors = [];
    keys.forEach((k) => (GUIDES[k.sec].errors || []).slice(0, 2).forEach((e) => errors.push([`${GUIDES[k.sec].short}: ${e[0]}`, e[1]])));
    COMMON_ERRORS.forEach((e) => errors.push(e));
    return { what: p.summary || p.description || "", keys, steps, errors };
  }

  // ---------- closable tips / banners (remembered per banner)
  const TIPS_KEY = "yf_tips_closed";
  const TIP_IDS = ["web-version", "premium", "schedule-web", "schedule-pc", "setup-pending", "keys-safety", "honest-video"];
  function readClosed(store) { try { const v = JSON.parse((store && store.getItem(TIPS_KEY)) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  const Tips = {
    KEY: TIPS_KEY, IDS: TIP_IDS,
    isClosed(store, id) { return readClosed(store).includes(id); },
    close(store, id) { const v = readClosed(store); if (!v.includes(id)) v.push(id); try { store.setItem(TIPS_KEY, JSON.stringify(v)); } catch (_) { /* */ } return v; },
    reset(store) { try { store.setItem(TIPS_KEY, "[]"); store.removeItem && store.removeItem("yf_prem_note_x"); } catch (_) { /* */ } return []; },
    closedList: readClosed,
  };

  return { AI_PRESETS, preset, detectPreset, presetFill, GUIDES, NODE_FIELDS, NODE_SECTIONS, fieldInfo, needs, missing, projectGuide, COMMON_ERRORS, Tips };
});

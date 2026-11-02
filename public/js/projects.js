/* YantraFlow PUBLIC PROJECTS — ready-made automations.
   Each project has a tier/price so some can be marked paid later.
   Right now EVERY project is FREE (tier: "free", price: 0).
   runsIn: "web"  = runs right here on the website
           "key"  = runs here, but needs YOUR OWN paid / free-trial API key from a provider
           "full" = needs the full version (PC / Termux) for 24x7 or local-file steps
           "setup"= runs, but needs a developer app / OAuth token from the platform first */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YF_PROJECTS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const AI = (system, prompt, extra) => Object.assign({ system, prompt, model: "", temperature: 0.8, maxTokens: 700, baseUrl: "", apiKey: "" }, extra || {});
  // linear flow builder: nodes [type, name, params, extra?] -> workflow
  function flow(name, description, list) {
    const nodes = list.map(([type, nm, params, extra], i) => Object.assign({ id: "n" + (i + 1), type, name: nm, params, position: [40 + i * 270, 140 + (i % 2) * 40] }, extra || {}));
    const connections = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, fromOutput: 0, to: n.id }));
    return { name, description, active: false, nodes, connections };
  }
  const tgText = (text, extra) => ["telegram", "Send to my Telegram", { operation: "text", text, media: "", chatId: "", parseMode: "none", botToken: "" }, extra];
  const tgOptional = (text) => tgText(text, { disabled: true });
  const parseJson = `// AI ne JSON diya — use saaf fields me badlo
return items.map((it) => {
  const raw = String(it.text || "").replace(/^\\s*\`\`\`(json)?/i, "").replace(/\`\`\`\\s*$/, "").trim();
  try { return Object.assign({}, it, JSON.parse(raw)); } catch (e) { return it; }
});`;

  const P = [
    {
      id: "viral-script", icon: "🧠", categories: ["AI Content", "Instagram", "YouTube"],
      title: "AI viral script generator", title_hi: "AI viral script generator",
      summary: "Topic do → AI hook, full script, caption aur hashtags bana deta hai (Reels / Shorts).",
      runsIn: "web", needs: ["AI key (Groq / OpenRouter free) on Keys page"],
      howTo: ["Keys page pe AI Base URL + key daalo", "Start node me topic badlo", "▶ Run dabao — result 'Show result' node me"],
      workflow: flow("AI viral script generator", "Topic → hook, script, caption, hashtags", [
        ["manualTrigger", "Start (your topic)", { testData: JSON.stringify({ topic: "3 free AI tools every student must know", platform: "Instagram Reel", language: "Hinglish", duration: "30 seconds" }, null, 2) }],
        ["aiChat", "AI viral script", AI("You are a viral short-video scriptwriter. Reply ONLY with JSON: {\"hook\":\"...\",\"script\":\"line by line script\",\"caption\":\"...\",\"hashtags\":\"#tag1 #tag2 ...\",\"cta\":\"...\"}",
          "Topic: {{ $json.topic }}\nPlatform: {{ $json.platform }}\nLanguage: {{ $json.language }}\nLength: {{ $json.duration }}\n\nWrite a scroll-stopping hook for the first 2 seconds, a tight script, a caption and 15 hashtags.", { temperature: 0.9, maxTokens: 900 })],
        ["code", "Clean the result", { code: parseJson }],
        ["log", "Show result", { message: "🎬 HOOK: {{ $json.hook }}\n\n📝 SCRIPT:\n{{ $json.script }}\n\n💬 CAPTION: {{ $json.caption }}\n{{ $json.hashtags }}\n\n👉 CTA: {{ $json.cta }}" }],
        tgOptional("🎬 {{ $json.hook }}\n\n{{ $json.script }}\n\n{{ $json.caption }}\n{{ $json.hashtags }}"),
      ]),
    },
    {
      id: "viral-analyser", icon: "🔍", categories: ["Video", "YouTube", "Instagram", "AI Content"],
      title: "Viral video analyser", title_hi: "Viral video analyser",
      summary: "Viral video ka title, description, views aur transcript paste karo → AI batata hai kyun viral hua aur tum kaise remake karo.",
      runsIn: "web", needs: ["AI key on Keys page", "Video ka title/description/transcript (copy-paste)"],
      honest: "AI video ko dekh nahi sakta — ye sirf text analyse karta hai (title, description, numbers, transcript/captions). Jitna zyada text doge, utna accha analysis.",
      howTo: ["Start node me video ka link, title, description, views aur transcript paste karo", "▶ Run", "Result me: viral kyun hua + remake plan + naya hook"],
      workflow: flow("Viral video analyser", "Why it went viral + how to remake it (text-based)", [
        ["manualTrigger", "Start (paste video details)", { testData: JSON.stringify({ link: "https://youtube.com/shorts/XXXXXXXX", title: "I tried 5 AI tools so you don't have to 😱", description: "Best free AI tools for students in 2026...", views: "2.3M", likes: "180K", comments: "3.1K", posted: "3 days ago", transcript: "Paste the captions / transcript here. Ex: 'Ruko! Ye 5 AI tools tumhara homework 10 minute me kar denge...'" }, null, 2) }],
        ["aiChat", "AI viral analysis", AI("You are a short-form content strategist. You can NOT watch videos — you only see the text the user gives (title, description, numbers, transcript). If something can't be judged from text (visuals, editing, thumbnail), say so briefly. Answer in Hinglish with clear headings.",
          "Video link: {{ $json.link }}\nTitle: {{ $json.title }}\nDescription: {{ $json.description }}\nViews: {{ $json.views }} | Likes: {{ $json.likes }} | Comments: {{ $json.comments }} | Posted: {{ $json.posted }}\nTranscript:\n{{ $json.transcript }}\n\n1) Why did this go viral? (hook, emotion, topic, title, pacing, CTA) — give a virality score /10.\n2) What can't be judged from text alone.\n3) How to REMAKE it for my channel: 5 steps.\n4) 3 new hooks + 3 new titles I can use.", { temperature: 0.6, maxTokens: 1200 })],
        ["log", "Show analysis", { message: "{{ $json.text }}" }],
        tgOptional("🔍 Viral analysis\n\n{{ $json.text }}"),
      ]),
    },
    {
      id: "profile-optimiser", icon: "✨", categories: ["Instagram", "YouTube", "AI Content"],
      title: "Profile optimiser (normal → unique profile)", title_hi: "Profile optimiser",
      summary: "AI tumhari profile ko unique banata hai: name/username ideas, 3 bio options, highlights, content pillars, posting plan.",
      runsIn: "web", needs: ["AI key on Keys page"],
      honest: "Ye suggestions likhta hai — profile me change tum khud apply karte ho (Instagram/YouTube profile edit karne ka public API nahi hai).",
      howTo: ["Start node me platform, niche, abhi ka bio, audience likho", "▶ Run", "Jo pasand aaye, profile me copy-paste karo"],
      workflow: flow("Profile optimiser", "Unique name, bio, highlights and content pillars", [
        ["manualTrigger", "Start (your profile)", { testData: JSON.stringify({ platform: "Instagram", name: "Nishu", niche: "AI tools & tech tips in Hinglish", current_bio: "Tech lover | Coder", audience: "Indian students 16-25", goal: "grow followers and sell my AI guide" }, null, 2) }],
        ["aiChat", "AI profile makeover", AI("You are a top social-media brand strategist. Make normal profiles unique and memorable. Answer in Hinglish with headings and short bullet points.",
          "Platform: {{ $json.platform }}\nName: {{ $json.name }}\nNiche: {{ $json.niche }}\nCurrent bio: {{ $json.current_bio }}\nAudience: {{ $json.audience }}\nGoal: {{ $json.goal }}\n\nGive me: 5 unique name/username ideas; 3 bios under 150 characters (with emojis); 5 highlight cover ideas; 4 content pillars; 3 pinned-post ideas; a weekly posting schedule; 1 profile-photo tip.", { maxTokens: 1100 })],
        ["log", "Show makeover", { message: "{{ $json.text }}" }],
        tgOptional("✨ Profile makeover\n\n{{ $json.text }}"),
      ]),
    },
    {
      id: "youtube-seo", icon: "🏷️", categories: ["YouTube", "AI Content"],
      title: "YouTube title, description & tags (AI SEO)", title_hi: "YouTube SEO generator",
      summary: "Video kis baare me hai likho → 5 click-worthy titles, SEO description, 25 tags, thumbnail text, pinned comment.",
      runsIn: "web", needs: ["AI key on Keys page"],
      howTo: ["Start node me video topic + keywords", "▶ Run", "Upload karte waqt copy karo"],
      workflow: flow("YouTube SEO generator", "Titles, description, tags, thumbnail text", [
        ["manualTrigger", "Start (video details)", { testData: JSON.stringify({ video_about: "How to make an n8n-style automation on your phone for free", keywords: "automation, termux, free tools, AI", language: "Hinglish" }, null, 2) }],
        ["aiChat", "AI YouTube SEO", AI("You are a YouTube SEO expert. Use clear headings.", "Video: {{ $json.video_about }}\nKeywords: {{ $json.keywords }}\nLanguage: {{ $json.language }}\n\nGive: 5 titles (under 70 characters), a description (first 2 lines hook, then details, chapters placeholder, 5 hashtags), 25 comma-separated tags, 3 thumbnail text ideas (max 4 words), 1 pinned comment.", { maxTokens: 1000 })],
        ["log", "Show SEO pack", { message: "{{ $json.text }}" }],
      ]),
    },
    {
      id: "content-calendar", icon: "🗓️", categories: ["AI Content", "Instagram", "YouTube"],
      title: "Weekly content calendar generator", title_hi: "Weekly content calendar",
      summary: "Niche batao → 7 din ka plan: har din ka topic, format, hook, caption idea aur best time.",
      runsIn: "web", needs: ["AI key on Keys page", "(optional) Telegram bot"],
      howTo: ["Start node me niche, platform, posts per week", "▶ Run", "Telegram node ON karo to calendar Telegram pe aayega"],
      workflow: flow("Weekly content calendar", "7-day plan with topics, hooks and timings", [
        ["manualTrigger", "Start (your niche)", { testData: JSON.stringify({ niche: "AI tools & coding tips", platform: "Instagram Reels + YouTube Shorts", posts_per_week: 5, language: "Hinglish" }, null, 2) }],
        ["aiChat", "AI content calendar", AI("You plan viral content calendars. Output a clean day-by-day list (Mon to Sun) — no tables.", "Niche: {{ $json.niche }}\nPlatform: {{ $json.platform }}\nPosts per week: {{ $json.posts_per_week }}\nLanguage: {{ $json.language }}\n\nFor each posting day give: topic, format (talking head / screen record / meme / carousel), hook line, caption idea, best time to post (IST). Add 1 trend idea and 1 collab idea for the week.", { maxTokens: 1200 })],
        ["log", "Show calendar", { message: "{{ $json.text }}" }],
        tgOptional("🗓️ This week's content plan\n\n{{ $json.text }}"),
      ]),
    },
    {
      id: "comment-dm", icon: "💬", categories: ["Instagram", "AI Content"],
      title: "Comment keyword → auto DM text generator", title_hi: "Comment keyword → DM text",
      summary: "Jo log 'GUIDE' jaisa keyword comment karein, unke liye AI personal DM message likhta hai.",
      runsIn: "web", needs: ["AI key on Keys page", "Comments list (paste ya HTTP se laao)"],
      honest: "Ye DM ka TEXT banata hai. Instagram pe DM khud-ba-khud bhejne ke liye Meta ka Instagram Messaging API (business account + app review) chahiye — wo is project me nahi hai.",
      howTo: ["Start node me keyword, offer link aur comments paste karo", "▶ Run", "Har matching comment ke liye ek DM ready"],
      workflow: flow("Comment keyword → DM text", "Find keyword comments and write a personal DM for each", [
        ["manualTrigger", "Start (comments)", { testData: JSON.stringify({ keyword: "GUIDE", offer: "Free AI tools guide: https://your-link.com/guide", comments: [{ user: "rahul_21", text: "GUIDE please bhai" }, { user: "priya.codes", text: "nice video 🔥" }, { user: "aman.k", text: "guide bhejo" }] }, null, 2) }],
        ["code", "Find keyword comments", { code: "// har comment jisme keyword hai, ek alag item\nconst it = items[0] || {};\nconst kw = String(it.keyword || \"\").toLowerCase();\nreturn (it.comments || [])\n  .filter((c) => String(c.text || \"\").toLowerCase().includes(kw))\n  .map((c) => ({ user: c.user, comment: c.text, offer: it.offer }));" }],
        ["aiChat", "AI writes DM", AI("You write short, friendly Instagram DMs in Hinglish: 2-3 lines, 1 emoji, no spam words.", "Write a DM to @{{ $json.user }} who commented: \"{{ $json.comment }}\". Give them this: {{ $json.offer }}", { maxTokens: 160 })],
        ["log", "DM ready", { message: "@{{ $json.user }} → {{ $json.text }}" }],
      ]),
    },
    {
      id: "telegram-daily-post", icon: "📣", categories: ["Telegram", "AI Content"],
      title: "Telegram channel daily post (AI)", title_hi: "Telegram channel daily post",
      summary: "Roz 9 baje AI tumhare topic pe naya post likh ke Telegram channel pe daal deta hai.",
      runsIn: "web", needs: ["AI key", "Telegram bot token + @channel (bot ko channel admin banao)"],
      honest: "Website pe schedule tabhi chalta hai jab tab khula ho. 24×7 ke liye full version (PC/Termux).",
      howTo: ["Keys page: AI + Telegram", "'Your topic' node me topic badlo", "▶ Run test, phir Active ON"],
      workflow: flow("Telegram channel daily post", "Every day 9 AM: AI post → Telegram channel", [
        ["scheduleTrigger", "Every day 9 AM", { mode: "cron", cron: "0 9 * * *", minutes: 60 }],
        ["set", "Your topic", { fields: "topic = AI tools & tech tips for students\nstyle = Hinglish, 4-6 lines, 2 emojis, end with a question", keepOld: true }],
        ["aiChat", "AI writes post", AI("You write engaging Telegram channel posts.", "Date: {{ $today }}\nTopic: {{ $json.topic }}\nStyle: {{ $json.style }}\nWrite today's post (fresh idea, no repeats).", { temperature: 0.9, maxTokens: 400 })],
        tgText("{{ $json.text }}"),
      ]),
    },
    {
      id: "trending-news-post", icon: "🔥", categories: ["AI Content", "Telegram"],
      title: "Trending news → AI post", title_hi: "Trending news → AI post",
      summary: "Top trending news uthata hai, AI usse Insta/X ready post (caption + hashtags) bana ke Telegram pe bhejta hai.",
      runsIn: "full", needs: ["AI key", "Telegram bot"],
      honest: "Bahut si news sites browser se feed padhne nahi deti (CORS) — website pe fail ho sakta hai. Full version (PC/Termux) me har feed chalta hai.",
      howTo: ["Keys page: AI + Telegram", "RSS node me apni feed (Google News default)", "▶ Run / Active"],
      workflow: flow("Trending news → AI post", "Top news → AI caption + hashtags → Telegram", [
        ["scheduleTrigger", "Every day 10 AM", { mode: "cron", cron: "0 10 * * *", minutes: 60 }],
        ["rss", "Trending news", { url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", max: 3 }],
        ["aiChat", "AI makes post", AI("You turn news into viral social posts in Hinglish: hook line, 3 short lines, 8 hashtags. No fake facts — only what the headline says.", "Headline: {{ $json.title }}\nDetails: {{ $json.contentSnippet }}", { maxTokens: 300 })],
        tgText("🔥 {{ $json.title }}\n\n{{ $json.text }}\n\n🔗 {{ $json.link }}"),
      ]),
    },
    {
      id: "gmail-summary", icon: "📬", categories: ["Gmail", "Telegram"],
      title: "Gmail daily inbox summary → Telegram", title_hi: "Gmail inbox summary → Telegram",
      summary: "Raat 9 baje aaj ke unread mails padh ke AI 8 point me summary Telegram pe bhejta hai.",
      runsIn: "setup", needs: ["Google OAuth access token (scope gmail.readonly)", "AI key", "Telegram bot"],
      honest: "Gmail ke liye tumhara apna Google OAuth token chahiye (Google OAuth Playground se, scope gmail.readonly). Ye token 1 ghante me expire hota hai — abhi har run se pehle naya token paste karna padega. Auto-refresh wala 24×7 version abhi nahi bana.",
      howTo: ["developers.google.com/oauthplayground → Gmail API v1 → gmail.readonly → token copy", "'Gmail token' node me paste karo", "▶ Run"],
      workflow: flow("Gmail inbox summary → Telegram", "Unread mails today → AI summary → Telegram", [
        ["scheduleTrigger", "Every day 9 PM", { mode: "cron", cron: "0 21 * * *", minutes: 60 }],
        ["set", "Gmail token", { fields: "googleToken = PASTE_YOUR_GOOGLE_ACCESS_TOKEN", keepOld: false }],
        ["httpRequest", "List unread mails", { method: "GET", url: "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:unread%20newer_than:1d", headers: "Authorization: Bearer {{ $json.googleToken }}", body: "" }],
        ["code", "Read mail details", { code: "// har mail ka From, Subject, snippet laao\nconst token = $node[\"Gmail token\"].json.googleToken;\nconst list = (items[0] && items[0].data && items[0].data.messages) || [];\nconst lines = [];\nfor (const m of list) {\n  const r = await fetch(\"https://gmail.googleapis.com/gmail/v1/users/me/messages/\" + m.id + \"?format=metadata&metadataHeaders=From&metadataHeaders=Subject\", { headers: { Authorization: \"Bearer \" + token } });\n  const d = await r.json();\n  const h = Object.fromEntries(((d.payload && d.payload.headers) || []).map((x) => [x.name, x.value]));\n  lines.push(\"• \" + (h.From || \"\") + \" — \" + (h.Subject || \"\") + \": \" + (d.snippet || \"\"));\n}\nreturn [{ count: lines.length, mails: lines.join(\"\\n\") || \"No unread mail today\" }];" }],
        ["aiChat", "AI summary", AI("Summarise emails in Hinglish. Important/urgent first. Max 8 bullets. Ignore promotions.", "{{ $json.count }} unread emails:\n{{ $json.mails }}", { temperature: 0.4, maxTokens: 500 })],
        tgText("📬 Inbox summary ({{ $node[\"Read mail details\"].json.count }} unread)\n\n{{ $json.text }}"),
      ]),
    },
    {
      id: "gmail-auto-reply", icon: "↩️", categories: ["Gmail", "AI Content"],
      title: "Gmail auto-reply (AI drafts → you approve)", title_hi: "Gmail auto-reply",
      summary: "Naye mails ke liye AI reply draft karta hai aur Telegram pe bhejta hai. Approve karke 'Send email' node ON karo to reply chala jayega.",
      runsIn: "full", needs: ["Google OAuth access token (gmail.readonly)", "AI key", "Telegram bot", "Full version: Gmail SMTP + App Password for sending"],
      honest: "Reply bhejna (SMTP email) sirf full version (PC/Termux) me chalta hai, Gmail App Password ke saath. Safety ke liye 'Send email' node OFF aata hai — pehle drafts check karo.",
      howTo: ["'Gmail token' node me token", "Keys page: AI, Telegram, Email (SMTP)", "▶ Run → Telegram pe drafts → theek lage to 'Send email' ON"],
      workflow: flow("Gmail auto-reply (AI drafts)", "New mails → AI reply drafts → Telegram → (optional) send", [
        ["manualTrigger", "Start", { testData: "{}" }],
        ["set", "Gmail token", { fields: "googleToken = PASTE_YOUR_GOOGLE_ACCESS_TOKEN\nmySignature = — Nishu", keepOld: false }],
        ["httpRequest", "List unread mails", { method: "GET", url: "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread%20category:primary%20newer_than:1d", headers: "Authorization: Bearer {{ $json.googleToken }}", body: "" }],
        ["code", "Read each mail", { code: "const token = $node[\"Gmail token\"].json.googleToken;\nconst list = (items[0] && items[0].data && items[0].data.messages) || [];\nconst out = [];\nfor (const m of list) {\n  const r = await fetch(\"https://gmail.googleapis.com/gmail/v1/users/me/messages/\" + m.id + \"?format=metadata&metadataHeaders=From&metadataHeaders=Subject\", { headers: { Authorization: \"Bearer \" + token } });\n  const d = await r.json();\n  const h = Object.fromEntries(((d.payload && d.payload.headers) || []).map((x) => [x.name, x.value]));\n  const email = ((h.From || \"\").match(/<([^>]+)>/) || [, h.From])[1];\n  out.push({ from: h.From, email, subject: h.Subject, snippet: d.snippet });\n}\nreturn out;" }],
        ["aiChat", "AI drafts reply", AI("You write short, polite email replies. Match the sender's language. Max 5 lines.", "From: {{ $json.from }}\nSubject: {{ $json.subject }}\nMail: {{ $json.snippet }}\n\nWrite my reply. End with: {{ $node[\"Gmail token\"].json.mySignature }}", { temperature: 0.5, maxTokens: 300 })],
        ["telegram", "Draft to Telegram", { operation: "text", text: "↩️ Draft reply to {{ $json.from }}\nRe: {{ $json.subject }}\n\n{{ $json.text }}", media: "", chatId: "", parseMode: "none", botToken: "" }],
        ["email", "Send email (OFF until you approve)", { to: "{{ $json.email }}", subject: "Re: {{ $json.subject }}", body: "{{ $json.text }}", html: false }, { disabled: true }],
      ]),
    },
    {
      id: "cartoon-lipsync", icon: "🎭", categories: ["Video", "YouTube", "Instagram"],
      title: "2D / 3D cartoon video with lip-sync", title_hi: "2D/3D cartoon lip-sync video",
      summary: "Script + character likho → tumhari video-AI API ko request jaati hai → talking cartoon video (lip-sync) ka job banta hai.",
      runsIn: "key", needs: ["APNI video-AI API key (paid ya free-trial) — kisi bhi talking-avatar / lip-sync provider se", "Provider ka API endpoint URL"],
      honest: "Ye FREE nahi hai: cartoon + lip-sync video banane ke liye tumhe apni video-AI provider ki API key chahiye (paid ya free trial). YantraFlow sirf request bhejta hai. HTTP node me provider ka URL + key daalo aur JSON fields uske docs ke hisaab se badlo. Zyada tar providers pehle job ID dete hain, video thodi der baad ready hoti hai.",
      howTo: ["Kisi video-AI provider pe account → API key lo", "'Video AI API' node me URL + 'Authorization: Bearer KEY' daalo", "'Build request' me fields provider ke docs jaise karo → ▶ Run"],
      workflow: flow("2D/3D cartoon lip-sync video", "Script → your video-AI API (lip-sync) → job/result", [
        ["manualTrigger", "Start (script + character)", { testData: JSON.stringify({ script: "Namaste dosto! Aaj main aapko 3 free AI tools bataunga jo aapka time bachayenge.", character: "cute 3D cartoon boy, big eyes, hoodie, Pixar style", style: "3D", voice: "hindi-male-young", aspect_ratio: "9:16" }, null, 2) }],
        ["code", "Build request", { code: "// Field names apne provider ke API docs ke hisaab se badlo\nreturn items.map((it) => ({\n  requestBody: JSON.stringify({\n    prompt: it.style + \" cartoon video: \" + it.character + \", talking to camera\",\n    script: it.script,\n    voice: it.voice,\n    aspect_ratio: it.aspect_ratio,\n    lip_sync: true\n  })\n}));" }],
        ["httpRequest", "Video AI API (your key)", { method: "POST", url: "https://YOUR-VIDEO-AI-PROVIDER.com/v1/generate", headers: "Authorization: Bearer YOUR_VIDEO_API_KEY\nContent-Type: application/json", body: "{{ $json.requestBody }}" }],
        ["log", "Provider answer", { message: "Status {{ $json.status }} → {{ $json.data }}" }],
      ]),
    },
    {
      id: "uptime-monitor", icon: "🚨", categories: ["Telegram"], fromTemplate: "uptime-monitor",
      title: "Website down alert → Telegram", title_hi: "Website down alert",
      summary: "Har 5 minute website check; down hui (status ≠ 200) to turant Telegram alert.",
      runsIn: "web", needs: ["Telegram bot"], honest: "Website pe tab khula rehna chahiye; 24×7 ke liye full version. Kuch sites browser checks block karti hain (CORS) — full version me sab chalta hai.",
      howTo: ["Keys page: Telegram", "URL node me apni site", "Active ON"],
    },
    {
      id: "reel-autopost", icon: "🎬", categories: ["Instagram", "Telegram"], fromTemplate: "reel-autopost",
      title: "Auto-post Reel to Instagram + Telegram at a time", title_hi: "Reel auto-post: Insta + Telegram",
      summary: "Roz 6 baje AI caption + hashtags likhta hai aur tumhari Reel Instagram + Telegram channel pe post karta hai.",
      runsIn: "setup", needs: ["Instagram Business/Creator account + Meta app token", "Video ka public https link", "AI key", "Telegram bot"],
      honest: "Instagram API sirf public video URL se post karta hai (phone ki file direct nahi). Meta developer app + token chahiye.",
      howTo: ["Keys page: Instagram, AI, Telegram", "'Set' node me video link + topic", "▶ Run / Active"],
    },
    {
      id: "folder-youtube", icon: "📤", categories: ["YouTube", "Video"], fromTemplate: "folder-youtube",
      title: "Auto YouTube upload from folder (AI title/desc/tags)", title_hi: "Folder → YouTube auto upload",
      summary: "Folder me video daalo → AI title, description, tags likhta hai → YouTube pe upload (private) → Telegram ping.",
      runsIn: "full", needs: ["Full version (PC/Termux)", "YouTube OAuth (client ID/secret + refresh token)", "AI key"],
      honest: "Browser tumhare folder ko dekh nahi sakta aur YouTube upload server se hota hai — ye sirf full version me chalega. Free quota ≈ 6 uploads/din.",
      howTo: ["Full version install karo", "Keys page: YouTube + AI", "Active ON — folder me video daalo"],
    },
    {
      id: "rss-ai-telegram", icon: "📰", categories: ["Telegram", "AI Content"], fromTemplate: "rss-ai-telegram",
      title: "News → AI summary → Telegram", title_hi: "News → AI summary → Telegram",
      summary: "Subah latest news padh ke AI har ek ki 2 line Hinglish summary Telegram pe bhejta hai.",
      runsIn: "full", needs: ["AI key", "Telegram bot"], honest: "Website pe kuch feeds browser block karti hain; full version me har feed chalti hai.",
      howTo: ["Keys page: AI + Telegram", "▶ Run"],
    },
    {
      id: "daily-quote", icon: "💡", categories: ["Telegram", "AI Content"], fromTemplate: "daily-quote",
      title: "Daily AI quote → Telegram", title_hi: "Daily AI quote → Telegram",
      summary: "Roz 7 baje AI naya motivational quote likh ke Telegram pe bhejta hai.",
      runsIn: "web", needs: ["AI key", "Telegram bot"], howTo: ["Keys page: AI + Telegram", "▶ Run, phir Active ON"],
    },
    {
      id: "webhook-ai-reply", icon: "🪝", categories: ["AI Content"], fromTemplate: "webhook-ai-reply",
      title: "Webhook → AI reply (your own AI API)", title_hi: "Webhook → AI reply",
      summary: "Apna AI API: kisi bhi app/bot se message bhejo, AI ka jawab wapas.",
      runsIn: "full", needs: ["Full version (webhook ke liye server)", "AI key"], howTo: ["Full version chalao", "POST localhost:5679/webhook/ask"],
    },
  ];
  // every project is FREE for now — change tier/price here later to make one paid
  for (const p of P) { p.tier = p.tier || "free"; p.price = p.price || 0; p.currency = p.currency || "INR"; }
  return P;
});

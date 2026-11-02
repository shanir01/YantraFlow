/* YantraFlow v4.5 core (no DOM): dropdown placement, Error Center explanations + workflow check,
   terminal command parser + website console. Shared by the browser and the tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YF45 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const s = (v) => (v === undefined || v === null ? "" : String(v));

  // ---------------------------------------------------------------- 1) dropdown placement
  /* anchor = {left, top, right, bottom} (button rect) · menu = {width, height} · view = {width, height}
     -> {left, top, maxHeight, placement: "below"|"above", align: "end"|"start"}
     Always directly under the button, right edge lined up with the button's right edge (like n8n / GitHub),
     moved left/right only as much as needed to stay inside the screen, flipped above only if it can't fit below. */
  function placeMenu(anchor, menu, view, opt) {
    const gap = (opt && opt.gap) != null ? opt.gap : 6; const pad = (opt && opt.pad) != null ? opt.pad : 8;
    const w = Math.min(menu.width, view.width - pad * 2);
    let align = "end"; let left = anchor.right - w;
    if (left < pad) { align = "start"; left = anchor.left; }
    left = Math.max(pad, Math.min(left, view.width - w - pad));
    const below = view.height - anchor.bottom - gap - pad; const above = anchor.top - gap - pad;
    let placement = "below"; let top = anchor.bottom + gap; let maxHeight = below;
    if (menu.height > below && above > below && above >= Math.min(menu.height, 160)) { placement = "above"; maxHeight = above; top = Math.max(pad, anchor.top - gap - Math.min(menu.height, above)); }
    return { left: Math.round(left), top: Math.round(top), width: Math.round(w), maxHeight: Math.max(120, Math.floor(maxHeight)), placement, align };
  }

  // ---------------------------------------------------------------- 2) Error Center: why + how to fix (Roman Hinglish)
  const RULES = [
    { id: "tg-url", re: /failed to get HTTP URL content|wrong (file identifier|remote file)|wrong type of the web page content/i, title: "Telegram link se file nahi utha paya",
      why: "Telegram ke server ne tumhara photo/video link khud download karne ki koshish ki, par link public direct file nahi tha (Google Drive page, localhost, blob: ya login wala link).",
      fix: ["Link browser ke private tab me kholo — seedha photo/video khulna chahiye (.jpg/.png/.mp4), koi page nahi.", "Google Drive/Dropbox share page nahi chalega — direct link do (jaise Pexels/Imgur ka file link).", "Website pe bani video (Auto Video Maker) ka link Telegram nahi le sakta — 'Send as file' wala option ya PC/Termux version use karo (wahan file upload hoti hai).", "Photo 10 MB aur video 50 MB se chhota rakho (URL wale upload ki Telegram limit)."] },
    { id: "tg-chat", re: /chat not found|PEER_ID_INVALID/i, title: "Telegram chat ID galat hai",
      why: "Bot ko ye chat/channel nahi mila: chat ID galat hai, ya tumne bot ko abhi tak message nahi kiya, ya channel me bot admin nahi hai.",
      fix: ["Apne bot ko Telegram me kholo aur /start bhejo.", "@userinfobot ko message karke apna number ID lo (jaise 123456789) — Keys → Telegram → Chat ID me daalo.", "Channel ke liye: bot ko channel ka Admin banao, chat ID @channelname ya -100… wala number do."] },
    { id: "tg-blocked", re: /bot was blocked by the user|bot can't initiate conversation|user is deactivated/i, title: "User ne bot block kiya / start nahi kiya",
      why: "Telegram bot khud pehla message nahi bhej sakta, aur block karne ke baad bhi nahi.", fix: ["Us user se bot pe /start dabwao (ya unblock karwao).", "Phir dobara Run karo."] },
    { id: "tg-token", re: /Telegram answered 40[14]|telegram.*unauthorized|Not Found.*bot/i, title: "Telegram bot token galat hai",
      why: "Bot token galat copy hua, ya @BotFather me revoke ho gaya.", fix: ["@BotFather → /mybots → apna bot → API Token → copy.", "Keys → Telegram → Bot token me paste karo (aage-peeche space nahi) → Save → Test."] },
    { id: "meta-token", re: /Error validating access token|Session has expired|access token.*(expired|invalid)|OAuthException|"code":\s*190|\b190\b.*token/i, title: "Instagram / Facebook token expire ho gaya",
      why: "Meta ke tokens kuch ghante (short-lived) ya 60 din (long-lived) me expire ho jaate hain, ya password badalne pe band ho jaate hain.",
      fix: ["developers.facebook.com → Graph API Explorer → naya token banao (instagram_content_publish, pages_manage_posts permissions).", "Access Token Debugger me 'Extend' karke 60 din wala token lo.", "Keys → Instagram/Facebook me naya token paste → Save."] },
    { id: "ig-media", re: /Media ID is not available|media is not ready|2207\d{3}|Unsupported (image|video)|aspect ratio/i, title: "Instagram media taiyaar nahi / format galat",
      why: "Instagram ko video process karne me time lagta hai, ya photo/video ka size/ratio Instagram ke rules ke bahar hai.",
      fix: ["Reel ke liye MP4 (H.264), 9:16, 3–90 sec rakho.", "Photo JPG ho, ratio 4:5 se 1.91:1 ke beech.", "Video bada ho to 1–2 min baad dobara Run karo."] },
    { id: "yt-grant", re: /invalid_grant|Token has been expired or revoked/i, title: "YouTube refresh token expire / revoke",
      why: "Google OAuth app 'Testing' mode me ho to refresh token 7 din me expire ho jata hai, ya tumne access hata diya.",
      fix: ["Google Cloud → OAuth consent screen → 'Publish app' (Production) karo.", "OAuth Playground se naya refresh token banao (scope youtube.upload).", "Keys → YouTube me naya refresh token paste."] },
    { id: "yt-quota", re: /quotaExceeded|exceeded your.*quota|uploadLimitExceeded/i, title: "YouTube ki daily limit khatam",
      why: "Free YouTube API quota roz ~6 uploads tak hota hai.", fix: ["Kal (Pacific time midnight ke baad) dobara chalao.", "Schedule ko din me 1–3 baar rakho."] },
    { id: "model-404", re: /model[_ ]not[_ ]found|model .*(not found|does not exist|decommissioned|not supported)|Unknown model|No endpoints found|is not a valid model|models\/[\w.-]+ is not found|model.*404|404.*model/i, title: "AI model ka naam galat / band ho gaya",
      why: "Ye model provider pe ab nahi hai (naam badal gaya ya band ho gaya), ya Base URL kisi aur provider ka hai.",
      fix: ["Node ya Keys page me 'Provider chuno' dropdown se Groq/Gemini chuno — sahi model apne aap bharega (Groq: openai/gpt-oss-120b, Gemini: gemini-3.8-flash).", "Ya Model box khaali chhod do (auto-pick).", "Base URL aur key ek hi company ki honi chahiye."] },
    { id: "supa-signup", re: /signups? (are )?(not allowed|disabled|turned off)|New signups are turned off/i, title: "Signup band hai",
      why: "Supabase project me 'Allow new users to sign up' OFF hai, ya Admin → Site customise me signup band kiya gaya hai.",
      fix: ["Supabase → Authentication → Sign In / Providers → 'Allow new users to sign up' ON → Save.", "Admin panel → Site customise → Signup ON.", "Page poora reload karke dobara try karo."] },
    { id: "smtp", re: /\b535\b|Username and Password not accepted|Invalid login/i, title: "Email login fail",
      why: "Gmail normal password se SMTP login nahi karne deta.", fix: ["myaccount.google.com/apppasswords se 16-letter App password banao (2-Step ON hona chahiye).", "Keys → Email me wahi App password daalo."] },
    { id: "x-paid", re: /X answered 40[23]|CreditsDepleted|client-not-enrolled|usage cap|Unsupported Authentication/i, title: "X (Twitter) posting allowed nahi",
      why: "X API se post karna ab paid hai; free app se post 402/403 deta hai, ya app ki permission 'Read' hai.", fix: ["developer.x.com → app → User authentication: Read and Write.", "Keys regenerate karke daalo; paid credits/plan check karo."] },
    { id: "auth", re: /\b(401|403)\b|invalid[_ ]api[_ ]key|incorrect api key|unauthori[sz]ed|forbidden|permission denied|API key not valid|invalid_auth|authentication/i, title: "Key / token galat ya permission nahi",
      why: "Service ne tumhari key/token mana kar di — galat copy hui, expire ho gayi, ya us kaam ki permission nahi hai.",
      fix: ["Keys page pe us service ka 'Kahan milega? (Guide)' kholo aur nayi key banao.", "Paste karte waqt aage-peeche space na ho.", "Save karke 'Test' dabao — Works aaye to dobara Run."] },
    { id: "rate", re: /\b429\b|rate[_ -]?limit|too many requests|resource[_ ]exhausted|quota/i, title: "Limit khatam (rate limit)",
      why: "Bahut jaldi-jaldi requests gayi ya free plan ki limit poori ho gayi.", fix: ["1–2 min ruk ke dobara chalao.", "Loop me 'Wait / Delay' node lagao (5–10 sec).", "AI ke liye dusra free provider chuno (Groq ↔ Gemini)."] },
    { id: "timeout", re: /timed? ?out|ETIMEDOUT|TimeoutError|AbortError|ESOCKETTIMEDOUT/i, title: "Time out — jawab nahi aaya",
      why: "Server ne time pe jawab nahi diya (slow internet, bada file, ya server down).", fix: ["Internet check karke dobara chalao.", "Bade video/photo ko chhota karo.", "Kuch der baad try karo — service busy ho sakti hai."] },
    { id: "ffmpeg", re: /ffmpeg.*(not found|ENOENT|not recognized)|spawn ffmpeg|ffprobe.*ENOENT/i, title: "ffmpeg install nahi hai",
      why: "Video wale nodes PC/Termux pe ffmpeg program se video banate hain, jo abhi install nahi hai.",
      fix: ["Termux: pkg install ffmpeg", "Windows: winget install ffmpeg (phir YantraFlow dobara start)", "Linux: sudo apt install ffmpeg · Mac: brew install ffmpeg", "Terminal tab me upar wala command chala sakte ho."] },
    { id: "dns", re: /ENOTFOUND|getaddrinfo|EAI_AGAIN|ECONNREFUSED|ECONNRESET|bad port|EHOSTUNREACH/i, title: "Server tak connection nahi bana",
      why: "URL ka domain nahi mila, internet band hai, ya wo server/port chal hi nahi raha (ECONNREFUSED).", fix: ["URL ki spelling check karo.", "Local server (jaise localhost:8787) chalu hai?", "Internet on karke dobara Run."] },
    { id: "localhost", re: /(browser could not reach|could not reach the ai at|failed to fetch|load failed)[^\n]*(localhost|127\.0\.0\.1)|(localhost|127\.0\.0\.1)[^\n]*(failed to fetch|mixed content|blocked)/i, title: "Website se localhost tak nahi pahunch sakte",
      why: "Website (https) browser ki security ki wajah se tumhare PC ke localhost (FreeLLM-Router/SangamAI) ko call nahi kar sakti.",
      fix: ["Website pe online provider use karo: Keys → AI → Provider: Groq ya Gemini.", "Localhost wala AI chahiye to YantraFlow PC/Termux pe chalao (npm start) aur wahi kholo."] },
    { id: "cors", re: /CORS|Failed to fetch|could not reach|NetworkError|Load failed|blocked by client/i, title: "Request nahi pahunchi (CORS / network)",
      why: "Kuch sites browser (website version) se direct call allow nahi karti, ya internet/URL ki dikkat hai.",
      fix: ["URL sahi hai? Browser me khol ke dekho.", "Ye node PC/Termux version me chalao — wahan CORS ki rok nahi hoti.", "Ad-blocker/VPN band karke try karo."] },
    { id: "expr", re: /Expression \{\{[\s\S]*\}\} failed|is not defined|Cannot read propert/i, title: "{{ }} expression galat",
      why: "Field me {{ $json.xyz }} likha hai par pichhle node ke output me wo field nahi hai, ya spelling galat hai.",
      fix: ["Node kholo → upar 'Fields from previous node' chips pe tap karke sahi field daalo.", "Pichhle node ko akela Run karke uska output dekho.", "Default do: {{ $json.title || 'kuch' }}"] },
    { id: "json", re: /Unexpected token|not valid JSON|JSON\.parse|in JSON at position|Row JSON galat/i, title: "JSON galat hai",
      why: "Kisi field me JSON format sahi nahi (comma, quotes \" \" ya bracket missing).", fix: ["Double quotes \" \" use karo, single ' ' nahi.", "Last item ke baad comma mat lagao.", "AI ka jawab ho to 'JSON Parse' node lagao — wo ```json``` saaf kar deta hai."] },
    { id: "empty", re: /is empty\.|is empty$|khaali|required/i, title: "Zaroori field khaali hai",
      why: "Node ka koi zaroori box (URL, token, chat ID, text…) khaali reh gaya.", fix: ["Error me jo field ka naam hai, node kholke bharo.", "Key wale field Keys page pe ek baar bhar do — har node me apne aap lag jayenge."] },
    { id: "pc-only", re: /full version|PC\/Termux|sirf PC|needs a server|Browsers cannot/i, title: "Ye kaam sirf PC/Termux pe chalta hai",
      why: "Browser me ye feature (file likhna, shell, SMTP, webhook, X/LinkedIn post…) allowed nahi hai.",
      fix: ["GitHub se YantraFlow download karo: github.com/shanir01/YantraFlow", "PC: start.bat / start.sh · Termux: pkg install nodejs git → git clone … → npm start", "Wahi workflow Export → PC version me Import karo."] },
    { id: "loop", re: /Loop detected/i, title: "Workflow me loop bana hai", why: "Koi node peeche wale node me wapas jud gaya hai — engine aage-peeche ghoomta reh jata.", fix: ["Wapas jaane wala arrow (connection) hatao.", "Baar-baar karna hai to 'Loop / Split Items' node use karo."] },
    { id: "no-trigger", re: /Add a trigger node|is not a trigger node/i, title: "Trigger node nahi hai", why: "Har workflow ek Trigger (Manual / Schedule / Webhook / Form…) se shuru hota hai.", fix: ["+ dabao → Trigger category → Manual Trigger ya Schedule jodo.", "Usse pehle node se arrow jodo."] },
    { id: "server", re: /\b50[0-4]\b|Internal Server Error|Bad Gateway|Service Unavailable/i, title: "Service ka server down hai", why: "Galti tumhari nahi — us company ka server abhi jawab nahi de raha.", fix: ["5–10 min baad dobara chalao.", "Bar-bar aaye to service ka status page dekho."] },
    { id: "notfound", re: /\b404\b|not found/i, title: "Cheez nahi mili (404)", why: "URL, ID ya naam galat hai — wo page/file/record exist nahi karta.", fix: ["URL/ID dobara copy karo.", "Browser me khol ke check karo ki link chal raha hai."] },
  ];
  const GENERIC = { id: "generic", title: "Node fail hua", why: "Is node ko chalate waqt upar wala error aaya.", fix: ["Error text dhyan se padho — kaunsa field/service bata raha hai.", "Node kholo → 'Kahan milega? (Guide)' / Setup guide dekho.", "Node ko akela test karo (pichhle node ka output sahi hai?).", "Phir bhi na chale to error copy karke GitHub issue ya Nishu ko bhejo."] };
  function explain(text) {
    const t = s(text);
    for (const r of RULES) if (r.re.test(t)) return { id: r.id, title: r.title, why: r.why, fix: r.fix.slice() };
    return Object.assign({}, GENERIC, { fix: GENERIC.fix.slice() });
  }
  /* Errors from one run -> Error Center rows (the failing node, else the run itself). */
  function fromExecution(ex, wf) {
    if (!ex || ex.status !== "error") return [];
    const rows = [];
    for (const n of ex.nodes || []) if (n.status === "error") rows.push({ key: `${ex.id}:${n.id}`, source: "run", at: ex.finishedAt || ex.startedAt || new Date().toISOString(), workflowId: ex.workflowId || (wf && wf.id) || null, workflowName: ex.workflowName || (wf && wf.name) || "", nodeId: n.id, nodeName: n.name, nodeType: n.type, error: n.error || ex.error, mode: ex.mode, executionId: ex.id });
    if (!rows.length) rows.push({ key: `${ex.id}:run`, source: "run", at: ex.finishedAt || new Date().toISOString(), workflowId: ex.workflowId || null, workflowName: ex.workflowName || "", nodeId: null, nodeName: "", nodeType: "", error: ex.error, mode: ex.mode, executionId: ex.id });
    return rows;
  }
  /* v4.6: the Error Center is per project and shows ONLY the latest run's errors (no history).
     A new run of workflow W replaces every old row of W (a successful run clears W). */
  function wfIdOf(ex, wf) { return (ex && ex.workflowId) || (wf && wf.id) || null; }
  function replaceRunErrors(list, ex, wf) {
    const wid = wfIdOf(ex, wf); const rows = fromExecution(ex, wf).map((r) => Object.assign({ resolved: false }, r, { workflowId: r.workflowId || wid }));
    const keep = (list || []).filter((e) => !wid || e.workflowId !== wid);
    return rows.concat(keep).slice(0, 200);
  }
  function errorsFor(list, wid) { return wid ? (list || []).filter((e) => e.workflowId === wid) : []; }
  /* "Check workflow": problems found before running. meta = node list, needs(wf, creds) = guide missing() */
  function lintWorkflow(wf, opt) {
    opt = opt || {}; const out = []; const meta = {}; for (const m of opt.meta || []) meta[m.type] = m;
    const nodes = ((wf && wf.nodes) || []).filter((n) => !n.disabled); const conns = (wf && wf.connections) || [];
    const row = (n, kind, error) => ({ key: `lint:${(wf && wf.id) || "new"}:${n ? n.id : "wf"}:${kind}`, source: "check", kind, at: new Date().toISOString(), workflowId: (wf && wf.id) || null, workflowName: (wf && wf.name) || "", nodeId: n ? n.id : null, nodeName: n ? n.name : "", nodeType: n ? n.type : "", error });
    if (!nodes.some((n) => meta[n.type] && meta[n.type].trigger)) out.push(row(null, "no-trigger", "Add a trigger node (Manual Trigger, Schedule, Webhook…) to start the workflow"));
    for (const n of nodes) {
      const m = meta[n.type];
      if (!m) { out.push(row(n, "unknown", `Unknown node type "${n.type}" — ye node is version me nahi hai`)); continue; }
      if (m.fullOnly && opt.edition === "web") out.push(row(n, "pc-only", `${m.label}: ${m.fullOnly}`));
      if (!m.trigger && m.inputs !== 0 && !conns.some((c) => c.to === n.id)) out.push(row(n, "unconnected", `"${n.name}" kisi node se juda nahi hai — ye kabhi nahi chalega (khaali input)`));
      for (const p of m.params || []) {
        const v = (n.params || {})[p.key];
        if (/^(url|webhookUrl)$/.test(p.key) && (v === undefined || s(v).trim() === "") && p.default === "" && !/Keys page/.test(p.label)) out.push(row(n, "empty:" + p.key, `${p.label} is empty.`));
      }
    }
    for (const miss of opt.missing || []) if (!miss.ok && !miss.optional) {
      const n = nodes.find((x) => (opt.sectionsOf ? opt.sectionsOf(x.type) : []).includes(miss.sec)) || null;
      out.push(row(n, "key:" + miss.sec, `${miss.title} missing — Keys page pe "${miss.title}" bharo (401/unauthorized aayega)`));
    }
    return out;
  }

  // ---------------------------------------------------------------- 3) Terminal
  /* "run \"Daily quote\" now" -> { cmd: "run", args: ["Daily quote", "now"] } */
  function parseCommand(line) {
    const t = s(line).trim(); const args = []; let cur = ""; let q = null; let any = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === q) q = null; else if (c === "\\" && t[i + 1] === q) { cur += q; i++; } else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; any = true; continue; }
      if (/\s/.test(c)) { if (cur || any) { args.push(cur); cur = ""; any = false; } continue; }
      cur += c;
    }
    if (cur || any) args.push(cur);
    return { cmd: (args.shift() || "").toLowerCase(), args, raw: t };
  }
  const CONSOLE_HELP = [
    ["help", "ye list"], ["list", "saare workflows (number + naam)"], ["run <naam ya number>", "workflow abhi chalao"], ["stop <naam ya number>", "chalta run / schedule roko"],
    ["logs [n]", "last runs (default 10)"], ["errors", "Error Center ke unresolved errors"], ["keys", "kaunsi keys bhari hain (secret kabhi nahi dikhata)"],
    ["status", "edition, schedules, browser/PC"], ["version", "YantraFlow version"], ["open <naam>", "editor me kholo"], ["clear", "screen saaf"],
  ];
  function pickWorkflow(list, q) {
    const t = s(q).trim(); if (!t) return null;
    if (/^\d+$/.test(t)) return list[Number(t) - 1] || null;
    const low = t.toLowerCase();
    return list.find((w) => s(w.name).toLowerCase() === low) || list.find((w) => s(w.name).toLowerCase().includes(low)) || null;
  }
  /* The website console. api: { listWorkflows, run(id), stop(id), runs(n), errors(), keys(), version, edition, open(id) }
     -> { lines: [ {t, cls} ], clear?: true } */
  async function consoleCommand(line, api) {
    const { cmd, args } = parseCommand(line); const L = []; const out = (t, cls) => L.push({ t: s(t), cls: cls || "" });
    if (!cmd) return { lines: L };
    if (cmd === "help" || cmd === "?") { out("YantraFlow console — commands:", "h"); for (const [c, d] of CONSOLE_HELP) out(`  ${c.padEnd(24)} ${d}`); if (api.edition !== "full") out("Website pe asli shell (git, npm, pkg) nahi chalta — wo PC/Termux version ke Terminal me milta hai.", "dim"); return { lines: L }; }
    if (cmd === "clear" || cmd === "cls") return { lines: [], clear: true };
    if (cmd === "version") { out(`YantraFlow v${api.version} · ${api.edition === "full" ? "PC/Termux (full)" : "Website (browser)"}`); return { lines: L }; }
    if (cmd === "list" || cmd === "ls") { const l = await api.listWorkflows(); if (!l.length) out("Koi workflow nahi. Projects se ek lo ya + New.", "dim"); l.forEach((w, i) => out(`  ${String(i + 1).padStart(2)}. ${w.name}${w.schedule && w.schedule.schedule && w.schedule.schedule.enabled ? "  [schedule ON]" : ""}${w.lastRun ? `  (last: ${w.lastRun.status})` : ""}`)); return { lines: L }; }
    if (cmd === "run" || cmd === "stop" || cmd === "open") {
      const l = await api.listWorkflows(); const w = pickWorkflow(l, args.join(" "));
      if (!w) { out(`Workflow nahi mila: "${args.join(" ")}". 'list' likh ke number dekho.`, "err"); return { lines: L }; }
      if (cmd === "open") { api.open(w.id); out(`Opening ${w.name}…`); return { lines: L }; }
      if (cmd === "stop") { await api.stop(w.id); out(`Stopped: ${w.name}`, "ok"); return { lines: L }; }
      out(`> running "${w.name}"…`, "dim");
      const ex = await api.run(w.id);
      for (const n of ex.nodes || []) out(`  ${n.status === "success" ? "ok " : n.status === "error" ? "ERR" : "-- "} ${n.name}${n.status === "success" ? ` (${n.outputCount} items, ${n.ms} ms)` : ""}${n.error ? " — " + n.error : ""}`, n.status === "error" ? "err" : n.status === "success" ? "ok" : "dim");
      for (const lg of (ex.logs || []).slice(-20)) out(`  [log] ${lg.node}: ${lg.msg}`, "dim");
      out(ex.status === "success" ? `Done in ${ex.durationMs} ms` : `Failed: ${ex.error || ex.status}  → 'errors' ya Error Center (bug icon) me fix dekho`, ex.status === "success" ? "ok" : "err");
      return { lines: L };
    }
    if (cmd === "logs") { const n = Math.min(50, Number(args[0]) || 10); const r = await api.runs(n); if (!r.length) out("Abhi koi run nahi.", "dim"); r.forEach((x) => out(`  ${s(x.startedAt).replace("T", " ").slice(0, 19)}  ${s(x.status).padEnd(8)} ${x.workflowName}${x.error ? " — " + s(x.error).slice(0, 140) : ""}`, x.status === "error" ? "err" : x.status === "success" ? "ok" : "")); return { lines: L }; }
    if (cmd === "errors") { const e = await api.errors(); if (!e.length) out("Koi unresolved error nahi.", "ok"); e.slice(0, 20).forEach((x) => { const h = explain(x.error); out(`  ${x.workflowName}${x.nodeName ? " › " + x.nodeName : ""}: ${s(x.error).slice(0, 160)}`, "err"); out(`     ${h.title} — fix: ${h.fix[0]}`, "dim"); }); return { lines: L }; }
    if (cmd === "keys") { const k = await api.keys(); for (const r of k) out(`  ${r.ok ? "[set]    " : "[missing]"} ${r.title}`, r.ok ? "ok" : "dim"); out("(Secret values kabhi print nahi hote.)", "dim"); return { lines: L }; }
    if (cmd === "status") { const st = await api.status(); for (const [k, v] of Object.entries(st)) out(`  ${k.padEnd(14)} ${v}`); return { lines: L }; }
    out(`Unknown command "${cmd}". 'help' likho.${api.edition !== "full" && /^(git|npm|pkg|node|ls|cd|apt|pip|python3?|ffmpeg|termux-\w+)$/.test(cmd) ? " Shell commands sirf PC/Termux version ke Terminal me chalte hain." : ""}`, "err");
    return { lines: L };
  }
  const QUICK_PC = ["git pull", "npm install", "pkg install ffmpeg", "node -v", "ls", "yf help"];
  const QUICK_WEB = ["help", "list", "logs", "errors", "keys", "status", "clear"];
  return { placeMenu, RULES, explain, fromExecution, replaceRunErrors, errorsFor, lintWorkflow, parseCommand, consoleCommand, pickWorkflow, CONSOLE_HELP, QUICK_PC, QUICK_WEB };
});

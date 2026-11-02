/* YantraFlow site core (pure functions, no DOM) — shared by the website and the tests.
   - DEFAULT_SETTINGS + mergeSettings(): site customisation with safe defaults
   - isAdminEmail() / adminGuard(): who may open #/admin (UI guard; the real lock is RLS + the admin Edge Function)
   - buildPageView(): the anonymous analytics row (no email, no user id, no IP, no query strings)
   - aggregateTraffic(): today / 7d / 30d, unique visitors, top pages, referrers, devices, daily chart
   - parseVideo(): YouTube link or uploaded file -> what the public Videos page renders
   - setupChecklist(): what is still missing in Supabase (SQL / bucket / function) */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YFSite = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PRIMARY_ADMIN = "shanir01.ai@gmail.com";
  const HEX = /^#[0-9a-f]{6}$/i;
  const DEFAULT_SETTINGS = Object.freeze({
    site_name: "YantraFlow",
    logo_url: "",
    primary_color: "#7c5cff",
    accent_color: "#00d4ff",
    hero_title: "Free automation for phone & PC",
    hero_subtitle: "Ready-made projects for Telegram, Instagram, YouTube, Gmail & AI — sab FREE.",
    banner_on: false,
    banner_text: "",
    banner_kind: "info",          // info | warn | ok
    footer_text: "Created by Nirbhay Sharma & Tab",
    contact_email: "shanir01.ai@gmail.com",
    social: Object.freeze({ instagram: "", youtube: "https://www.youtube.com/@JavaGoat9", telegram: "https://t.me/javagoat", github: "https://github.com/shanir01" }),
    signups_enabled: true,
    signups_off_message: "Abhi naye signup band hain. Thodi der baad try karo.",
    maintenance_on: false,
    maintenance_text: "Site par maintenance chal raha hai — kuch features thodi der ke liye slow ho sakte hain.",
    videos_enabled: true,
    analytics_enabled: true,
    premium_note_on: true,         // "Localhost (PC/Termux) pe aur PREMIUM options" note on the website
    premium_note_text: "",         // "" = default text
  });
  const BOOL_KEYS = ["banner_on", "signups_enabled", "maintenance_on", "videos_enabled", "analytics_enabled", "premium_note_on"];
  const TEXT_LIMITS = { site_name: 40, hero_title: 120, hero_subtitle: 240, banner_text: 240, footer_text: 200, contact_email: 120, signups_off_message: 240, maintenance_text: 240, logo_url: 600, premium_note_text: 240 };

  function safeUrl(u) {
    const s = String(u == null ? "" : u).trim();
    if (!s) return "";
    return /^https:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 600 ? s : "";
  }
  // Any stored object (or nothing, or garbage) -> a complete, safe settings object.
  function mergeSettings(raw) {
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of Object.keys(TEXT_LIMITS)) {
      if (typeof raw[k] === "string") out[k] = raw[k].trim().slice(0, TEXT_LIMITS[k]);
    }
    if (!out.site_name) out.site_name = DEFAULT_SETTINGS.site_name;
    out.logo_url = safeUrl(out.logo_url);
    if (out.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact_email)) out.contact_email = DEFAULT_SETTINGS.contact_email;
    for (const k of ["primary_color", "accent_color"]) if (typeof raw[k] === "string" && HEX.test(raw[k].trim())) out[k] = raw[k].trim().toLowerCase();
    for (const k of BOOL_KEYS) if (typeof raw[k] === "boolean") out[k] = raw[k];
    if (["info", "warn", "ok"].includes(raw.banner_kind)) out.banner_kind = raw.banner_kind;
    if (raw.social && typeof raw.social === "object") for (const k of Object.keys(out.social)) if (typeof raw.social[k] === "string") out.social[k] = safeUrl(raw.social[k]);
    return out;
  }
  // v4.3: the "run on localhost for PREMIUM options" note. Only on the website edition, admin can hide / reword it, user can dismiss it.
  const PREMIUM_DEFAULT = "Localhost (PC/Termux) pe chalao to aur PREMIUM options milenge — free me:";
  const PREMIUM_FEATURES = ["24x7 schedule (website tab band ho tab bhi chalta rahe)", "Auto Video Maker MP4 + AI voice (edge-tts) — Instagram Reels ready", "English → Hindi captions + Hindi voice dub (Video Editor)", "X (Twitter), LinkedIn, Slack, Email post + Instagram video file upload", "Unlimited link preview (website pe ~50/din)", "Folder watch, webhooks, local files read/write"];
  function premiumNote(settings, edition, dismissed) {
    const s = mergeSettings(settings);
    if (edition !== "web" || !s.premium_note_on || dismissed) return null;
    return { text: s.premium_note_text || PREMIUM_DEFAULT, features: PREMIUM_FEATURES.slice() };
  }
  // CSS variables to apply for a settings object.
  function themeVars(s) {
    s = s || DEFAULT_SETTINGS;
    return { "--a1": s.primary_color, "--a2": s.accent_color, "--grad": `linear-gradient(135deg,${s.primary_color} 0%,${s.accent_color} 100%)` };
  }

  // ---------------------------------------------------------------- admin guard
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function adminList(extra) {
    const list = [PRIMARY_ADMIN];
    for (const e of Array.isArray(extra) ? extra : String(extra || "").split(/[,\s]+/)) { const n = normEmail(e); if (n && n.includes("@") && !list.includes(n)) list.push(n); }
    return list;
  }
  function isAdminEmail(email, extra) { const e = normEmail(email); return !!e && adminList(extra).includes(e); }
  // user = Supabase user (or null), me = row from yf_me() (or null), extra = window.YF_ADMIN_EMAILS
  function adminGuard(user, me, extra) {
    if (!user || !user.email) return { ok: false, reason: "login" };
    if (me && me.blocked) return { ok: false, reason: "blocked" };
    if (isAdminEmail(user.email, extra)) return { ok: true, reason: "email" };
    if (me && me.is_admin === true) return { ok: true, reason: "db" };
    return { ok: false, reason: "not_admin" };
  }

  // ---------------------------------------------------------------- analytics
  const TZ_COUNTRY = { "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Kathmandu": "NP", "Asia/Katmandu": "NP", "Asia/Colombo": "LK", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Singapore": "SG", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Europe/London": "GB", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Moscow": "RU", "Africa/Lagos": "NG", "Africa/Cairo": "EG", "Africa/Nairobi": "KE", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX" };
  function countryFromTz(tz) {
    if (!tz) return "";
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Anchorage|Indiana)/.test(tz)) return "US";
    return "";
  }
  function deviceOf(ua) {
    const u = String(ua || "");
    if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(u)) return "tablet";
    if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(u)) return "mobile";
    return "desktop";
  }
  // "#/editor/abc123?x" -> "/editor/:id". Private ids and share codes never leave the device.
  function cleanPath(hash) {
    let h = String(hash || "").replace(/^#/, "").split("?")[0].split("&")[0];
    if (!h || h === "/" || /^access_token=|^error=|^type=/.test(h)) return "/";
    if (!h.startsWith("/")) h = "/" + h;
    const parts = h.split("/").filter(Boolean).slice(0, 3);
    const v = parts[0] || "";
    if (["editor", "runs", "share"].includes(v) && parts[1]) return "/" + v + "/:id";
    if (v === "project" && parts[1]) return "/project/" + parts[1].replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
    if (v === "admin") return "/admin";
    return ("/" + parts.map((p) => p.replace(/[^a-z0-9_-]/gi, "").slice(0, 40)).join("/")).slice(0, 120) || "/";
  }
  function refHost(ref, ownHost) {
    try {
      if (!ref) return "direct";
      const h = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
      if (!h || (ownHost && h === String(ownHost).replace(/^www\./, "").toLowerCase())) return "direct";
      return h.slice(0, 100);
    } catch (_) { return "direct"; }
  }
  // The only fields that are sent. No email, user id, IP or full URL.
  function buildPageView(o) {
    o = o || {};
    const vid = String(o.visitorId || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
    return {
      path: cleanPath(o.hash),
      referrer: refHost(o.referrer, o.host),
      device: deviceOf(o.ua),
      country: countryFromTz(o.tz),
      visitor_id: vid || "anon",
    };
  }

  // rows: [{created_at, path, referrer, device, country, visitor_id}]
  function dayKey(d, tzOffsetMin) { const t = new Date(new Date(d).getTime() - (tzOffsetMin || 0) * 60000); return t.toISOString().slice(0, 10); }
  function topN(map, n) { return Object.entries(map).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([key, count]) => ({ key, count })); }
  function aggregateTraffic(rows, now, opts) {
    opts = opts || {};
    const off = opts.tzOffsetMin == null ? -330 : opts.tzOffsetMin; // Asia/Kolkata by default (getTimezoneOffset sign)
    now = now ? new Date(now) : new Date();
    const today = dayKey(now, off);
    const days = []; for (let i = 29; i >= 0; i--) days.push(dayKey(now.getTime() - i * 86400000, off));
    const in7 = new Set(days.slice(-7)), in30 = new Set(days);
    const res = { today: 0, d7: 0, d30: 0, u_today: 0, u7: 0, u30: 0, daily: [], topPages: [], referrers: [], devices: { mobile: 0, tablet: 0, desktop: 0 }, countries: [] };
    const U = { t: new Set(), w: new Set(), m: new Set() }, perDay = {}, perDayU = {}, pages = {}, refs = {}, ctry = {};
    for (const r of rows || []) {
      if (!r || !r.created_at) continue;
      const k = dayKey(r.created_at, off);
      if (!in30.has(k)) continue;
      const v = r.visitor_id || "anon";
      res.d30++; U.m.add(v);
      if (in7.has(k)) { res.d7++; U.w.add(v); }
      if (k === today) { res.today++; U.t.add(v); }
      perDay[k] = (perDay[k] || 0) + 1; (perDayU[k] = perDayU[k] || new Set()).add(v);
      pages[r.path || "/"] = (pages[r.path || "/"] || 0) + 1;
      refs[r.referrer || "direct"] = (refs[r.referrer || "direct"] || 0) + 1;
      const d = ["mobile", "tablet", "desktop"].includes(r.device) ? r.device : "desktop"; res.devices[d]++;
      if (r.country) ctry[r.country] = (ctry[r.country] || 0) + 1;
    }
    res.u_today = U.t.size; res.u7 = U.w.size; res.u30 = U.m.size;
    res.daily = days.map((d) => ({ day: d, views: perDay[d] || 0, uniques: perDayU[d] ? perDayU[d].size : 0 }));
    res.topPages = topN(pages, 8); res.referrers = topN(refs, 8); res.countries = topN(ctry, 8);
    return res;
  }

  // ---------------------------------------------------------------- videos
  function youtubeId(u) {
    const s = String(u || "").trim();
    let m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
  }
  // row from the videos table -> what to render (or null if unusable)
  function parseVideo(row) {
    if (!row) return null;
    const title = String(row.title || "").slice(0, 140) || "Video";
    const description = String(row.description || "").slice(0, 600);
    if (row.kind === "file") { const url = safeUrl(row.url); return url ? { kind: "file", title, description, src: url } : null; }
    const id = youtubeId(row.url);
    if (!id) return null;
    return { kind: "youtube", title, description, id, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, watch: `https://www.youtube.com/watch?v=${id}` };
  }
  function sortVideos(rows, includeHidden) {
    return (rows || []).filter((r) => r && (includeHidden || r.visible !== false)).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }

  // ---------------------------------------------------------------- setup checklist
  // r = { sql: bool, profiles: bool, pageViews: bool, videos: bool, settings: bool, bucket: bool, fn: "ok"|"missing"|"forbidden"|"error", isAdminDb: bool, cloud: bool }
  function isMissingTable(err) {
    if (!err) return false;
    const s = (String(err.code || "") + " " + String(err.message || "")).toLowerCase();
    return s.includes("42p01") || s.includes("pgrst205") || s.includes("pgrst202") || s.includes("42883") || s.includes("could not find the") || s.includes("does not exist") || s.includes("schema cache");
  }
  function setupChecklist(r) {
    r = r || {};
    const items = [
      { id: "sql", ok: !!(r.settings && r.pageViews && r.videos && r.profiles), title: "SQL: tables + security (supabase/admin.sql)", fix: "Supabase → SQL Editor → New query → supabase/admin.sql paste → Run" },
      { id: "bucket", ok: !!r.bucket, title: "Storage bucket \"videos\" + \"site\" (logo)", fix: "Same admin.sql banata hai. Na bane to: Storage → New bucket → videos (Public ON)" },
      { id: "fn", ok: r.fn === "ok", title: "Edge Function \"admin\" (users list / delete / block)", fix: r.fn === "forbidden" ? "Function chal raha hai par aapko admin nahi maan raha — ADMIN_EMAILS secret me apna email daalo" : "Supabase → Edge Functions → Deploy new function → name: admin → code paste → Verify JWT OFF → Deploy" },
      { id: "admin", ok: !!r.isAdminDb, title: "Database me aap admin ho", fix: "admin.sql me shanir01.ai@gmail.com pehle se admin hai — SQL dobara Run karo" },
      { id: "cloud", ok: !!r.cloud, optional: true, title: "Cloud sync table (workflow count ke liye)", fix: "docs/supabase-setup.sql bhi SQL Editor me Run karo" },
    ];
    const need = items.filter((i) => !i.ok && !i.optional);
    return { items, ready: need.length === 0, pending: need.length };
  }

  return { premiumNote, PREMIUM_FEATURES, PREMIUM_DEFAULT, PRIMARY_ADMIN, DEFAULT_SETTINGS, mergeSettings, themeVars, safeUrl, adminList, isAdminEmail, adminGuard, deviceOf, cleanPath, refHost, countryFromTz, buildPageView, aggregateTraffic, dayKey, youtubeId, parseVideo, sortVideos, isMissingTable, setupChecklist };
});
